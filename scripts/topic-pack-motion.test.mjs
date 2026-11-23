import assert from 'node:assert/strict';
import test from 'node:test';
import { motionPackFor, motionPackGuidance } from './topic-pack-motion.mjs';

test('prefers a specific subject over generic animation style', () => {
  assert.equal(motionPackFor('A cartoon fox crosses a bridge').id, 'animals');
});

test('uses cooking guidance only for a cooking brief', () => {
  assert.equal(motionPackFor('Flip a patty', { foodProcess: true }).id, 'realistic-hand-heavy-cooking');
  assert.equal(motionPackFor('Flip a paper card'), null);
});

test('offers simpler motion without replacing the requested action', () => {
  const guidance = motionPackGuidance(motionPackFor('A gadget reveal'));
  assert.match(guidance, /rotate/);
  assert.match(guidance, /Preserve explicitly requested actions and endings/);
  assert.equal(motionPackGuidance(null), '');
});
