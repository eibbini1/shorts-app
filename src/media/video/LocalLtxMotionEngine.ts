import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ConfigError, RenderError } from '../../shared/errors.js';
import {
  motionRequestIssues,
  type MotionConditioningAsset,
  type MotionEngine,
  type MotionEngineCapabilities,
  type MotionRequest,
  type MotionRunManifest,
} from './MotionEngine.js';
import {
  scenarioShotToMotionRequest,
  type ScenarioToMotionOptions,
  type ScenarioV1,
} from './ScenarioV1.js';

const execFileAsync = promisify(execFile);

export const LOCAL_LTX_CAPABILITIES: MotionEngineCapabilities = {
  engineId: 'ltx-2.3-local',
  provider: 'local-mlx',
  model: 'ltx-2.3-distilled',
  modelRevision: '2026-11',
  adapterVersion: '1',
  workerVersion: '1',
  modes: ['t2v', 'i2v_first_frame', 'i2v_first_last_frame'],
  dimensions: {
    minWidth: 384,
    maxWidth: 1280,
    minHeight: 384,
    maxHeight: 1280,
    multipleOf: 32,
    aspectRatios: ['9:16', '16:9'],
  },
  duration: {
    minSeconds: 1,
    maxSeconds: 6,
    minFrames: 25,
    maxFrames: 145,
    frameStep: 8,
    frameOffset: 1,
    frameRates: [24],
  },
  nativeAudio: false,
  seed: {
    supported: true,
    determinism: 'best-effort',
  },
};

export interface LocalLtxProbeResult {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSeconds: number;
}

export type LocalLtxCommandRunner = (
  cliPath: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<void>;

export type LocalLtxVideoProbe = (videoPath: string) => Promise<LocalLtxProbeResult>;

export interface LocalLtxMotionEngineOptions {
  outputDir: string;
  assetRoot?: string;
  cliPath?: string;
  modelDir: string;
  gemmaDir: string;
  cwd?: string;
  timeoutMs?: number;
  runner?: LocalLtxCommandRunner;
  probe?: LocalLtxVideoProbe;
}

interface ResolvedConditioning {
  asset: MotionConditioningAsset;
  localPath: string;
}

function sha256Hex(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function isInsideRoot(candidate: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(resolvedRoot + path.sep)
  );
}

function uriToLocalPath(uri: string, baseDir: string): string {
  if (uri.startsWith('file://')) {
    return fileURLToPath(uri);
  }
  return path.isAbsolute(uri) ? path.resolve(uri) : path.resolve(baseDir, uri);
}

async function defaultRunner(
  cliPath: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number },
): Promise<void> {
  await execFileAsync(cliPath, [...args], {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function defaultProbe(videoPath: string): Promise<LocalLtxProbeResult> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,nb_frames,r_frame_rate:format=duration',
      '-of', 'json',
      videoPath,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number; nb_frames?: string; r_frame_rate?: string }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) {
    throw new RenderError(`Local LTX output is missing a valid video stream: ${videoPath}`);
  }
  const [num = 24, den = 1] = (stream.r_frame_rate ?? '24/1').split('/').map(Number);
  const fps = den > 0 ? num / den : 24;
  const frameCount = Number(stream.nb_frames ?? 0);
  const durationSeconds = Number(parsed.format?.duration ?? (frameCount > 0 ? frameCount / fps : 0));
  return {
    width: stream.width,
    height: stream.height,
    fps,
    frameCount,
    durationSeconds,
  };
}

export function scenarioShotToLocalLtxRequest(
  scenario: ScenarioV1,
  shotIndex: number,
  options: Omit<ScenarioToMotionOptions, 'capabilities'> = {},
): MotionRequest {
  const isWide = scenario.settings.format === 'long' || scenario.settings.format === 'wide';
  // Exact 9:16 / 16:9 multiples of 32 satisfy both LTX two-stage constraints and MotionEngine's aspect tolerance.
  const defaultWidth = isWide ? 1024 : 576;
  const defaultHeight = isWide ? 576 : 1024;
  return scenarioShotToMotionRequest(scenario, shotIndex, {
    width: options.width ?? defaultWidth,
    height: options.height ?? defaultHeight,
    fps: options.fps ?? 24,
    capabilities: LOCAL_LTX_CAPABILITIES,
    ...options,
  });
}

export class LocalLtxMotionEngine implements MotionEngine {
  readonly capabilities: MotionEngineCapabilities = LOCAL_LTX_CAPABILITIES;

  private readonly outputDir: string;
  private readonly assetRoot: string;
  private readonly cliPath: string;
  private readonly modelDir: string;
  private readonly gemmaDir: string;
  private readonly cwd: string;
  private readonly timeoutMs: number;
  private readonly runner: LocalLtxCommandRunner;
  private readonly probe: LocalLtxVideoProbe;

