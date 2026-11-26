import { z } from 'zod';
import { isValidLook } from './look-profiles.mjs';
export function scenarioSettings({ brand = 'Billionaire Bites', format = 'short', seconds = 30, look, presentationMode, quality, voice } = {}) {
  if (!['short', 'long'].includes(format)) throw new Error('Format must be short or long');
  if (typeof brand !== 'string' || !brand.trim() || brand.length > 120) throw new Error('Brand must contain 1–120 characters');
  const duration = Number(seconds);
  if (!Number.isInteger(duration) || duration < (format === 'long' ? 60 : 10) || duration > (format === 'long' ? 1800 : 180)) throw new Error('Duration must be 10–180 seconds for Shorts or 60–1800 for long videos');
  const result = { brand: brand.trim(), format, seconds: duration };
  if (look !== undefined && look !== '') {
    if (!isValidLook(look)) throw new Error('Look must be one of food, cartoon, night, or custom');
    result.look = look;
  }
  if (presentationMode !== undefined && presentationMode !== '') {
    if (!['auto', 'asmr', 'voiced'].includes(presentationMode)) throw new Error('Presentation mode must be auto, asmr, or voiced');
    result.presentationMode = presentationMode;
  }
  if (quality !== undefined && quality !== '') {
    if (!['standard', 'high'].includes(quality)) throw new Error('Quality must be standard or high');
    result.quality = quality;
  }
  if (voice !== undefined && voice !== '') {
    if (typeof voice !== 'string' || !voice.trim() || voice.length > 120) throw new Error('Voice must contain 1–120 characters');
    result.voice = voice.trim();
  }
  return result;
}
export function scenarioSchema(settings) {
  const line = z.string().trim().min(1).max(1000);
  const prompt = z.string().trim().min(1).max(2000);
  const sceneState = z.object({
    before: line,
    action: line,
    after: line,
  });
  const visualChecks = z.object({
    mustShow: z.array(line).min(1).max(5),
    mustNotShow: z.array(line).max(5),
    questions: z.array(line).max(5),
  });
  return z.object({
    ideas: z.array(z.object({ title: line, angle: line })).length(5),
    title: line, hook: line, payoff: line,
    shots: z.array(z.object({
      seconds: z.number().int().min(1).max(30),
      narration: z.string().trim().min(1).max(1000),
      imagePrompt: prompt, motionPrompt: prompt, sound: line,
      sceneState: sceneState.optional(),
      visualChecks: visualChecks.optional(),
    })).min(2).max(Math.ceil(settings.seconds / 2)),
    claimsToCheck: z.array(line).max(100),
  });
}
export function verifyScenario(data, settings) {
  const plan = scenarioSchema(settings).parse(data);
  const total = plan.shots.reduce((sum, shot) => sum + shot.seconds, 0);
  // Preserve the original 25–32 second default drafts.
  const minimum = settings.seconds === 30 ? 25 : settings.seconds - 2;
  if (total < minimum || total > settings.seconds + 2) throw new Error('Shot durations must match the requested runtime');
  const withStates = plan.shots.filter(shot => shot.sceneState).length;
  if (withStates && withStates !== plan.shots.length) throw new Error('Every shot must include sceneState when one shot defines it');
  for (let index = 0; index < plan.shots.length; index += 1) {
    const state = plan.shots[index].sceneState;
    if (!state) continue;
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (normalize(state.before) === normalize(state.after)) throw new Error(`Shot ${index + 1} sceneState must change from before to after`);
    if (index > 0 && normalize(state.before) !== normalize(plan.shots[index - 1].sceneState.after)) {
      throw new Error(`Shot ${index + 1} sceneState.before must continue shot ${index}'s sceneState.after`);
    }
  }
  const withChecks = plan.shots.filter(shot => shot.visualChecks).length;
  if (withChecks && withChecks !== plan.shots.length) throw new Error('Every shot must include visualChecks when one shot defines them');
  return { plan, total };
}
