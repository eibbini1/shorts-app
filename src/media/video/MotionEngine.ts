import { ConfigError } from '../../shared/errors.js';

export const MOTION_MODES = [
  't2v',
  'i2v_first_frame',
  'i2v_first_last_frame',
  'reference_image',
  'reference_video',
] as const;

export type MotionMode = (typeof MOTION_MODES)[number];
export type MotionAspectRatio = '16:9' | '9:16' | '1:1';
export type SeedDeterminism = 'deterministic' | 'best-effort' | 'unknown';

export interface MotionConditioningAsset {
  kind: 'image' | 'video';
  role: 'first-frame' | 'last-frame' | 'reference';
  uri: string;
  sha256: string;
}

export interface MotionEngineCapabilities {
  engineId: string;
  provider: string;
  model: string;
  modelRevision: string;
  adapterVersion: string;
  workerVersion: string;
  modes: readonly MotionMode[];
  dimensions: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    multipleOf?: number;
    aspectRatios: readonly MotionAspectRatio[];
  };
  duration: {
    minSeconds: number;
    maxSeconds: number;
    minFrames: number;
    maxFrames: number;
    frameStep: number;
    frameOffset: number;
    frameRates: readonly number[];
  };
  nativeAudio: boolean;
  seed: {
    supported: boolean;
    determinism: SeedDeterminism;
  };
}

export interface MotionRequest {
  caseId?: string;
  prompt: string;
  mode: MotionMode;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  seed?: number;
  audio: 'silent' | 'native';
  conditioning: readonly MotionConditioningAsset[];
}

export interface MotionRunManifest {
  version: 1;
  runId: string;
  caseId?: string;
  engine: {
    engineId: string;
    provider: string;
    model: string;
    modelRevision: string;
    adapterVersion: string;
    workerVersion: string;
  };
  request: {
    promptSha256: string;
    mode: MotionMode;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    seed?: number;
    audio: 'silent' | 'native';
    conditioning: readonly Pick<MotionConditioningAsset, 'kind' | 'role' | 'sha256'>[];
  };
  timing: {
    submittedAt: string;
    startedAt: string;
    completedAt: string;
    queueDurationMs: number;
    generationDurationMs: number;
  };
  output: {
    path: string;
    sha256: string;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    durationSeconds: number;
  };
}

export interface MotionEngine {
  readonly capabilities: MotionEngineCapabilities;
  generate(request: MotionRequest): Promise<MotionRunManifest>;
}

const ASPECT_RATIO_VALUES: Record<MotionAspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ASPECT_RATIO_TOLERANCE = 0.005;

export function motionRequestIssues(
  request: MotionRequest,
  capabilities: MotionEngineCapabilities,
): string[] {
  const issues: string[] = [];

  if (!request.prompt.trim()) issues.push('prompt must not be empty');
  if (!capabilities.modes.includes(request.mode)) {
    issues.push(`mode "${request.mode}" is not supported`);
  }

  const { dimensions, duration } = capabilities;
  if (!Number.isInteger(request.width) || request.width < dimensions.minWidth || request.width > dimensions.maxWidth) {
    issues.push(`width must be an integer between ${dimensions.minWidth} and ${dimensions.maxWidth}`);
  }
  if (!Number.isInteger(request.height) || request.height < dimensions.minHeight || request.height > dimensions.maxHeight) {
    issues.push(`height must be an integer between ${dimensions.minHeight} and ${dimensions.maxHeight}`);
  }
  if (dimensions.multipleOf !== undefined && (
    request.width % dimensions.multipleOf !== 0 || request.height % dimensions.multipleOf !== 0
  )) {
    issues.push(`width and height must be multiples of ${dimensions.multipleOf}`);
  }
  if (
    Number.isFinite(request.width) &&
    Number.isFinite(request.height) &&
    request.height > 0 &&
    !dimensions.aspectRatios.some((ratio) =>
      Math.abs(request.width / request.height / ASPECT_RATIO_VALUES[ratio] - 1) <= ASPECT_RATIO_TOLERANCE,
    )
  ) {
    issues.push(`aspect ratio ${request.width}:${request.height} is not supported`);
  }

  if (!duration.frameRates.includes(request.fps)) {
    issues.push(`frame rate ${request.fps} fps is not supported`);
  }
  if (
    !Number.isInteger(request.frameCount) ||
    request.frameCount < duration.minFrames ||
    request.frameCount > duration.maxFrames
  ) {
    issues.push(`frame count must be an integer between ${duration.minFrames} and ${duration.maxFrames}`);
  } else if (
    duration.frameStep <= 0 ||
    (request.frameCount - duration.frameOffset) % duration.frameStep !== 0
  ) {
    issues.push(`frame count must satisfy step ${duration.frameStep} with offset ${duration.frameOffset}`);
  }

  if (Number.isFinite(request.fps) && request.fps > 0 && Number.isFinite(request.frameCount)) {
    const seconds = request.frameCount / request.fps;
    if (seconds < duration.minSeconds || seconds > duration.maxSeconds) {
      issues.push(`duration ${seconds.toFixed(3)}s is outside ${duration.minSeconds}-${duration.maxSeconds}s`);
    }
  }
  if (request.seed !== undefined && (!Number.isInteger(request.seed) || !capabilities.seed.supported)) {
    issues.push(capabilities.seed.supported ? 'seed must be an integer' : 'seed is not supported');
  }
  if (request.audio === 'native' && !capabilities.nativeAudio) {
    issues.push('native audio is not supported');
  }

  issues.push(...conditioningIssues(request.mode, request.conditioning));
  for (const [index, asset] of request.conditioning.entries()) {
    if (!asset.uri.trim()) issues.push(`conditioning asset ${index + 1} must have a URI`);
    if (!SHA256_PATTERN.test(asset.sha256)) {
      issues.push(`conditioning asset ${index + 1} must have a SHA-256 checksum`);
    }
  }
  return issues;
}

