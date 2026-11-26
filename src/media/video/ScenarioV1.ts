import { z } from 'zod';
import type {
  MotionConditioningAsset,
  MotionEngineCapabilities,
  MotionMode,
  MotionRequest,
} from './MotionEngine.js';

export const SCENARIO_V1_VERSION = 1 as const;
export const SCENARIO_FORMATS = ['short', 'long', 'wide', 'vertical'] as const;
export const SCENARIO_LOOKS = ['food', 'cartoon', 'night', 'custom'] as const;
export const SCENARIO_PRESENTATION_MODES = ['auto', 'asmr', 'voiced'] as const;
export const SCENARIO_QUALITIES = ['standard', 'high'] as const;

export type ScenarioFormat = (typeof SCENARIO_FORMATS)[number];
export type ScenarioLook = (typeof SCENARIO_LOOKS)[number];
export type ScenarioPresentationMode = (typeof SCENARIO_PRESENTATION_MODES)[number];
export type ScenarioQuality = (typeof SCENARIO_QUALITIES)[number];

const nonEmptyLine = z.string().trim().min(1).max(1000);
const promptText = z.string().trim().min(1).max(2000);

export const ScenarioSceneStateSchema = z
  .object({
    before: nonEmptyLine,
    action: nonEmptyLine,
    after: nonEmptyLine,
  })
  .passthrough();

export const ScenarioVisualChecksSchema = z
  .object({
    mustShow: z.array(nonEmptyLine).min(1).max(5),
    mustNotShow: z.array(nonEmptyLine).max(5),
    questions: z.array(nonEmptyLine).max(5),
  })
  .passthrough();

export const ScenarioShotSchema = z
  .object({
    seconds: z.number().int().min(1).max(30),
    narration: nonEmptyLine,
    imagePrompt: promptText,
    motionPrompt: promptText,
    sound: nonEmptyLine,
    voiceLeadSeconds: z.number().min(0).max(10).optional(),
    sceneState: ScenarioSceneStateSchema.optional(),
    visualChecks: ScenarioVisualChecksSchema.optional(),
  })
  .passthrough();

export const ScenarioIdeaSchema = z
  .object({
    title: nonEmptyLine,
    angle: nonEmptyLine,
  })
  .passthrough();

export const ScenarioSettingsSchema = z
  .object({
    brand: z.string().trim().min(1).max(120).optional(),
    format: z.enum(SCENARIO_FORMATS),
    seconds: z.number().int().min(10).max(1800),
    presentationMode: z.enum(SCENARIO_PRESENTATION_MODES).optional(),
    look: z.enum(SCENARIO_LOOKS).optional(),
    quality: z.enum(SCENARIO_QUALITIES).optional(),
    voice: z.string().trim().min(1).max(120).optional(),
  })
  .passthrough();

export const ScenarioPlanSchema = z
  .object({
    ideas: z.array(ScenarioIdeaSchema).max(20).optional(),
    title: nonEmptyLine,
    hook: nonEmptyLine,
    payoff: nonEmptyLine,
    shots: z.array(ScenarioShotSchema).min(1).max(900),
    claimsToCheck: z.array(nonEmptyLine).max(100),
  })
  .passthrough();

export const ScenarioV1Schema = z
  .object({
    schemaVersion: z.literal(SCENARIO_V1_VERSION).optional(),
    status: z.string().trim().min(1).max(64).optional(),
    topic: z.string().max(1000).optional(),
    style: z.string().max(500).optional(),
    model: z.string().max(120).optional(),
    requestedEnding: z.string().max(1000).nullable().optional(),
    totalSeconds: z.number().min(1).max(1800).optional(),
    settings: ScenarioSettingsSchema,
    plan: ScenarioPlanSchema,
  })
  .passthrough();

export type ScenarioSceneState = z.infer<typeof ScenarioSceneStateSchema>;
export type ScenarioVisualChecks = z.infer<typeof ScenarioVisualChecksSchema>;
export type ScenarioShot = z.infer<typeof ScenarioShotSchema>;
export type ScenarioSettings = z.infer<typeof ScenarioSettingsSchema>;
export type ScenarioPlan = z.infer<typeof ScenarioPlanSchema>;
export type ScenarioV1 = z.infer<typeof ScenarioV1Schema>;

export type ScenarioValidationResult =
  | { ok: true; scenario: ScenarioV1; totalSeconds: number; issues: [] }
  | { ok: false; issues: string[] };

export interface ScenarioToMotionOptions {
  mode?: MotionMode;
  width?: number;
  height?: number;
  fps?: number;
  frameCount?: number;
  seed?: number;
  caseId?: string;
  audio?: 'silent' | 'native';
  conditioning?: readonly MotionConditioningAsset[];
  capabilities?: MotionEngineCapabilities;
}

