import test from 'node:test';
import assert from 'node:assert/strict';
import { firstRequestedActionClause, hasVisiblePhysicalAction, preserveOpeningHook, preserveRequestedActions } from './story-action-gate.mjs';

test('recognizes food actions including common inflections', () => {
  for (const prompt of [
    'A chef slices a tomato and the wedges fall onto the board.',
    'The cook is chopping scallions while oil sizzles in the pan.',
    'A hand drizzles honey, then sprinkles sesame over the toast.',
    'The chef coats halloumi in flour, bastes it, then plates each golden slice.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), true, prompt);
});

test('recognizes character and object actions', () => {
  for (const prompt of [
    'A fox chases a paper boat and leaps over a puddle.',
    'The small robot carries a seed upstairs and places it in the soil.',
    'A paper plane spins, floats above the harbor, then lands on a bench.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), true, prompt);
});

test('keeps a requested spreading action ahead of later recognized actions', () => {
  const prompt = 'A baker spreads tomato sauce on pizza dough, adds pineapple and five cheeses, then bakes it until golden.';
  assert.equal(firstRequestedActionClause(prompt), 'A baker spreads tomato sauce on pizza dough');
});

test('recognizes entering and coming out as ordered physical actions', () => {
  const prompt = 'Pineapple pizza enters a hot oven, then comes out golden on a board.';
  assert.equal(firstRequestedActionClause(prompt), 'Pineapple pizza enters a hot oven');
  assert.equal(hasVisiblePhysicalAction('The pineapple pizza enters the oven, then comes out golden.'), true);
});

test('recognizes common physical entry and exit verbs', () => {
  for (const prompt of [
    'The pizza slides into the oven.',
    'The cook loads the tray into the oven.',
    'The chef puts the pizza into the oven.',
    'The chef takes the pizza out of the oven.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), true, prompt);
});

test('matches equivalent physical entry and exit wording without replacing the shot prompts', () => {
  const shots = [
    { imagePrompt: 'Raw pineapple pizza on a wooden peel.', motionPrompt: 'The baker pushes the pizza into the glowing oven.' },
    { imagePrompt: 'Golden pizza on the wooden board.', motionPrompt: 'The baker pulls the golden pizza out of the oven and places it on the board.' },
  ];
  assert.deepEqual(preserveRequestedActions(shots,
    'Pineapple pizza enters a hot oven, then comes out golden on a board.'),
  { status: 'verified', inserted: [] });
  assert.match(shots[1].imagePrompt, /Golden pizza/);
});

test('repairs requested action prompts with the named subject and exact first-frame state', () => {
  const shots=[{
    imagePrompt:'Generic start frame.',
    motionPrompt:'The camera slowly pushes in.',
    sceneState:{before:'Pineapple pizza rests inside the glowing oven.'},
  }];
  const result=preserveRequestedActions(shots,'comes out golden on a board.','Pineapple pizza');
  assert.equal(result.status,'repaired');
  assert.match(shots[0].motionPrompt,/Pineapple pizza comes out golden on a board/);
  assert.equal(shots[0].imagePrompt,'First frame: Pineapple pizza rests inside the glowing oven.');
});

test('replaces generic action placeholders with the named protagonist', () => {
  const shots=[{
    imagePrompt:'Generic first frame.',
    motionPrompt:'The subject performs this requested physical action now: comes out golden on a board.',
    sceneState:{
      before:'Pineapple pizza rests inside the glowing oven.',
      action:'A hand pulls the pineapple pizza from the oven and places it on a wooden board.',
      after:'Golden pineapple pizza rests on a wooden board.',
    },
  }];
  const result=preserveRequestedActions(shots,'comes out golden on a board.','Pineapple pizza');
  assert.equal(result.status,'repaired');
  assert.match(shots[0].motionPrompt,/Pineapple pizza comes out golden on a board/);
  assert.match(shots[0].motionPrompt,/A hand pulls the pineapple pizza from the oven/);
  assert.match(shots[0].motionPrompt,/Starting state: Pineapple pizza rests inside the glowing oven/);
  assert.match(shots[0].motionPrompt,/Visible end state: Golden pineapple pizza rests on a wooden board/);
  assert.doesNotMatch(shots[0].motionPrompt,/the subject/i);
});

test('camera movement and static beauty shots do not satisfy the action gate', () => {
  for (const prompt of [
    'The camera slowly pans across a finished plate.',
    'The camera slowly moves across a finished plate.',
    'A slow zoom reveals the same still scene.',
    'Hold on the beautiful dish while warm light glows across the counter.',
  ]) assert.equal(hasVisiblePhysicalAction(prompt), false, prompt);
  assert.equal(hasVisiblePhysicalAction('The subject moves visibly while the camera tracks the action.'), true);
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
  assert.match(shots[0].imagePrompt, /First frame:/);
});

test('preserves comma-separated cooking actions as ordered shot requirements', () => {
  const shots=Array.from({length:12},()=>({imagePrompt:'A chef and halloumi.',motionPrompt:'The chef waits beside the pan.'}));
  const result=preserveRequestedActions(shots,
    'A chef drizzles honey, then cuts halloumi into slabs, coats each slab in flour, sears it, bastes it, adds lemon, plates it, breaks a bite, then dips and tastes it. Shoot a 60-second vertical cinematic food film with close macro details, natural cooking sounds, warm English narration and clear synced captions.');
  assert.equal(result.status,'repaired');
  assert.equal(result.inserted.length,9);
  assert.match(shots[0].motionPrompt,/drizzles honey/);
  assert.match(shots[2].motionPrompt,/coats each slab/);
  assert.match(shots[10].motionPrompt,/dips and tastes it/);
});

test('does not count a requested action that appears only in a visibility note', () => {
  const shots = [{
    imagePrompt: 'A chef adjusts a ring light over the kitchen.',
    motionPrompt: 'The chef turns the ring light. Required user action must be visible in this shot: add lemon zest and sesame.',
  }];
  const result = preserveRequestedActions(shots, 'Add lemon zest and sesame to the halloumi.');
  assert.equal(result.status, 'repaired');
  assert.match(shots[0].motionPrompt, /^Add lemon zest and sesame to the halloumi\./);
  assert.doesNotMatch(shots[0].motionPrompt, /ring light/);
  assert.match(shots[0].imagePrompt, /lemon zest and sesame/);
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
  assert.match(shots[0].motionPrompt, /^A chef pours warm caramel over a pear tart\./);
  assert.match(shots[0].imagePrompt, /First frame:/);
});
