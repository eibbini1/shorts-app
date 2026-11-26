import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_LOOK,
  DEFAULT_LOOKS_CONFIG,
  FOOD_ONLY_AUDIO_CUES,
  LOOK_IDS,
  STUDIO_LOOKS,
  chainByDefaultForLook,
  getLookProfile,
  isFoodLook,
  isFoodText,
  isValidLook,
  loadLooksConfig,
  minPromptScoreForLook,
  resolveLookId,
} from './look-profiles.mjs';

test('data/looks.json stays in exact sync with DEFAULT_LOOKS_CONFIG fallback', () => {
  const fromDisk = JSON.parse(fs.readFileSync(new URL('../data/looks.json', import.meta.url), 'utf8'));
  assert.deepEqual(fromDisk, DEFAULT_LOOKS_CONFIG);
  assert.deepEqual(loadLooksConfig(new URL('./does-not-exist-looks.json', import.meta.url)), DEFAULT_LOOKS_CONFIG);
});

test('validates look IDs against explicit allow-list and rejects prototype/unknown keys', () => {
  assert.deepEqual(LOOK_IDS, ['food', 'cartoon', 'night', 'custom']);
  for (const id of LOOK_IDS) {
    assert.equal(isValidLook(id), true);
    assert.equal(resolveLookId(id), id);
    assert.ok(STUDIO_LOOKS[id].style.length > 0);
    assert.ok(STUDIO_LOOKS[id].set.length > 0);
  }
  for (const bad of ['', null, undefined, 'toString', '__proto__', 'constructor', 'sci-fi']) {
    assert.equal(isValidLook(bad), false);
    assert.equal(resolveLookId(bad), DEFAULT_LOOK);
  }
});

test('exposes centralized prompt scores, shot chaining defaults, and food detection', () => {
  assert.equal(minPromptScoreForLook('food'), 85);
  assert.equal(minPromptScoreForLook('cartoon'), 0);
  assert.equal(minPromptScoreForLook('night'), 0);
  assert.equal(minPromptScoreForLook('custom'), 0);

  assert.equal(chainByDefaultForLook('food'), false);
  assert.equal(chainByDefaultForLook('cartoon'), true);
  assert.equal(chainByDefaultForLook('night'), true);
  assert.equal(chainByDefaultForLook('custom'), true);

  assert.equal(getLookProfile('food').defaultStudio, 'luxury-kitchen');
  assert.equal(getLookProfile('cartoon').defaultStudio, null);

  assert.equal(isFoodText('A chef sears wagyu steak in a copper pan'), true);
  assert.equal(isFoodText('Crispy golden halloumi with hot honey'), true);
  assert.equal(isFoodText('وصفة حلوم في المقلاة'), true);
  assert.equal(isFoodText('A red fox carries a lantern along a snowy path'), false);

  assert.equal(isFoodLook('food', 'A lantern in snow'), true);
  assert.equal(isFoodLook('cartoon', 'A cartoon chef flips a pizza'), false);
  assert.equal(isFoodLook('night', 'A moonlit kitchen window'), false);
  assert.equal(isFoodLook('custom', 'Roasted garlic bread'), true);
  assert.equal(isFoodLook('custom', 'A paper boat on a quiet pond'), false);

  assert.equal(FOOD_ONLY_AUDIO_CUES.has('sizzle'), true);
  assert.equal(FOOD_ONLY_AUDIO_CUES.has('clink'), true);
  assert.equal(FOOD_ONLY_AUDIO_CUES.has('whoosh'), false);
});