function normalizeStateText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function semanticIssues(scenario: ScenarioV1): { issues: string[]; totalSeconds: number } {
  const issues: string[] = [];
  const { format, seconds } = scenario.settings;
  const isWide = format === 'long' || format === 'wide';
  const minDuration = isWide ? 60 : 10;
  const maxDuration = isWide ? 1800 : 180;
  if (seconds < minDuration || seconds > maxDuration) {
    issues.push(`settings.seconds (${seconds}) must be between ${minDuration} and ${maxDuration} for format "${format}"`);
  }

  const shots = scenario.plan.shots;
  const totalSeconds = shots.reduce((sum, shot) => sum + shot.seconds, 0);
  const minTotal = seconds === 30 ? 25 : seconds - 2;
  if (totalSeconds < minTotal || totalSeconds > seconds + 2) {
    issues.push(`sum of shot durations (${totalSeconds}s) does not match settings.seconds (${seconds}s)`);
  }

  const withStates = shots.filter((shot) => shot.sceneState !== undefined).length;
  if (withStates > 0 && withStates !== shots.length) {
    issues.push('every shot must include sceneState when one shot defines it');
  } else if (withStates === shots.length) {
    for (let index = 0; index < shots.length; index += 1) {
      const current = shots[index]?.sceneState;
      if (!current) continue;
      if (normalizeStateText(current.before) === normalizeStateText(current.after)) {
        issues.push(`shot ${index + 1} sceneState must change from before to after`);
      }
      if (index > 0) {
        const previous = shots[index - 1]?.sceneState;
        if (previous && normalizeStateText(current.before) !== normalizeStateText(previous.after)) {
          issues.push(`shot ${index + 1} sceneState.before must continue shot ${index} sceneState.after`);
        }
      }
    }
  }

  const withChecks = shots.filter((shot) => shot.visualChecks !== undefined).length;
  if (withChecks > 0 && withChecks !== shots.length) {
    issues.push('every shot must include visualChecks when one shot defines them');
  }

  return { issues, totalSeconds };
}

export function validateScenarioV1(raw: unknown): ScenarioValidationResult {
  const parsed = ScenarioV1Schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `${location}: ${issue.message}`;
    });
    return { ok: false, issues };
  }

  const { issues, totalSeconds } = semanticIssues(parsed.data);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, scenario: parsed.data, totalSeconds, issues: [] };
}

export function parseScenarioV1(raw: unknown): ScenarioV1 {
  const result = validateScenarioV1(raw);
  if (!result.ok) {
    throw new Error(`Invalid Scenario v1: ${result.issues.join('; ')}`);
  }
  return result.scenario;
}

function defaultDimensionsFor(scenario: ScenarioV1): { width: number; height: number } {
  const isWide = scenario.settings.format === 'long' || scenario.settings.format === 'wide';
  const high = scenario.settings.quality === 'high';
  if (isWide) {
    return high ? { width: 1280, height: 704 } : { width: 640, height: 384 };
  }
  return high ? { width: 704, height: 1280 } : { width: 384, height: 640 };
}

function alignFrameCount(seconds: number, fps: number, capabilities?: MotionEngineCapabilities): number {
  const target = Math.max(1, Math.round(seconds * fps));
  if (!capabilities) return target;
  const { minFrames, maxFrames, minSeconds, maxSeconds, frameStep, frameOffset } = capabilities.duration;
  const lower = Math.max(minFrames, Math.ceil(minSeconds * fps));
  const upper = Math.min(maxFrames, Math.floor(maxSeconds * fps));
  const clamped = Math.min(upper, Math.max(lower, target));
  if (frameStep <= 1) return clamped;

  const stepIndex = Math.round((clamped - frameOffset) / frameStep);
  let aligned = frameOffset + stepIndex * frameStep;
  if (aligned < lower) aligned = frameOffset + Math.ceil((lower - frameOffset) / frameStep) * frameStep;
  if (aligned > upper) aligned = frameOffset + Math.floor((upper - frameOffset) / frameStep) * frameStep;
  return aligned;
}

export function scenarioShotToMotionRequest(
  scenario: ScenarioV1,
  shotIndex: number,
  options: ScenarioToMotionOptions = {},
): MotionRequest {
  if (!Number.isInteger(shotIndex) || shotIndex < 0 || shotIndex >= scenario.plan.shots.length) {
    throw new RangeError(`shotIndex ${shotIndex} is out of bounds for ${scenario.plan.shots.length} shot(s)`);
  }
  const shot = scenario.plan.shots[shotIndex]!;
  const conditioning = options.conditioning ?? [];
  const mode: MotionMode = options.mode ?? (conditioning.length > 0 ? 'i2v_first_frame' : 't2v');
  const defaults = defaultDimensionsFor(scenario);
  const width = options.width ?? defaults.width;
  const height = options.height ?? defaults.height;
  const fps = options.fps ?? options.capabilities?.duration.frameRates[0] ?? 24;
  const frameCount = options.frameCount ?? alignFrameCount(shot.seconds, fps, options.capabilities);

  return {
    ...(options.caseId !== undefined ? { caseId: options.caseId } : {}),
    prompt: shot.motionPrompt.trim(),
    mode,
    width,
    height,
    fps,
    frameCount,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    audio: options.audio ?? 'silent',
    conditioning,
  };
}