  constructor(options: LocalLtxMotionEngineOptions) {
    if (!options.outputDir.trim() || !options.modelDir.trim() || !options.gemmaDir.trim()) {
      throw new ConfigError('LocalLtxMotionEngine requires non-empty outputDir, modelDir, and gemmaDir.');
    }
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.outputDir = path.resolve(this.cwd, options.outputDir);
    this.assetRoot = path.resolve(this.cwd, options.assetRoot ?? path.dirname(this.outputDir));
    this.cliPath = options.cliPath
      ?? (process.env.SHORTS_LTX_CLI?.trim() || path.join(this.cwd, 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx'));
    this.modelDir = options.modelDir;
    this.gemmaDir = options.gemmaDir;
    this.timeoutMs = options.timeoutMs ?? 15 * 60_000;
    this.runner = options.runner ?? defaultRunner;
    this.probe = options.probe ?? defaultProbe;
  }

  private async resolveConditioning(
    assets: readonly MotionConditioningAsset[],
  ): Promise<ResolvedConditioning[]> {
    const resolved: ResolvedConditioning[] = [];
    for (const asset of assets) {
      const localPath = uriToLocalPath(asset.uri, this.assetRoot);
      if (!isInsideRoot(localPath, this.assetRoot)) {
        throw new ConfigError(`Conditioning asset escapes allowed asset root: ${asset.uri}`);
      }
      let content: Buffer;
      try {
        content = await readFile(localPath);
      } catch (error) {
        throw new ConfigError(`Conditioning asset could not be read: ${localPath}`, {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      const actualSha = sha256Hex(content);
      if (actualSha.toLowerCase() !== asset.sha256.toLowerCase()) {
        throw new ConfigError(
          `Conditioning asset checksum mismatch for ${path.basename(localPath)}: expected ${asset.sha256}, got ${actualSha}`,
        );
      }
      resolved.push({ asset, localPath });
    }
    return resolved;
  }

  buildArgs(
    request: MotionRequest,
    conditioning: readonly ResolvedConditioning[],
    outputPath: string,
  ): string[] {
    const args: string[] = [
      'generate',
      '--model', this.modelDir,
      '--gemma', this.gemmaDir,
      '--distilled',
      '--low-ram',
      '--no-audio',
    ];
    if (request.seed !== undefined) {
      args.push('--seed', String(request.seed));
    }
    const first = conditioning.find((entry) => entry.asset.role === 'first-frame');
    const last = conditioning.find((entry) => entry.asset.role === 'last-frame');
    if (first) {
      args.push('--image', first.localPath, '0', '1.0');
    }
    if (last) {
      args.push('--image', last.localPath, String(request.frameCount - 1), '1.0');
    }
    args.push(
      '--prompt', request.prompt.trim(),
      '-H', String(request.height),
      '-W', String(request.width),
      '-f', String(request.frameCount),
      '--frame-rate', String(request.fps),
      '-o', outputPath,
    );
    return args;
  }

  private cacheFilePath(request: MotionRequest): string {
    const identity = {
      engineId: this.capabilities.engineId,
      modelDir: this.modelDir,
      gemmaDir: this.gemmaDir,
      mode: request.mode,
      prompt: request.prompt.trim(),
      width: request.width,
      height: request.height,
      fps: request.fps,
      frameCount: request.frameCount,
      seed: request.seed ?? null,
      conditioning: request.conditioning.map((c) => ({ kind: c.kind, role: c.role, sha256: c.sha256.toLowerCase() })),
    };
    const key = sha256Hex(JSON.stringify(identity)).slice(0, 16);
    const target = path.resolve(this.outputDir, `ltx-${key}.mp4`);
    if (!isInsideRoot(target, this.outputDir)) {
      throw new ConfigError('Computed output path escapes outputDir.');
    }
    return target;
  }

  private async probeMatchesRequest(
    outputPath: string,
    request: MotionRequest,
  ): Promise<LocalLtxProbeResult | null> {
    try {
      const probed = await this.probe(outputPath);
      if (
        probed.width === request.width &&
        probed.height === request.height &&
        probed.frameCount === request.frameCount &&
        Math.abs(probed.fps - request.fps) <= 0.5
      ) {
        return probed;
      }
      return null;
    } catch {
      return null;
    }
  }

  async generate(request: MotionRequest): Promise<MotionRunManifest> {
    const issues = motionRequestIssues(request, this.capabilities);
    if (issues.length > 0) {
      throw new ConfigError(`Invalid LocalLtxMotionEngine request: ${issues.join('; ')}`, { issues });
    }

    const submittedAt = new Date();
    const resolvedConditioning = await this.resolveConditioning(request.conditioning);
    await mkdir(this.outputDir, { recursive: true });
    const outputPath = this.cacheFilePath(request);

    const startedAt = new Date();
    let probed = await this.probeMatchesRequest(outputPath, request);
    if (!probed) {
      const args = this.buildArgs(request, resolvedConditioning, outputPath);
      await this.runner(this.cliPath, args, { cwd: this.cwd, timeoutMs: this.timeoutMs });
      probed = await this.probeMatchesRequest(outputPath, request);
      if (!probed) {
        throw new RenderError(`Local LTX output failed verification at ${outputPath}`);
      }
    }
    const completedAt = new Date();
    const outputBytes = await readFile(outputPath);

    return {
      version: 1,
      runId: randomUUID(),
      ...(request.caseId !== undefined ? { caseId: request.caseId } : {}),
      engine: {
        engineId: this.capabilities.engineId,
        provider: this.capabilities.provider,
        model: this.capabilities.model,
        modelRevision: this.capabilities.modelRevision,
        adapterVersion: this.capabilities.adapterVersion,
        workerVersion: this.capabilities.workerVersion,
      },
      request: {
        promptSha256: sha256Hex(request.prompt.trim()),
        mode: request.mode,
        width: request.width,
        height: request.height,
        fps: request.fps,
        frameCount: request.frameCount,
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
        audio: request.audio,
        conditioning: request.conditioning.map((c) => ({
          kind: c.kind,
          role: c.role,
          sha256: c.sha256,
        })),
      },
      timing: {
        submittedAt: submittedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        queueDurationMs: Math.max(0, startedAt.getTime() - submittedAt.getTime()),
        generationDurationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
      output: {
        path: outputPath,
        sha256: sha256Hex(outputBytes),
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
        frameCount: probed.frameCount,
        durationSeconds: probed.durationSeconds,
      },
    };
  }
}
