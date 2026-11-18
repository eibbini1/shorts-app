import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdeaRefiner, validateRefinement } from './studio-refine-idea.mjs';

function localModel(result, capture = {}) {
  return async (url, options) => {
    capture.url = url;
    capture.body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(result) } }) };
  };
}

test('a coherent idea returns one proposal without mutating its input', async () => {
  const capture = {};
  const refiner = createIdeaRefiner({ fetchImpl: localModel({
    decision: 'ready', message: 'The action and payoff are clear.',
    refinedPrompt: 'A chef chops ripe tomatoes, stirs them into a pan, then spoons the glossy sauce over pasta.',
    hook: 'A ripe tomato splits under the knife in a tight opening shot.',
    mustShow: 'The chef chops tomatoes and stirs them into a simmering pan.',
    obstacle: 'The sauce is watery and slides off the pasta.',
    turn: 'The chef simmers it until it thickens and clings to the spoon.',
    ending: 'Glossy tomato sauce coats the pasta.', question: '', choices: [],
  }, capture) });
  const result = await refiner.refine({ prompt: 'A chef chopping tomatoes for pasta', look: 'food', ending: 'sauce over pasta' });
  assert.equal(result.decision, 'ready');
  assert.equal(result.turn, 'The chef simmers it until it thickens and clings to the spoon.');
  assert.equal(result.originalPrompt, 'A chef chopping tomatoes for pasta');
  assert.equal(result.hook, result.originalPrompt, 'the first concrete user action anchors the opening hook');
  assert.equal(result.mustShow, result.originalPrompt, 'the exact request remains a binding must-show requirement');
  assert.equal(capture.url, 'http://127.0.0.1:11434/api/chat');
  assert.match(capture.body.messages[1].content, /A chef chopping tomatoes for pasta/);
  assert.equal(refiner.active, false);
});

test('ambiguous ideas return explicit choices and one focused question', async () => {
  const result = { decision: 'needs_choices', message: 'The key action is not specified.', refinedPrompt: '', hook: '', mustShow: '', obstacle: '', turn: '', ending: '',
    question: 'What should the chef reveal at the end?', choices: [
      { label: 'Pasta sauce', prompt: 'A chef chops tomatoes, simmers them into sauce, then coats fresh pasta.', hook: 'A tomato splits under the knife.', mustShow: 'The tomatoes simmer and coat pasta.', obstacle: 'The sauce is too thin.', turn: 'The chef simmers until it thickens.', ending: 'Tomato sauce coats fresh pasta.' },
      { label: 'Stuffed tomatoes', prompt: 'A chef hollows ripe tomatoes, fills them with herbs, then plates the baked tomatoes.', hook: 'The chef lifts the tomato lid.', mustShow: 'The chef fills and bakes the tomatoes.', obstacle: 'The filling spills.', turn: 'The chef packs it firmly with herbs.', ending: 'The baked tomatoes rest on a plate.' },
      { label: 'Fresh salsa', prompt: 'A chef dices ripe tomatoes and herbs, then spoons the salsa into a small bowl.', hook: 'A tomato cube drops into the bowl.', mustShow: 'The chef dices and mixes the tomatoes.', obstacle: 'The salsa releases too much liquid.', turn: 'The chef drains it before seasoning.', ending: 'Fresh tomato salsa fills a small bowl.' },
    ] };
  const refiner = createIdeaRefiner({ fetchImpl: localModel(result) });
  const response = await refiner.refine({ prompt: 'tomatoes and pasta', look: 'food' });
  assert.equal(response.decision, 'needs_choices');
  assert.equal(response.choices.length, 3);
  assert.ok(response.choices.every((choice) => choice.ending.length > 0));
  assert.ok(response.choices.every((choice) => choice.mustShow === 'tomatoes and pasta'));
});

test('preserves a valid long idea up to the UI 600-character limit', async () => {
  const prompt = 'A chef drizzles hot honey over one golden halloumi bite, then makes crispy halloumi with garlic butter by cutting even slabs, coating them lightly in seasoned flour, searing both sides golden in a hot buttered pan, basting with garlic butter, adding lemon zest and sesame, plating beside cool herbed yogurt, breaking one bite to reveal its soft center, and dipping and tasting it.';
  const result = await createIdeaRefiner({ fetchImpl: localModel({
    decision: 'ready', message: 'The sequence is clear.', refinedPrompt: 'Make the halloumi bites in the requested order.',
    hook: 'A chef opens by drizzling honey.', mustShow: prompt, obstacle: 'One piece sticks to the pan.',
    turn: 'The chef loosens it with a thin spatula.', ending: 'The chef dips and tastes one crisp bite.', question: '', choices: [],
  }) }).refine({ prompt, look: 'food', seconds: 60 });
  assert.equal(result.mustShow, prompt);
  assert.equal(result.hook, 'A chef drizzles hot honey over one golden halloumi bite');
});

test('malformed model output is rejected instead of silently used', async () => {
  const refiner = createIdeaRefiner({ fetchImpl: localModel({ decision: 'ready', message: 'ok', choices: [] }) });
  await assert.rejects(refiner.refine({ prompt: 'a chef cooks', look: 'food' }), /incomplete refinement/);
});

test('empty input is rejected before contacting the local model', async () => {
  let called = false;
  const refiner = createIdeaRefiner({ fetchImpl: async () => { called = true; } });
  await assert.rejects(refiner.refine({ prompt: ' ' }), /Write a little/);
  assert.equal(called, false);
});

test('local model failure leaves the original input available and releases the helper lock', async () => {
  const refiner = createIdeaRefiner({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  const original = 'A chef chops tomatoes for pasta';
  await assert.rejects(refiner.refine({ prompt: original }), /Your original idea is unchanged/);
  assert.equal(refiner.active, false);
});

test('output validation rejects choices that do not preserve concrete endings', () => {
  assert.equal(validateRefinement({ decision: 'needs_choices', message: 'choose', refinedPrompt: '', ending: '', question: 'Which?', choices: [
    { label: 'One', prompt: 'A chef cooks tomatoes.', ending: '' },
    { label: 'Two', prompt: 'A chef cooks pasta.', ending: 'A finished bowl.' },
  ] }), false);
});
