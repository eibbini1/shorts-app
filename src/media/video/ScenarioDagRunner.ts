import { ConfigError } from '../../shared/errors.js';
import type {
  MotionEngine,
  MotionEngineCapabilities,
  MotionRequest,
  MotionRunManifest,
} from './MotionEngine.js';
import {
  scenarioShotToMotionRequest,
  type ScenarioToMotionOptions,
  type ScenarioV1,
} from './ScenarioV1.js';

export type ShotContinuityMode = 'independent' | 'identity' | 'previous-end';

export interface ShotDagNode {
  shotIndex: number;
  seconds: number;
  nativeFrames: number;
  dependsOn: readonly number[];
  continuityMode: ShotContinuityMode;
}

export interface PlanShotDagOptions {
  continuityMode?: ShotContinuityMode;
  fps?: number;
  capabilities?: MotionEngineCapabilities;
}

export interface ShotTimingEntry {
  shotIndex: number;
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
}

export interface ScenarioDagRunResult {
  nodes: readonly ShotDagNode[];
  manifests: readonly MotionRunManifest[];
  timing: {
    wallClockMs: number;
    sumShotMs: number;
    parallelSpeedupFactor: number;
    peakConcurrency: number;
    perShot: readonly ShotTimingEntry[];
  };
}

export interface RunScenarioMotionDagOptions {
  continuityMode?: ShotContinuityMode;
  maxConcurrency?: number;
  width?: number;
  height?: number;
  fps?: number;
  baseSeed?: number;
  buildRequest?: (
    node: ShotDagNode,
    completed: ReadonlyMap<number, MotionRunManifest>,
    defaultRequest: MotionRequest,
  ) => Promise<MotionRequest> | MotionRequest;
}

/**
 * Compute the smallest valid frame count matching capability step/offset (e.g. 8k + 1 for LTX)
 * that covers `seconds` at `fps`, clamped to capability duration bounds.
 */
export function nativeFrameCountForSeconds(
  seconds: number,
  fps: number,
  capabilities?: MotionEngineCapabilities,
): number {
  const minFrames = capabilities?.duration.minFrames ?? 25;
  const maxFrames = capabilities?.duration.maxFrames ?? 145;
  const step = capabilities?.duration.frameStep ?? 8;
  const offset = capabilities?.duration.frameOffset ?? 1;
  const raw = Math.max(minFrames, Math.round(seconds * fps));
  if (step <= 0) {
    return Math.min(maxFrames, Math.max(minFrames, raw));
  }
  const k = Math.max(0, Math.ceil((raw - offset) / step));
  let frames = Math.min(maxFrames, Math.max(minFrames, k * step + offset));
  while ((frames - offset) % step !== 0 && frames > minFrames) {
    frames -= 1;
  }
  return frames;
}

/**
 * Compile a ScenarioV1 into a shot-level dependency DAG.
 * - `independent`: all shots can fan out in parallel immediately (when stills are pre-approved).
 * - `identity`: shot 0 establishes the shared anchor, then shots 1..N-1 fan out concurrently.
 * - `previous-end`: shot i depends on shot i - 1's motion end frame (strict chain).
 */
export function planShotDag(
  scenario: ScenarioV1,
  options: PlanShotDagOptions = {},
): ShotDagNode[] {
  const continuityMode = options.continuityMode ?? 'independent';
  const fps = options.fps ?? options.capabilities?.duration.frameRates[0] ?? 24;
  return scenario.plan.shots.map((shot, shotIndex) => {
    let dependsOn: number[] = [];
    if (continuityMode === 'previous-end' && shotIndex > 0) {
      dependsOn = [shotIndex - 1];
    } else if (continuityMode === 'identity' && shotIndex > 0) {
      dependsOn = [0];
    }
    return {
      shotIndex,
      seconds: shot.seconds,
      nativeFrames: nativeFrameCountForSeconds(shot.seconds, fps, options.capabilities),
      dependsOn,
      continuityMode,
    };
  });
}

