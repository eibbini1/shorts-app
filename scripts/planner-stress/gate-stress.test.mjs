import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasVisiblePhysicalAction } from '../story-action-gate.mjs';

const ideas = JSON.parse(fs.readFileSync(new URL('./ideas.json', import.meta.url), 'utf8'));

test('novel physical ideas across genres are not refused as having no visible action', () => {
  const refused = ideas.filter((row) => row.actionable && !hasVisiblePhysicalAction(row.idea)).map((row) => `[${row.category}] ${row.idea}`);
  assert.deepEqual(refused, []);
});

test('abstract, static and empty ideas are still refused', () => {
  const accepted = ideas.filter((row) => !row.actionable && row.category !== 'unsafe' && hasVisiblePhysicalAction(row.idea)).map((row) => `[${row.category}] ${row.idea}`);
  assert.deepEqual(accepted, []);
});

test('the gate checks physical action only; content safety is a separate, not yet implemented concern', () => {
  const unsafe = ideas.find((row) => row.category === 'unsafe');
  assert.equal(hasVisiblePhysicalAction(unsafe.idea), true);
});
