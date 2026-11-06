import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioSettings, verifyScenario } from './scenario-schema.mjs';
const plan = (count, seconds) => ({
  ideas: Array.from({ length: 5 }, (_, i) => ({ title: 'Idea ' + i, angle: 'Demonstration' })),
  title: 'Example', hook: 'Watch what happens', payoff: 'The result',
  shots: Array.from({ length: count }, () => ({ seconds, narration: 'Show the result.', imagePrompt: 'Close view', motionPrompt: 'Subject moves', sound: 'Click' })),
  claimsToCheck: [],
});
test('food Short and WorklessAI long scenario validate', () => {
  assert.equal(verifyScenario(plan(5, 6), scenarioSettings()).total, 30);
  assert.equal(verifyScenario(plan(20, 15), scenarioSettings({ brand: 'WorklessAI', format: 'long', seconds: 300 })).total, 300);
});
test('reject invalid duration, format and wrong shot totals', () => {
  assert.throws(() => scenarioSettings({ format: 'unknown' }));
  assert.throws(() => scenarioSettings({ format: 'long', seconds: 10 }));
  assert.throws(() => verifyScenario(plan(5, 10), scenarioSettings()));
});
