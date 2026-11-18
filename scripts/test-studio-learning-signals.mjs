import test from 'node:test';
import assert from 'node:assert/strict';
import { blockerReasons, classifyGateLine, gateEventKey } from './studio-learning-signals.mjs';

test('classifies a story action failure as a blocked visible-action gate', () => {
  assert.deepEqual(classifyGateLine('Error: Beat 2 has no clear physical action after repair. No scenario was saved.'), {
    gate: 'visible-action', outcome: 'blocked',
    message: 'Error: Beat 2 has no clear physical action after repair. No scenario was saved.',
    blocker: 'beat 2 has no filmable physical action',
  });
});

test('classifies brief validation errors with the named field and limit', () => {
  const result = classifyGateLine('director-brief.py: error: mustShow is 554 characters; maximum is 600');
  assert.equal(result.gate, 'brief-input');
  assert.equal(result.outcome, 'blocked');
  assert.match(result.blocker, /mustShow is 554/);
});

test('records a failed historical session even when its exact error has no specialized rule', () => {
  const result = classifyGateLine('Run failed: exited with code 3 during story planning');
  assert.equal(result.gate, 'pipeline-run');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.blocker, 'exited with code 3 during story planning');
  assert.deepEqual(blockerReasons(['Run failed: exited with code 3 during story planning']), [
    'exited with code 3 during story planning',
  ]);
});

test('keeps blockers unique and deduplicates the same logged gate event', () => {
  assert.deepEqual(blockerReasons([
    'BLOCKED: repeat topic',
    'BLOCKED: repeat topic',
    'Error: Beat 1 has no clear physical action after repair.',
  ]), ['repeat topic', 'beat 1 has no filmable physical action']);
  const row = { session: '1234567890', gate: 'visible-action', outcome: 'blocked', message: 'same line' };
  assert.equal(gateEventKey(row), gateEventKey({ ...row }));
});
