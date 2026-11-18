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
test('60-second Studio plans accept detailed image and motion prompts within their explicit limit', () => {
  const scenario = plan(12, 5);
  scenario.shots[0].imagePrompt = 'Halloumi detail. '.repeat(70);
  scenario.shots[0].motionPrompt = 'Camera follows the action. '.repeat(60);
  assert.equal(verifyScenario(scenario, scenarioSettings({ seconds: 60 })).total, 60);
  scenario.shots[0].imagePrompt = 'Halloumi detail. '.repeat(120);
  assert.throws(() => verifyScenario(scenario, scenarioSettings({ seconds: 60 })));
});
test('reject invalid duration, format and wrong shot totals', () => {
  assert.throws(() => scenarioSettings({ format: 'unknown' }));
  assert.throws(() => scenarioSettings({ format: 'long', seconds: 10 }));
  assert.throws(() => verifyScenario(plan(5, 10), scenarioSettings()));
});