function conditioningIssues(
  mode: MotionMode,
  assets: readonly MotionConditioningAsset[],
): string[] {
  const images = assets.filter((asset) => asset.kind === 'image');
  const videos = assets.filter((asset) => asset.kind === 'video');
  const firstFrames = assets.filter((asset) => asset.role === 'first-frame');
  const lastFrames = assets.filter((asset) => asset.role === 'last-frame');
  const references = assets.filter((asset) => asset.role === 'reference');

  switch (mode) {
    case 't2v':
      return assets.length === 0 ? [] : ['T2V requests must not include conditioning assets'];
    case 'i2v_first_frame':
      return images.length === 1 && firstFrames.length === 1 && assets.length === 1
        ? []
        : ['first-frame I2V requires exactly one image with role "first-frame"'];
    case 'i2v_first_last_frame':
      return images.length === 2 && firstFrames.length === 1 && lastFrames.length === 1 && assets.length === 2
        ? []
        : ['first/last-frame I2V requires one first-frame image and one last-frame image'];
    case 'reference_image':
      return images.length > 0 && references.length === images.length && assets.length === images.length
        ? []
        : ['reference-image mode requires one or more images with role "reference"'];
    case 'reference_video':
      return videos.length === 1 && references.length === 1 && assets.length === 1
        ? []
        : ['reference-video mode requires exactly one video with role "reference"'];
  }
}

function capabilityIssues(capabilities: MotionEngineCapabilities): string[] {
  const issues: string[] = [];
  for (const [name, value] of Object.entries({
    engineId: capabilities.engineId,
    provider: capabilities.provider,
    model: capabilities.model,
    modelRevision: capabilities.modelRevision,
    adapterVersion: capabilities.adapterVersion,
    workerVersion: capabilities.workerVersion,
  })) {
    if (!value.trim()) issues.push(`${name} must not be empty`);
  }
  if (capabilities.modes.length === 0) issues.push('at least one generation mode must be declared');
  if (capabilities.duration.frameStep <= 0) issues.push('frame step must be positive');
  if (capabilities.duration.minFrames > capabilities.duration.maxFrames) {
    issues.push('minimum frame count must not exceed maximum frame count');
  }
  if (capabilities.duration.minSeconds > capabilities.duration.maxSeconds) {
    issues.push('minimum duration must not exceed maximum duration');
  }
  if (capabilities.dimensions.minWidth > capabilities.dimensions.maxWidth) {
    issues.push('minimum width must not exceed maximum width');
  }
  if (capabilities.dimensions.minHeight > capabilities.dimensions.maxHeight) {
    issues.push('minimum height must not exceed maximum height');
  }
  if (capabilities.dimensions.aspectRatios.length === 0) {
    issues.push('at least one aspect ratio must be declared');
  }
  if (capabilities.duration.frameRates.length === 0) {
    issues.push('at least one frame rate must be declared');
  }
  return issues;
}

export class MotionEngineRegistry {
  private readonly engines = new Map<string, MotionEngine>();

  register(engine: MotionEngine): void {
    const { capabilities } = engine;
    const issues = capabilityIssues(capabilities);
    if (issues.length > 0) {
      throw new ConfigError(`Invalid capabilities for engine "${capabilities.engineId}": ${issues.join('; ')}`, {
        engineId: capabilities.engineId,
        issues,
      });
    }
    if (this.engines.has(capabilities.engineId)) {
      throw new ConfigError(`Motion engine "${capabilities.engineId}" is already registered.`);
    }
    this.engines.set(capabilities.engineId, engine);
  }

  compatibleEngineIds(request: MotionRequest): string[] {
    return [...this.engines.values()]
      .filter((engine) => motionRequestIssues(request, engine.capabilities).length === 0)
      .map((engine) => engine.capabilities.engineId);
  }

  async generate(engineId: string, request: MotionRequest): Promise<MotionRunManifest> {
    const engine = this.engines.get(engineId);
    if (!engine) throw new ConfigError(`Motion engine "${engineId}" is not registered.`);

    const issues = motionRequestIssues(request, engine.capabilities);
    if (issues.length > 0) {
      throw new ConfigError(`Motion engine "${engineId}" cannot accept this request: ${issues.join('; ')}`, {
        engineId,
        issues,
      });
    }
    return engine.generate(request);
  }
}
