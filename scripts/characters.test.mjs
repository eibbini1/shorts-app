// Contracts for the worldwide character catalogue: fictional adults, visible-trait identity text, real studios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadStudioPreset } from './studio-presets.mjs';

const { characters } = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url)));
const NATIONALITY = /\b(?:nigerian|kenyan|moroccan|indian|vietnamese|japanese|turkish|swedish|british|english|mexican|brazilian|bolivian|canadian|australian|chilean|african|asian|arab|latina?o?|european|american|indigenous|aboriginal)\b/i;

test('catalogue holds fictional adults with unique ids and balanced metadata', () => {
  assert.ok(characters.length >= 15);
  assert.equal(new Set(characters.map(c => c.id)).size, characters.length);
  for (const c of characters) {
    assert.equal(c.fictional, true, c.id);
    assert.ok(Number.isInteger(c.age) && c.age >= 25, c.id + ' must be an adult aged 25+');
    assert.ok(Number.isInteger(c.mst) && c.mst >= 1 && c.mst <= 10, c.id + ' needs a Monk Skin Tone 1-10');
    assert.match(c.sourceStatus, /^(sourced|inferred)$/);
    assert.match(c.status, /^(draft|approved)$/);
    if (c.status === 'approved') assert.ok(c.approvedAt, c.id + ' approval needs a date');
  }
  assert.ok(new Set(characters.map(c => c.gender)).size >= 2);
  assert.ok(new Set(characters.map(c => c.mst)).size >= 6, 'skin tones should span the scale');
});

test('identity text names visible traits, not nationality, and fits a prompt', () => {
  for (const c of characters) {
    assert.doesNotMatch(c.identityBlock, NATIONALITY, c.id + ' identity must not rely on a nationality label');
    assert.match(c.identityBlock, new RegExp(`^${c.age}-year-old`), c.id + ' must state the age first');
    assert.match(c.identityBlock, /skin/, c.id + ' must describe skin tone in words');
    const words = c.identityBlock.split(/\s+/).length;
    assert.ok(words >= 25 && words <= 70, `${c.id} identity is ${words} words`);
  }
});

test('every character links to a studio that loads with locked camera and at most three props', () => {
  for (const c of characters) {
    assert.ok(c.studioIds.length >= 1, c.id);
    for (const id of c.studioIds) {
      const studio = loadStudioPreset(id);
      assert.equal(studio.status, 'prompt-only');
      assert.ok(studio.props.length <= 3);
      assert.match(studio.cameraMove, /locked/i);
    }
  }
});
