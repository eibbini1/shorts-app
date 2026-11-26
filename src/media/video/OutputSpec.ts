import fs from 'node:fs';
import { z } from 'zod';

const DimensionSpecSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.string().min(1),
});

export const OutputSpecSchema = z.object({
  version: z.literal(1),
  video: z.object({
    vertical: DimensionSpecSchema,
    wide: DimensionSpecSchema,
    allowedFps: z.array(z.number().positive()).min(1),
    defaultLocalFps: z.number().positive(),
    defaultTsFps: z.number().positive(),
    allowedVideoCodecs: z.array(z.string().min(1)).min(1),
    allowedPixelFormats: z.array(z.string().min(1)).min(1),
    minWidth: z.number().int().positive(),
    minHeight: z.number().int().positive(),
  }),
  audio: z.object({
    targetLufs: z.number(),
    targetTruePeakDb: z.number(),
    targetLra: z.number().positive(),
    qaMinLufs: z.number(),
    qaMaxLufs: z.number(),
    qaMaxTruePeakDb: z.number(),
    prereviewToleranceLufs: z.number().positive(),
    prereviewMaxTruePeakDb: z.number(),
    allowedAudioCodecs: z.array(z.string().min(1)).min(1),
    targetSampleRateHz: z.number().int().positive(),
    minSampleRateHz: z.number().int().positive(),
    bitrateKbps: z.number().int().positive(),
  }),
  qa: z.object({
    maxBlackSeconds: z.number().nonnegative(),
    maxFreezeSeconds: z.number().positive(),
    maxSilenceSeconds: z.number().positive(),
    durationToleranceSeconds: z.number().nonnegative(),
    defaultMinSeconds: z.number().positive(),
    defaultMaxSeconds: z.number().positive(),
    maxFirstVoiceSeconds: z.number().positive(),
  }),
});

export type OutputSpec = z.infer<typeof OutputSpecSchema>;

export const DEFAULT_OUTPUT_SPEC: OutputSpec = {
  version: 1,
  video: {
    vertical: { width: 1080, height: 1920, aspectRatio: '9:16' },
    wide: { width: 1920, height: 1080, aspectRatio: '16:9' },
    allowedFps: [24, 25, 30],
    defaultLocalFps: 24,
    defaultTsFps: 30,
    allowedVideoCodecs: ['h264'],
    allowedPixelFormats: ['yuv420p'],
    minWidth: 360,
    minHeight: 360,
  },
  audio: {
    targetLufs: -15.0,
    targetTruePeakDb: -1.5,
    targetLra: 11.0,
    qaMinLufs: -18.0,
    qaMaxLufs: -13.0,
    qaMaxTruePeakDb: -0.5,
    prereviewToleranceLufs: 2.5,
    prereviewMaxTruePeakDb: -0.8,
    allowedAudioCodecs: ['aac'],
    targetSampleRateHz: 48000,
    minSampleRateHz: 44100,
    bitrateKbps: 192,
  },
  qa: {
    maxBlackSeconds: 0.5,
    maxFreezeSeconds: 2.5,
    maxSilenceSeconds: 1.5,
    durationToleranceSeconds: 0.15,
    defaultMinSeconds: 20,
    defaultMaxSeconds: 35,
    maxFirstVoiceSeconds: 1.0,
  },
};

export function loadOutputSpec(
  fileUrl: URL = new URL('../../../data/output-spec.json', import.meta.url),
): OutputSpec {
  try {
    const raw = JSON.parse(fs.readFileSync(fileUrl, 'utf8'));
    return OutputSpecSchema.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return DEFAULT_OUTPUT_SPEC;
    }
    throw error;
  }
}

export const OUTPUT_SPEC: OutputSpec = loadOutputSpec();

export interface VideoStreamMetrics {
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  videoCodec?: string | null;
  pixelFormat?: string | null;
  hasAudio: boolean;
  audioCodec?: string | null;
  audioSampleRateHz?: number | null;
  durationSeconds?: number | null;
  lufs?: number | null;
  truePeakDb?: number | null;
}

export interface OutputSpecCheckOptions {
  orientation?: 'vertical' | 'wide';
  expectedSeconds?: number;
  spec?: OutputSpec;
}

export interface OutputSpecCheckResult {
  ok: boolean;
  issues: string[];
  specVersion: number;
}

