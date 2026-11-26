import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUnattendedQueueStore, resolveUnattendedRefinement, sanitizeQueueEntry } from './studio-unattended-queue.mjs';

test('unattended queue persists items atomically, enforces order and capacity, and shifts when autoNext is on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-queue-test-'));
  try {
    const file = path.join(dir, 'queue.json');
    const store = createUnattendedQueueStore({ file });
    assert.deepEqual(store.read(), { autoNext: true, items: [] });

    const s1 = store.add({ prompt: 'First unattended idea', look: 'cartoon', seconds: 10, audio: 'asmr' });
    const s2 = store.add({ prompt: 'Second unattended idea', look: 'food', seconds: 20, orientation: 'wide' });
    assert.equal(s2.items.length, 2);
    assert.equal(s2.items[1].seconds, 60, 'wide orientation requires 60s');

    const moved = store.move(1, -1);
    assert.equal(moved.items[0].prompt, 'Second unattended idea');
    assert.equal(moved.items[1].prompt, 'First unattended idea');

    store.setAutoNext(false);
    assert.equal(store.shift(), null, 'shift returns null when autoNext is disabled');

    store.setAutoNext(true);
    const popped = store.shift();
    assert.equal(popped.prompt, 'Second unattended idea');
    assert.equal(store.read().items.length, 1);

    store.remove(s1.items[0].id);
    assert.equal(store.read().items.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveUnattendedRefinement handles both ready and needs_choices without stalling', () => {
  const ready = resolveUnattendedRefinement({
    decision: 'ready',
    refinedPrompt: 'Expanded visual story prompt',
    hook: 'Hook beat',
    mustShow: 'Original idea',
    obstacle: 'Natural constraint',
    turn: 'Technique',
    ending: 'Final payoff',
    model: 'qwen3:8b',
  }, 'Original idea');
  assert.equal(ready.prompt, 'Expanded visual story prompt');
  assert.equal(ready.ending, 'Final payoff');

  const fromChoices = resolveUnattendedRefinement({
    decision: 'needs_choices',
    question: 'Which ending?',
    choices: [
      {
        label: 'Option A',
        prompt: 'First complete choice prompt',
        hook: 'Choice A hook',
        mustShow: 'Original idea',
        obstacle: 'Choice A obstacle',
        turn: 'Choice A turn',
        ending: 'Choice A ending',
      },
      {
        label: 'Option B',
        prompt: 'Second choice',
        hook: 'B',
        mustShow: 'Original idea',
        obstacle: 'B',
        turn: 'B',
        ending: 'B',
      },
    ],
  }, 'Original idea');
  assert.equal(fromChoices.prompt, 'First complete choice prompt');
  assert.equal(fromChoices.ending, 'Choice A ending');

  assert.throws(() => sanitizeQueueEntry({ prompt: 'hi' }), /at least 4 characters/);
});
