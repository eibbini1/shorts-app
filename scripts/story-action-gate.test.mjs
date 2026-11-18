import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVisiblePhysicalAction, preserveOpeningHook, preserveRequestedActions } from './story-action-gate.mjs';

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

test('repairs a requested pour before a later slice and plating action', () => {
  const shots = [
    { imagePrompt: 'Chef holds warm caramel over a pear tart.', motionPrompt: 'The chef warms and rotates a ladle of caramel.' },
    { imagePrompt: 'The glossy tart rests on a white plate.', motionPrompt: 'The chef slices a wedge, lifts it, and places it on a plate.' },
  ];
  const result = preserveRequestedActions(shots,
    'A chef pours warm caramel over a pear tart, then slices and plates one glossy wedge.');
  assert.equal(result.status, 'repaired');
  assert.deepEqual(result.inserted.map((item) => item.shot), [1]);
  assert.match(shots[0].motionPrompt, /A chef pours warm caramel over a pear tart/);
  assert.match(shots[0].imagePrompt, /Start state/);
});

test('keeps already-covered actions and flags unsupported action language for review', () => {
  const shots = [{ imagePrompt: 'A fox and a boat.', motionPrompt: 'A fox chases the paper boat, then catches it.' }];
  assert.deepEqual(preserveRequestedActions(shots, 'A fox chases a paper boat, then catches it.'),
    { status: 'verified', inserted: [] });
  assert.deepEqual(preserveRequestedActions(shots, 'حكاية جميلة'), { status: 'unverified', inserted: [] });
});

test('moves the selected opening action into the first shot when the model delayed it', () => {
  const shots = [
    { imagePrompt: 'A warm tart on a counter.', motionPrompt: 'The chef sets down a ladle and looks at the tart.' },
    { imagePrompt: 'Caramel over the tart.', motionPrompt: 'The chef pours warm caramel over the pear tart.' },
  ];
  const result = preserveOpeningHook(shots, 'A chef pours warm caramel over a pear tart.');
  assert.equal(result.status, 'repaired');
  assert.match(shots[0].motionPrompt, /Opening hook must visibly perform/);
  assert.match(shots[0].imagePrompt, /Opening-hook start frame/);
});
