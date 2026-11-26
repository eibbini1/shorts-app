import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../../shared/errors.js';
import { MotionEngineRegistry, motionRequestIssues } from '../MotionEngine.js';
import {
  LOCAL_LTX_CAPABILITIES,
  LocalLtxMotionEngine,
  scenarioShotToLocalLtxRequest,
} from '../LocalLtxMotionEngine.js';
import { parseScenarioV1 } from '../ScenarioV1.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const EXAMPLE_SCENARIO = path.join(REPO_ROOT, 'examples/local-scenarios/first-cold-night-10.local-scenario.json');

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'local-ltx-adapter-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('LocalLtxMotionEngine adapter', () => {
  it('registers into MotionEngineRegistry, consumes a real ScenarioV1 shot, caches valid clips, and emits MotionRunManifest', async () => {
    const root = await makeTempDir();
    const refsDir = path.join(root, 'refs');
    const outDir = path.join(root, 'motion');
    const firstFrame = path.join(refsDir, 'shot-00.png');
    const lastFrame = path.join(refsDir, 'shot-01.png');
    await writeFile(path.join(root, 'sentinel.txt'), 'ok');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(refsDir, { recursive: true });
    const firstBytes = Buffer.from('fake-first-frame-png');
    const lastBytes = Buffer.from('fake-last-frame-png');
    await writeFile(firstFrame, firstBytes);
    await writeFile(lastFrame, lastBytes);
    const firstSha = createHash('sha256').update(firstBytes).digest('hex');
    const lastSha = createHash('sha256').update(lastBytes).digest('hex');

    const scenario = parseScenarioV1(JSON.parse(await readFile(EXAMPLE_SCENARIO, 'utf8')));
    const request = scenarioShotToLocalLtxRequest(scenario, 0, {
      caseId: 'cold-night-shot-0',
      mode: 'i2v_first_last_frame',
      seed: 2200,
      conditioning: [
        { kind: 'image', role: 'first-frame', uri: pathToFileURL(firstFrame).href, sha256: firstSha },
        { kind: 'image', role: 'last-frame', uri: pathToFileURL(lastFrame).href, sha256: lastSha },
      ],
    });
    expect(motionRequestIssues(request, LOCAL_LTX_CAPABILITIES)).toEqual([]);

    const invokedArgs: string[][] = [];
    const runner = vi.fn(async (_cli: string, args: readonly string[]) => {
      invokedArgs.push([...args]);
      const outIndex = args.indexOf('-o');
      const outputPath = args[outIndex + 1]!;
      await writeFile(outputPath, Buffer.from('fake-mp4-video-bytes'));
    });

    const probe = vi.fn(async (videoPath: string) => {
      const content = await readFile(videoPath);
      expect(content.length).toBeGreaterThan(0);
      return {
        width: request.width,
        height: request.height,
        fps: request.fps,
        frameCount: request.frameCount,
        durationSeconds: request.frameCount / request.fps,
      };
    });

    const engine = new LocalLtxMotionEngine({
      outputDir: outDir,
      assetRoot: root,
      cliPath: '/fake/bin/ltx-2-mlx',
      modelDir: '/fake/models/ltx',
      gemmaDir: '/fake/models/gemma',
      cwd: root,
      runner,
      probe,
    });

    const registry = new MotionEngineRegistry();
    registry.register(engine);
    expect(registry.compatibleEngineIds(request)).toEqual(['ltx-2.3-local']);

    const manifest1 = await registry.generate('ltx-2.3-local', request);
    expect(manifest1.version).toBe(1);
    expect(manifest1.engine.engineId).toBe('ltx-2.3-local');
    expect(manifest1.output.width).toBe(576);
    expect(manifest1.output.height).toBe(1024);
    expect(manifest1.output.frameCount).toBe(request.frameCount);
    expect(manifest1.output.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(runner).toHaveBeenCalledTimes(1);

    const args = invokedArgs[0]!;
    expect(args).toContain('--distilled');
    expect(args).toContain('--no-audio');
    expect(args).toContain(firstFrame);
    expect(args).toContain(lastFrame);
    expect(args).toContain(String(request.frameCount - 1));

    // Second identical call reuses the verified cached clip without invoking LTX again.
    const manifest2 = await registry.generate('ltx-2.3-local', request);
    expect(manifest2.output.path).toBe(manifest1.output.path);
    expect(manifest2.output.sha256).toBe(manifest1.output.sha256);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('fails closed on conditioning path traversal and SHA-256 mismatch before invoking LTX', async () => {
    const outer = await makeTempDir();
    const assetRoot = path.join(outer, 'sandbox');
    const outDir = path.join(assetRoot, 'motion');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(assetRoot, { recursive: true });

    const outsideFile = path.join(outer, 'secret.png');
    await writeFile(outsideFile, Buffer.from('outside'));
    const insideFile = path.join(assetRoot, 'frame.png');
    await writeFile(insideFile, Buffer.from('actual-bytes'));

    const runner = vi.fn(async () => undefined);
    const engine = new LocalLtxMotionEngine({
      outputDir: outDir,
      assetRoot,
      cliPath: '/fake/bin/ltx-2-mlx',
      modelDir: '/fake/models/ltx',
      gemmaDir: '/fake/models/gemma',
      cwd: assetRoot,
      runner,
    });

    const scenario = parseScenarioV1(JSON.parse(await readFile(EXAMPLE_SCENARIO, 'utf8')));
    const escapeReq = scenarioShotToLocalLtxRequest(scenario, 0, {
      mode: 'i2v_first_frame',
      conditioning: [
        {
          kind: 'image',
          role: 'first-frame',
          uri: '../secret.png',
          sha256: createHash('sha256').update('outside').digest('hex'),
        },
      ],
    });
    await expect(engine.generate(escapeReq)).rejects.toThrow(ConfigError);
    expect(runner).not.toHaveBeenCalled();

    const tamperedReq = scenarioShotToLocalLtxRequest(scenario, 0, {
      mode: 'i2v_first_frame',
      conditioning: [
        {
          kind: 'image',
          role: 'first-frame',
          uri: insideFile,
          sha256: '0'.repeat(64),
        },
      ],
    });
    await expect(engine.generate(tamperedReq)).rejects.toThrow(/checksum mismatch/);
    expect(runner).not.toHaveBeenCalled();
  });
});
