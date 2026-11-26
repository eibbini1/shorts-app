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
test('preserves explicit scene state and per-shot visual checks', () => {
  const scenario = plan(5, 6);
  for (const [index, shot] of scenario.shots.entries()) {
    shot.sceneState = {
      before: `Dough state ${index}`,
      action: `The baker adds stage ${index + 1}`,
      after: `Dough state ${index + 1}`,
    };
    shot.visualChecks = {
      mustShow: [`stage ${index + 1}`],
      mustNotShow: [],
      questions: [],
    };
  }
  const validated = verifyScenario(scenario, scenarioSettings());
  assert.deepEqual(validated.plan.shots[0].sceneState, scenario.shots[0].sceneState);
  assert.deepEqual(validated.plan.shots[0].visualChecks, scenario.shots[0].visualChecks);
});
test('rejects unusable visual checks and incomplete scene state', () => {
  const scenario = plan(5, 6);
  for (const [index, shot] of scenario.shots.entries()) {
    shot.sceneState = { before: `Dough ${index}`, action: 'The baker adds sauce', after: `Sauce ${index}` };
    shot.visualChecks = { mustShow: ['visible dough'], mustNotShow: [], questions: [] };
  }
  scenario.shots[0].sceneState = { before: 'Dough', action: 'Sauce' };
  scenario.shots[1].visualChecks.mustShow = [];
  assert.throws(() => verifyScenario(scenario, scenarioSettings()));
});
test('rejects a broken state handoff between adjacent shots', () => {
  const scenario = plan(5, 6);
  for (const [index, shot] of scenario.shots.entries()) {
    shot.sceneState = {
      before: `State ${index}`,
      action: `The baker adds stage ${index + 1}`,
      after: `State ${index + 1}`,
    };
  }
  scenario.shots[2].sceneState.before = 'A different state';
  assert.throws(() => verifyScenario(scenario, scenarioSettings()), /must continue shot 2/);
});
test('preserves validated optional look, presentationMode, quality, and voice in scenarioSettings', () => {
  const settings = scenarioSettings({
    brand: 'Local Studio',
    format: 'short',
    seconds: 20,
    look: 'cartoon',
    presentationMode: 'asmr',
    quality: 'high',
    voice: 'af_heart',
  });
  assert.deepEqual(settings, {
    brand: 'Local Studio',
    format: 'short',
    seconds: 20,
    look: 'cartoon',
    presentationMode: 'asmr',
    quality: 'high',
    voice: 'af_heart',
  });
  assert.throws(() => scenarioSettings({ look: 'sci-fi' }));
  assert.throws(() => scenarioSettings({ presentationMode: 'music-only' }));
  assert.throws(() => scenarioSettings({ quality: 'ultra' }));
});
