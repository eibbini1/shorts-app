import { describe, expect, it, vi } from 'vitest';
import {
  MotionEngineRegistry,
  motionRequestIssues,
  type MotionEngine,
  type MotionEngineCapabilities,
  type MotionRequest,
  type MotionRunManifest,
} from '../MotionEngine.js';

const capabilities: MotionEngineCapabilities = {
  engineId: 'test-engine',
  provider: 'test-provider',
  model: 'test-model',
  modelRevision: 'revision-1',
  adapterVersion: 'adapter-1',
  workerVersion: 'worker-1',
  modes: ['t2v', 'i2v_first_frame', 'i2v_first_last_frame', 'reference_image', 'reference_video'],
  dimensions: {
    minWidth: 320,
    maxWidth: 1920,
    minHeight: 320,
    maxHeight: 1920,
    multipleOf: 8,
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  duration: {
    minSeconds: 1,
    maxSeconds: 10,
    minFrames: 24,
    maxFrames: 240,
    frameStep: 1,
    frameOffset: 0,
    frameRates: [24, 30],
  },
  nativeAudio: false,
  seed: { supported: true, determinism: 'unknown' },
};

const request: MotionRequest = {
  caseId: 'g02',
  prompt: 'Two hikers turn toward a valley.',
  mode: 't2v',
  width: 1280,
  height: 720,
  fps: 24,
  frameCount: 120,
  seed: 6022026,
  audio: 'silent',
  conditioning: [],
};

function manifest(): MotionRunManifest {
  return {
    version: 1,
    runId: 'run-1',
    caseId: 'g02',
    engine: {
      engineId: capabilities.engineId,
      provider: capabilities.provider,
      model: capabilities.model,
      modelRevision: capabilities.modelRevision,
      adapterVersion: capabilities.adapterVersion,
      workerVersion: capabilities.workerVersion,
    },
    request: {
      promptSha256: 'a'.repeat(64),
      mode: request.mode,
      width: request.width,
      height: request.height,
      fps: request.fps,
      frameCount: request.frameCount,
      seed: request.seed,
      audio: request.audio,
      conditioning: [],
    },
    timing: {
      submittedAt: '2026-11-20T00:00:00.000Z',
      startedAt: '2026-11-20T00:00:01.000Z',
      completedAt: '2026-11-20T00:00:06.000Z',
      queueDurationMs: 1000,
      generationDurationMs: 5000,
    },
    output: {
      path: '/tmp/test.mp4',
      sha256: 'b'.repeat(64),
      width: 1280,
      height: 720,
      fps: 24,
      frameCount: 120,
      durationSeconds: 5,
    },
  };
}

function engine(generate = vi.fn(async () => manifest())): MotionEngine {
  return { capabilities, generate };
}

describe('motion request capability checks', () => {
  it('accepts a matched, valid T2V request', () => {
    expect(motionRequestIssues(request, capabilities)).toEqual([]);
  });

  it('rejects unsupported modes, dimensions, duration, seed, and audio', () => {
    const issues = motionRequestIssues(
      { ...request, mode: 'reference_video', width: 1290, frameCount: 300, seed: 1.5, audio: 'native' },
      { ...capabilities, modes: ['t2v'], seed: { supported: false, determinism: 'unknown' } },
    );

    expect(issues).toEqual(expect.arrayContaining([
      'mode "reference_video" is not supported',
      'width and height must be multiples of 8',
      'frame count must be an integer between 24 and 240',
      'seed is not supported',
      'native audio is not supported',
      'reference-video mode requires exactly one video with role "reference"',
    ]));
  });

  it('requires exact input semantics for first/last-frame conditioning', () => {
    const issues = motionRequestIssues(
      { ...request, mode: 'i2v_first_last_frame' },
      capabilities,
    );
    expect(issues).toContain('first/last-frame I2V requires one first-frame image and one last-frame image');
  });
});

describe('MotionEngineRegistry', () => {
  it('selects only engines compatible with the complete request', () => {
    const registry = new MotionEngineRegistry();
    registry.register(engine());
    registry.register({
      ...engine(vi.fn(async () => manifest())),
      capabilities: { ...capabilities, engineId: 'reference-only', modes: ['reference_video'] },
    });

    expect(registry.compatibleEngineIds(request)).toEqual(['test-engine']);
  });

  it('fails before calling an adapter when a request is unsupported', async () => {
    const generate = vi.fn(async () => manifest());
    const registry = new MotionEngineRegistry();
    registry.register(engine(generate));

    await expect(registry.generate('test-engine', { ...request, audio: 'native' }))
      .rejects.toThrow('native audio is not supported');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects duplicate engine identifiers', () => {
    const registry = new MotionEngineRegistry();
    registry.register(engine());
    expect(() => registry.register(engine())).toThrow('already registered');
  });
});
