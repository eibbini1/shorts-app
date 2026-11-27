import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionId, draftIdleTimeoutMs, draftTimeoutMs, normalizeSessionPrompt, sessionTitle } from './studio-session-utils.mjs';

test('session titles use distinctive words instead of repeating generic prompt prefixes', () => {
  assert.equal(sessionTitle('A chef drizzles hot honey over one golden halloumi bite, then plates it.'), 'Drizzles Hot Honey Golden Halloumi');
  assert.equal(sessionTitle('A small robot carries a seed up a stairway to a sunny rooftop.'), 'Robot Carries Seed Stairway Sunny');
  assert.equal(sessionTitle('   '), 'New project');
});

test('prompt normalization ignores punctuation and Unicode compatibility differences', () => {
  assert.equal(normalizeSessionPrompt('Halloumi—gold!'), normalizeSessionPrompt('HＡLLOUMI gold'));
});

test('session IDs remain unique when multiple jobs start in one millisecond', () => {
  assert.equal(createSessionId(['1794900000000', '1794900000002'], 1794900000002), '1794900000003');
  assert.equal(createSessionId([], 1794900000002), '1794900000002');
});

test('draft watchdog scales with video length and ignores invalid overrides', () => {
  assert.equal(draftTimeoutMs(10), 480000);
  assert.equal(draftTimeoutMs(30), 480000);
  assert.equal(draftTimeoutMs(60), 960000);
  assert.equal(draftTimeoutMs(60, '12000'), 12000);
  assert.equal(draftTimeoutMs(60, 'invalid'), 960000);
  assert.equal(draftIdleTimeoutMs(10), 900000);
  assert.equal(draftIdleTimeoutMs(60), 900000);
  assert.equal(draftIdleTimeoutMs(120, 'invalid'), 1800000);
});