export function buildLoudnormFilter(
  options: { printJson?: boolean; spec?: OutputSpec } = {},
): string {
  const audio = (options.spec ?? OUTPUT_SPEC).audio;
  const base = `loudnorm=I=${audio.targetLufs}:TP=${audio.targetTruePeakDb}:LRA=${audio.targetLra}`;
  return options.printJson ? `${base}:print_format=json` : base;
}

export function isQaLoudnessOk(
  lufs: number,
  truePeakDb: number,
  spec: OutputSpec = OUTPUT_SPEC,
): boolean {
  return (
    lufs >= spec.audio.qaMinLufs &&
    lufs <= spec.audio.qaMaxLufs &&
    truePeakDb <= spec.audio.qaMaxTruePeakDb
  );
}

export function checkOutputSpec(
  metrics: VideoStreamMetrics,
  options: OutputSpecCheckOptions = {},
): OutputSpecCheckResult {
  const spec = options.spec ?? OUTPUT_SPEC;
  const issues: string[] = [];

  const width = metrics.width ?? 0;
  const height = metrics.height ?? 0;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    issues.push('video stream missing valid dimensions');
  } else {
    if (width < spec.video.minWidth || height < spec.video.minHeight) {
      issues.push(`dimensions ${width}x${height} are below minimum ${spec.video.minWidth}x${spec.video.minHeight}`);
    }
    if (width % 2 !== 0 || height % 2 !== 0) {
      issues.push(`dimensions ${width}x${height} must be even for H.264/yuv420p playback`);
    }
    if (options.orientation === 'vertical' && height <= width) {
      issues.push(`expected vertical orientation (height > width), got ${width}x${height}`);
    } else if (options.orientation === 'wide' && width <= height) {
      issues.push(`expected wide orientation (width > height), got ${width}x${height}`);
    }
  }

  const fps = metrics.fps;
  if (fps === null || fps === undefined || !spec.video.allowedFps.some((target) => Math.abs(fps - target) <= 0.5)) {
    issues.push(`frame rate ${fps ?? 'missing'} fps is outside allowed [${spec.video.allowedFps.join(', ')}]`);
  }

  const videoCodec = (metrics.videoCodec ?? '').toLowerCase();
  if (!spec.video.allowedVideoCodecs.includes(videoCodec)) {
    issues.push(`video codec "${videoCodec || 'missing'}" is not allowed`);
  }

  const pixelFormat = (metrics.pixelFormat ?? '').toLowerCase();
  if (!spec.video.allowedPixelFormats.includes(pixelFormat)) {
    issues.push(`pixel format "${pixelFormat || 'missing'}" is not allowed`);
  }

  if (!metrics.hasAudio) {
    issues.push('audio stream is missing');
  } else {
    const audioCodec = (metrics.audioCodec ?? '').toLowerCase();
    if (!spec.audio.allowedAudioCodecs.includes(audioCodec)) {
      issues.push(`audio codec "${audioCodec || 'missing'}" is not allowed`);
    }
    const sr = metrics.audioSampleRateHz;
    if (sr === null || sr === undefined || sr < spec.audio.minSampleRateHz) {
      issues.push(`audio sample rate ${sr ?? 'missing'} Hz is below ${spec.audio.minSampleRateHz} Hz`);
    }
  }

  if (options.expectedSeconds !== undefined) {
    const dur = metrics.durationSeconds;
    const tol = spec.qa.durationToleranceSeconds;
    if (dur === null || dur === undefined || Math.abs(dur - options.expectedSeconds) > tol) {
      issues.push(`duration ${dur ?? 'missing'}s is outside ${options.expectedSeconds}s ± ${tol}s`);
    }
  }

  if (
    metrics.lufs !== null &&
    metrics.lufs !== undefined &&
    metrics.truePeakDb !== null &&
    metrics.truePeakDb !== undefined &&
    !isQaLoudnessOk(metrics.lufs, metrics.truePeakDb, spec)
  ) {
    issues.push(
      `loudness ${metrics.lufs.toFixed(1)} LUFS / ${metrics.truePeakDb.toFixed(1)} dBTP is outside QA bounds`,
    );
  }

  return { ok: issues.length === 0, issues, specVersion: spec.version };
}
