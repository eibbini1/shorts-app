import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipLine, normalizeShot, normalizeVisualChecks } from './shot-normalize.mjs';

test('visualChecks returned as a list of strings becomes mustShow', () => {
  const out = normalizeVisualChecks(['gold cape visible', 'rooftop at night']);
  assert.deepEqual(out, { mustShow: ['gold cape visible', 'rooftop at night'], mustNotShow: [], questions: [] });
});

test('visualChecks returned as a list of objects is merged and capped at five', () => {
  const out = normalizeVisualChecks([
    { mustShow: ['a', 'b', 'c'], questions: ['q1?'] },
    { mustShow: ['d', 'e', 'f'], mustNotShow: ['x'] },
  ]);
  assert.equal(out.mustShow.length, 5);
  assert.deepEqual(out.mustNotShow, ['x']);
  assert.deepEqual(out.questions, ['q1?']);
});

test('missing arrays in an object become empty arrays', () => {
  assert.deepEqual(normalizeVisualChecks({ mustShow: ['a'] }), { mustShow: ['a'], mustNotShow: [], questions: [] });
});

test('long motionPrompt is cut at a sentence boundary under 1000 chars', () => {
  const sentence = 'The guardian lifts one arm as the cape swings behind. ';
  const out = clipLine(sentence.repeat(40));
  assert.ok(out.length <= 1000);
  assert.ok(out.endsWith('.'));
});

test('normalizeShot fixes both problems together and leaves valid shots unchanged', () => {
  const bad = { narration: 'n', imagePrompt: 'i', motionPrompt: 'word '.repeat(400), sound: 's',
    sceneState: { before: 'b', action: 'a', after: 'c' }, visualChecks: ['x'] };
  const fixed = normalizeShot(bad);
  assert.ok(fixed.motionPrompt.length <= 1000);
  assert.deepEqual(fixed.visualChecks.mustShow, ['x']);
  const good = { narration: 'n', imagePrompt: 'i', motionPrompt: 'm', sound: 's',
    sceneState: { before: 'b', action: 'a', after: 'c' },
    visualChecks: { mustShow: ['x'], mustNotShow: [], questions: [] } };
  assert.deepEqual(normalizeShot(good), good);
});
