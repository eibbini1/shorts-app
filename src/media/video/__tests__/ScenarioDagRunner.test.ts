import { describe, expect, it } from 'vitest';
import { LOCAL_LTX_CAPABILITIES } from '../LocalLtxMotionEngine.js';
import type { MotionEngine, MotionRequest, MotionRunManifest } from '../MotionEngine.js';
import {
  nativeFrameCountForSeconds,
  planShotDag,
  runScenarioMotionDag,
} from '../ScenarioDagRunner.js';
import type { ScenarioV1 } from '../ScenarioV1.js';

function makeScenario(durations: number[]): ScenarioV1 {
  const total = durations.reduce((sum, s) => sum + s, 0);
  return {
    schemaVersion: 1,
    settings: { format: 'short', seconds: total, presentationMode: 'asmr', look: 'food' },
    plan: {
      title: 'Six-Shot Concurrent Test',
      hook: 'Crisp crust cracks under a spoon.',
      payoff: 'Glossy caramel spoonful lifts cleanly.',
      claimsToCheck: [],
      shots: durations.map((seconds, idx) => ({
        seconds,
        narration: `Shot ${idx + 1} line.`,
        imagePrompt: `Close-up food frame ${idx + 1}`,
        motionPrompt: `Natural subtle motion for shot ${idx + 1}`,
        sound: 'sizzle',
      })),
    },
  };
}

function mockEngine(delayMs: number, onOrder?: (seed: number, active: number) => void): MotionEngine {
  let active = 0;
  return {
    capabilities: LOCAL_LTX_CAPABILITIES,
    async generate(req: MotionRequest): Promise<MotionRunManifest> {
      active += 1;
      onOrder?.(req.seed ?? 0, active);
      const started = new Date();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      active -= 1;
      const completed = new Date();
      return {
        version: 1,
        runId: `run-${req.seed ?? 0}`,
        engine: {
          engineId: LOCAL_LTX_CAPABILITIES.engineId,
          provider: LOCAL_LTX_CAPABILITIES.provider,
          model: LOCAL_LTX_CAPABILITIES.model,
          modelRevision: LOCAL_LTX_CAPABILITIES.modelRevision,
          adapterVersion: LOCAL_LTX_CAPABILITIES.adapterVersion,
          workerVersion: LOCAL_LTX_CAPABILITIES.workerVersion,
        },
        request: {
          promptSha256: 'a'.repeat(64),
          mode: req.mode,
          width: req.width,
          height: req.height,
          fps: req.fps,
          frameCount: req.frameCount,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
          audio: req.audio,
          conditioning: [],
        },
        timing: {
          submittedAt: started.toISOString(),
          startedAt: started.toISOString(),
          completedAt: completed.toISOString(),
          queueDurationMs: 0,
          generationDurationMs: delayMs,
        },
        output: {
          path: `/tmp/clip-${req.seed ?? 0}.mp4`,
          sha256: 'b'.repeat(64),
          width: req.width,
          height: req.height,
          fps: req.fps,
          frameCount: req.frameCount,
          durationSeconds: req.frameCount / req.fps,
        },
      };
    },
  };
}

describe('ScenarioDagRunner', () => {
  it('computes exact 8k+1 native frame counts matching shot durations', () => {
    expect(nativeFrameCountForSeconds(3, 24, LOCAL_LTX_CAPABILITIES)).toBe(73);
    expect(nativeFrameCountForSeconds(4, 24, LOCAL_LTX_CAPABILITIES)).toBe(97);
    expect(nativeFrameCountForSeconds(5, 24, LOCAL_LTX_CAPABILITIES)).toBe(121);
    expect(nativeFrameCountForSeconds(6, 24, LOCAL_LTX_CAPABILITIES)).toBe(145);
  });

  it('fans out all 6 independent shots in parallel and measures multi-fold speedup', async () => {
    const scenario = makeScenario([5, 5, 5, 5, 5, 5]);
    const engine = mockEngine(35);
    const result = await runScenarioMotionDag(scenario, engine, {
      continuityMode: 'independent',
      maxConcurrency: 6,
    });

    expect(result.manifests).toHaveLength(6);
    expect(result.manifests.every((m) => m.request.frameCount === 121)).toBe(true);
    expect(result.timing.peakConcurrency).toBe(6);
    expect(result.timing.parallelSpeedupFactor).toBeGreaterThanOrEqual(3);
  });

  it('runs shot 0 first in identity mode, then fans out shots 1..5 in parallel', async () => {
    const scenario = makeScenario([5, 5, 5, 5, 5, 5]);
    const nodes = planShotDag(scenario, { continuityMode: 'identity', capabilities: LOCAL_LTX_CAPABILITIES });
    expect(nodes[0]?.dependsOn).toEqual([]);
    expect(nodes.slice(1).every((n) => n.dependsOn.length === 1 && n.dependsOn[0] === 0)).toBe(true);

    const seenSeeds: number[] = [];
    const engine = mockEngine(25, (seed) => seenSeeds.push(seed));
    const result = await runScenarioMotionDag(scenario, engine, {
      continuityMode: 'identity',
      maxConcurrency: 6,
      baseSeed: 100,
    });

    expect(seenSeeds[0]).toBe(100);
    expect(result.timing.peakConcurrency).toBe(5);
    expect(result.manifests.map((m) => m.request.seed)).toEqual([100, 101, 102, 103, 104, 105]);
  });

  it('enforces strict sequential ordering in previous-end chained mode', async () => {
    const scenario = makeScenario([4, 4, 4]);
    const order: number[] = [];
    const engine = mockEngine(15, (seed) => order.push(seed));
    const result = await runScenarioMotionDag(scenario, engine, {
      continuityMode: 'previous-end',
      maxConcurrency: 6,
      baseSeed: 500,
    });

    expect(order).toEqual([500, 501, 502]);
    expect(result.timing.peakConcurrency).toBe(1);
    expect(result.manifests.every((m) => m.request.frameCount === 97)).toBe(true);
  });
});
