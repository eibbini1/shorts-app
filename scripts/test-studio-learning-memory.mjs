import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningContext } from './studio-learning-memory.mjs';
import { createIdeaRefiner } from './studio-refine-idea.mjs';

test('only repeated blockers for this creator and film look guide a later prompt', () => {
  const rows = [
    { type: 'run', session: 'f1', user: 'owner', look: 'food' },
    { type: 'gate-event', session: 'f1', user: 'owner', gate: 'visible-action', outcome: 'blocked', blocker: 'beat 2 has no filmable physical action' },
    { type: 'run', session: 'f2', user: 'owner', look: 'food' },
    { type: 'gate-event', session: 'f2', user: 'owner', gate: 'visible-action', outcome: 'blocked', blocker: 'beat 2 has no filmable physical action' },
    { type: 'run', session: 'c1', user: 'other', look: 'food' },
    { type: 'gate-event', session: 'c1', user: 'other', gate: 'visible-action', outcome: 'blocked', blocker: 'beat 2 has no filmable physical action' },
    { type: 'run', session: 'n1', user: 'owner', look: 'night' },
    { type: 'gate-event', session: 'n1', user: 'owner', gate: 'lighting', outcome: 'blocked', blocker: 'night frame too bright' },
  ];
  const context = buildLearningContext(rows, { user: { name: 'owner', role: 'creator' }, look: 'food' });
  assert.equal(context.repeatedFailures.length, 1);
  assert.equal(context.repeatedFailures[0].count, 2);
  assert.equal(context.look, 'food');
  assert.equal(context.guidanceCount, 1);
});

test('human notes become look-scoped evidence; checkpoint look can come from its run', () => {
  const rows = [
    { type: 'run', session: 'run-1', user: 'owner', look: 'food' },
    { type: 'feedback', session: 'run-1', user: 'owner', rating: 'down', note: 'The knife misses the tomato.', videoSha256: 'abc' },
    { type: 'checkpoint-review', session: 'run-1', user: 'owner', notes: 'Show the cut surface clearly.' },
    { type: 'feedback', session: 'run-2', user: 'owner', look: 'cartoon', rating: 'up', note: 'Keep the same fox design.' },
  ];
  const context = buildLearningContext(rows, { user: { name: 'owner', role: 'owner' }, look: 'food' });
  assert.equal(context.humanNotes.length, 2);
  assert.match(context.humanNotes[0].note, /knife misses/);
  assert.match(context.humanNotes[1].note, /cut surface/);
  assert.equal(context.guidanceCount, 3);
  assert.equal(buildLearningContext(rows, { user: { name: 'owner', role: 'owner' }, look: 'night' }).humanNotes.length, 0);
});

test('hash-bound automated screen findings are included as advisory evidence', () => {
  const context = buildLearningContext([{
    type: 'machine-review', user: 'owner', look: 'food', videoSha256: 'exact-video-hash',
    visionChecked: true, flags: { realism: ['Shot 2 movement may be weak'] },
  }], { user: { name: 'owner', role: 'owner' }, look: 'food' });
  assert.equal(context.machineFindings[0].source, 'advisory-screen');
  assert.match(context.machineFindings[0].finding, /movement may be weak/);
});

test('local idea refiner receives evidence while keeping the exact user sentence binding', async () => {
  let request;
  const refiner = createIdeaRefiner({ fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    const answer = { decision: 'ready', message: 'Ready.', refinedPrompt: 'A chef chops a tomato, then simmers it.',
      hook: 'A tomato splits under the knife.', mustShow: '', obstacle: 'The sauce is thin.',
      turn: 'The chef simmers it down.', ending: 'The sauce coats the spoon.', question: '', choices: [] };
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(answer) } }) };
  } });
  const context = { look: 'food', repeatedFailures: [{ gate: 'visible-action', reason: 'show the physical cut', count: 2 }],
    humanNotes: [{ source: 'creator-rating', rating: 'down', note: 'The knife misses the tomato.' }],
    machineFindings: [], ratings: { good: 0, needsWork: 1 }, guidanceCount: 2 };
  const result = await refiner.refine({ prompt: 'A chef chops a tomato, then simmers it.', look: 'food', learningEvidence: context });
  const sent = JSON.parse(request.messages[1].content);
  assert.equal(sent.learningEvidence.humanNotes[0].note, 'The knife misses the tomato.');
  assert.equal(result.mustShow, 'A chef chops a tomato, then simmers it.');
});