function defaultDimensionsForScenario(
  scenario: ScenarioV1,
  capabilities: MotionEngineCapabilities,
): { width: number; height: number } {
  const isWide = scenario.settings.format === 'long' || scenario.settings.format === 'wide';
  const preferredWidth = isWide ? 1024 : 576;
  const preferredHeight = isWide ? 576 : 1024;
  const width = Math.min(capabilities.dimensions.maxWidth, Math.max(capabilities.dimensions.minWidth, preferredWidth));
  const height = Math.min(capabilities.dimensions.maxHeight, Math.max(capabilities.dimensions.minHeight, preferredHeight));
  return { width, height };
}

/**
 * Execute a ScenarioV1's motion shots across any MotionEngine respecting DAG dependencies
 * and bounded parallelism (`maxConcurrency`).
 */
export async function runScenarioMotionDag(
  scenario: ScenarioV1,
  engine: MotionEngine,
  options: RunScenarioMotionDagOptions = {},
): Promise<ScenarioDagRunResult> {
  const maxConcurrency = options.maxConcurrency ?? 6;
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency <= 0) {
    throw new ConfigError('maxConcurrency must be a positive safe integer.');
  }
  const fps = options.fps ?? engine.capabilities.duration.frameRates[0] ?? 24;
  const nodes = planShotDag(scenario, {
    ...(options.continuityMode !== undefined ? { continuityMode: options.continuityMode } : {}),
    fps,
    capabilities: engine.capabilities,
  });
  const dims = defaultDimensionsForScenario(scenario, engine.capabilities);
  const width = options.width ?? dims.width;
  const height = options.height ?? dims.height;
  const baseSeed = options.baseSeed ?? 2200;

  const completed = new Map<number, MotionRunManifest>();
  const timings = new Map<number, ShotTimingEntry>();
  const inFlight = new Set<number>();
  const runStart = Date.now();
  let peakConcurrency = 0;

  while (completed.size < nodes.length) {
    const ready = nodes.filter(
      (node) =>
        !completed.has(node.shotIndex) &&
        !inFlight.has(node.shotIndex) &&
        node.dependsOn.every((dep) => completed.has(dep)),
    );
    if (ready.length === 0 && inFlight.size === 0) {
      throw new ConfigError('Shot DAG contains an unresolvable dependency cycle.');
    }

    const batch = ready.slice(0, Math.max(1, maxConcurrency - inFlight.size));
    await Promise.all(
      batch.map(async (node) => {
        inFlight.add(node.shotIndex);
        peakConcurrency = Math.max(peakConcurrency, inFlight.size);
        const startedAtMs = Date.now();
        try {
          const toMotionOptions: ScenarioToMotionOptions = {
            width,
            height,
            fps,
            frameCount: node.nativeFrames,
            seed: baseSeed + node.shotIndex,
            capabilities: engine.capabilities,
          };
          const defaultReq = scenarioShotToMotionRequest(scenario, node.shotIndex, toMotionOptions);
          const req = options.buildRequest
            ? await options.buildRequest(node, completed, defaultReq)
            : defaultReq;
          const manifest = await engine.generate(req);
          const completedAtMs = Date.now();
          completed.set(node.shotIndex, manifest);
          timings.set(node.shotIndex, {
            shotIndex: node.shotIndex,
            startedAtMs,
            completedAtMs,
            durationMs: Math.max(0, completedAtMs - startedAtMs),
          });
        } finally {
          inFlight.delete(node.shotIndex);
        }
      }),
    );
  }

  const wallClockMs = Math.max(1, Date.now() - runStart);
  const manifests = nodes.map((node) => completed.get(node.shotIndex)!);
  const perShot = nodes.map((node) => timings.get(node.shotIndex)!);
  const sumShotMs = perShot.reduce((acc, item) => acc + item.durationMs, 0);
  const parallelSpeedupFactor = Number((sumShotMs / wallClockMs).toFixed(2));

  return {
    nodes,
    manifests,
    timing: {
      wallClockMs,
      sumShotMs,
      parallelSpeedupFactor,
      peakConcurrency,
      perShot,
    },
  };
}
