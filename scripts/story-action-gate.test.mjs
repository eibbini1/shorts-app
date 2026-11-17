import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVisiblePhysicalAction } from './story-action-gate.mjs';

test('recognizes food actions including common inflections', () => {
  for (const prompt of [
    'A chef slices a tomato and the wedges fall onto the board.',
    'The cook is chopping scallions while oil sizzles in the pan.',
    'A hand drizzles honey, then sprinkles sesame over the toast.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), true, prompt);
});

test('recognizes character and object actions', () => {
  for (const prompt of [
    'A fox chases a paper boat and leaps over a puddle.',
    'The small robot carries a seed upstairs and places it in the soil.',
    'A paper plane spins, floats above the harbor, then lands on a bench.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), true, prompt);
});

test('camera movement and static beauty shots do not satisfy the action gate', () => {
  for (const prompt of [
    'The camera slowly pans across a finished plate.',
    'A slow zoom reveals the same still scene.',
    'Hold on the beautiful dish while warm light glows across the counter.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), false, prompt);
});
