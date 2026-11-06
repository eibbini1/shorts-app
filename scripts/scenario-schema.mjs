import { z } from 'zod';
export function scenarioSettings({ brand = 'Billionaire Bites', format = 'short', seconds = 30 } = {}) {
  if (!['short', 'long'].includes(format)) throw new Error('Format must be short or long');
  if (typeof brand !== 'string' || !brand.trim() || brand.length > 120) throw new Error('Brand must contain 1–120 characters');
  const duration = Number(seconds);
  if (!Number.isInteger(duration) || duration < (format === 'long' ? 60 : 10) || duration > (format === 'long' ? 1800 : 180)) throw new Error('Duration must be 10–180 seconds for Shorts or 60–1800 for long videos');
  return { brand: brand.trim(), format, seconds: duration };
}
export function scenarioSchema(settings) {
  const line = z.string().trim().min(1).max(1000);
  return z.object({
    ideas: z.array(z.object({ title: line, angle: line })).length(5),
    title: line, hook: line, payoff: line,
    shots: z.array(z.object({
      seconds: z.number().int().min(1).max(30),
      narration: z.string().trim().min(1).max(1000),
      imagePrompt: line, motionPrompt: line, sound: line,
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
  return { plan, total };
}
