// Character bible contracts: style packs, reference-sheet hashing, rigged mascots, prompt order and bans.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHEET_SLOTS, composeCharacterShot, findCharacter, loadCatalogue, loadStylePack, sheetStatus } from './character-bible.mjs';

const catalogue = loadCatalogue();
const PACKS = ['realistic', 'stylized-3d', 'flat-2d', 'cel-2d'];

test('four style packs load, name a render route and never cite a studio or franchise', () => {
  for (const id of PACKS) {
    const pack = loadStylePack(id);
    assert.equal(pack.id, id);
    assert.match(pack.route, /^(diffusion-reference|puppet-2d|rig-3d)$/);
    assert.ok(pack.identityCheck?.method, id);
    for (const banned of pack.forbiddenReferences) assert.ok(!pack.promptStyle.toLowerCase().includes(banned.toLowerCase()), id);
  }
  assert.throws(() => loadStylePack('../outside'), /Invalid/);
  assert.throws(() => loadStylePack('missing'), /Unknown/);
});

test('every person has all sheet slots, allowed styles that exist, and starts unreferenced', () => {
  for (const c of catalogue.characters) {
    assert.deepEqual(Object.keys(c.referenceSheet).sort(), [...SHEET_SLOTS].sort(), c.id);
    for (const s of c.styles) loadStylePack(s);
    assert.ok(c.styles.includes(c.defaultStyle), c.id);
    assert.equal(sheetStatus(c).approved, 0, c.id + ' has no approved images yet');
  }
});

test('a shot without references is text-only, action first, studio and style included, within limits', () => {
  const c = findCharacter('chr-hanoi-linh-29', catalogue);
  const shot = composeCharacterShot({ character: c, styleId: 'realistic', action: 'She lifts the phin filter off the cup', studioId: c.studioIds[0] });
  assert.equal(shot.status, 'text-only');
  assert.deepEqual(shot.references, []);
  assert.ok(shot.imagePrompt.startsWith('She lifts the phin filter off the cup.'));
  assert.ok(shot.imagePrompt.includes(c.identityBlock.slice(0, 40)));
  assert.match(shot.imagePrompt, /Setting: /);
  assert.ok(shot.imagePrompt.length <= 1000);
  assert.throws(() => composeCharacterShot({ character: c, styleId: 'flat-2d', action: 'x' }), /not approved for style/);
  assert.throws(() => composeCharacterShot({ character: c, styleId: 'realistic', action: ' ' }), /action/);
});

test('approved references are used only while their bytes still match the approved hash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bible-refs-'));
  const character = structuredClone(findCharacter('chr-tokyo-hiroshi-68', catalogue));
  for (const slot of ['front', 'three-quarter', 'full-body', 'hands']) {
    const refId = crypto.randomBytes(16).toString('hex');
    const bytes = Buffer.from('image ' + slot);
    fs.writeFileSync(path.join(dir, refId + '.png'), bytes);
    character.referenceSheet[slot] = { refId, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const shot = composeCharacterShot({ character, styleId: 'realistic', action: 'He turns a page', refDir: dir });
  assert.equal(shot.status, 'referenced');
  assert.deepEqual(shot.references.map((r) => r.slot), ['front', 'three-quarter', 'full-body']); // max three, identity-first
  assert.match(shot.imagePrompt, /identical to the reference images/);
  assert.equal(shot.sheet.approved, 4);
  fs.writeFileSync(path.join(dir, character.referenceSheet.front.refId + '.png'), 'edited after approval');
  assert.equal(sheetStatus(character, { refDir: dir }).slots.front, 'changed');
  assert.throws(() => composeCharacterShot({ character, styleId: 'realistic', action: 'He turns a page', refDir: dir }), /re-approve/);
  character.referenceSheet.profile = { refId: '../../etc/passwd', sha256: 'x' };
  assert.equal(sheetStatus(character, { refDir: dir }).slots.profile, 'invalid');
});

test('Crumb is drawn by its rigs in both styles and never routed through diffusion', () => {
  const crumb = findCharacter('crumb', catalogue);
  const flat = composeCharacterShot({ character: crumb, styleId: 'flat-2d', action: 'Crumb waves' });
  const solid = composeCharacterShot({ character: crumb, styleId: 'stylized-3d', action: 'Crumb waves' });
  assert.deepEqual([flat.route, flat.status, flat.imagePrompt], ['puppet-2d', 'rigged', undefined]);
  assert.equal(solid.route, 'rig-3d');
  for (const source of Object.values(crumb.rigSources)) assert.ok(fs.existsSync(new URL('../' + source, import.meta.url)), source);
});
