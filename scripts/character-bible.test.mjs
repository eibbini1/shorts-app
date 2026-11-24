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

test('every person has all sheet slots and allowed styles; approved people have a complete, unchanged sheet', () => {
  for (const c of catalogue.characters) {
    assert.deepEqual(Object.keys(c.referenceSheet).sort(), [...SHEET_SLOTS].sort(), c.id);
    for (const s of c.styles) loadStylePack(s);
    assert.ok(c.styles.includes(c.defaultStyle), c.id);
    const sheet = sheetStatus(c);
    assert.ok(!Object.values(sheet.slots).some((v) => v === 'changed' || v === 'invalid'), c.id + ' sheet changed after approval');
    // Reference images live in the local, gitignored Studio store; a fresh clone has none of them.
    const local = Object.values(sheet.slots).some((v) => v !== 'missing-file');
    if (c.status === 'approved' && local) assert.equal(sheet.complete, true, c.id + ' approved sheet must be complete');
    else assert.equal(sheet.approved, 0, c.id + ' has no approved images yet');
  }
});

test('a shot without references is text-only, action first, studio and style included, within limits', () => {
  const c = findCharacter('chr-fez-latifa-61', catalogue);
  const shot = composeCharacterShot({ character: c, styleId: 'realistic', action: 'She lifts the phin filter off the cup', studioId: c.studioIds[0] });
  assert.equal(shot.status, 'text-only');
  assert.deepEqual(shot.references, []);
  assert.ok(shot.imagePrompt.startsWith('She lifts the phin filter off the cup.'));
  assert.ok(shot.imagePrompt.includes(c.identityBlock.slice(0, 40)));
  assert.match(shot.imagePrompt, /Setting: /);
  assert.ok(shot.imagePrompt.length <= 1000);
  assert.throws(() => composeCharacterShot({ character: c, styleId: 'flat-2d', action: 'x' }), /not approved for style/);
  assert.throws(() => composeCharacterShot({ character: c, styleId: 'realistic', action: ' ' }), /action/);
  const linh = composeCharacterShot({ character: findCharacter('chr-hanoi-linh-29', catalogue), styleId: 'realistic', action: 'She lifts the phin filter off the cup' });
  assert.ok(linh.status === 'referenced' ? linh.references.length === 3 : linh.references.length === 0);
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

// Existing entries are audited separately. A new ID must meet the current intake contract.
const legacyCharacterIds = new Set([
  'chr-lagos-adaeze-34', 'chr-nairobi-otieno-52', 'chr-fez-latifa-61',
  'chr-mumbai-farzana-45', 'chr-hanoi-linh-29', 'chr-tokyo-hiroshi-68',
  'chr-istanbul-emre-39', 'chr-dalarna-ingrid-73', 'chr-manchester-daniel-44',
  'chr-puebla-rosario-50', 'chr-saopaulo-thiago-31', 'chr-lapaz-justina-44',
  'chr-ontario-marie-58', 'chr-brisbane-jarrah-47', 'chr-antarctic-camila-41',
]);

const faceTraits = {
  faceShape: /\b(?:oval|round|heart-shaped|broad|angular|oblong|square) face\b/i,
  forehead: /\b(?:high|low|broad|narrow|rounded) forehead\b/i,
  eyebrows: /\b(?:arched|straight|thick|thin|full|sparse|tapered) (?:brows|eyebrows)\b/i,
  eyes: /\b(?:almond-shaped|round|hooded|deep-set|wide-set|close-set|upturned|downturned) eyes\b/i,
  nose: /\b(?:(?:high|low|straight|flat|prominent) nose bridge|(?:wide|broad|narrow) nose)\b/i,
  cheekbones: /\b(?:high|low|wide|broad|subtle|prominent) cheekbones\b/i,
  lips: /\b(?:full|thin|medium-full) lips\b/i,
  jaw: /\b(?:square|rounded|tapered|broad|soft|angular) jaw(?:line)?\b/i,
  ears: /\b(?:visible|exposed|partly hidden|covered) ears\b/i,
  hairTexture: /\b(?:(?:straight|wavy|curly|coily)(?: [a-z-]+){0,3} hair|tight curls)\b/i,
  hairline: /\b(?:straight|rounded|receding|high|low) hairline\b/i,
  facialHair: /\b(?:clean-shaven|stubble|beard|moustache|mustache)\b/i,
};

function checkNewFaceBrief(character) {
  const matched = Object.values(faceTraits).filter((pattern) => pattern.test(character.identityBlock || ''));
  assert.ok(matched.length >= 5, `${character.id}: expected at least five distinct face-structure traits, found ${matched.length}`);
  assert.ok(typeof character.faceReviewNote === 'string' && character.faceReviewNote.trim()
    && !/[\r\n]/.test(character.faceReviewNote), `${character.id}: expected a one-line faceReviewNote`);
}

test('new catalogue IDs require five distinct face traits and a one-line owner review note', () => {
  for (const character of catalogue.characters) {
    if (!legacyCharacterIds.has(character.id)) checkNewFaceBrief(character);
  }
});

test('the face brief contract rejects repeated or incidental mentions and missing review notes', () => {
  const character = {
    id: 'new-fictional-adult',
    identityBlock: 'Oval face, broad forehead, straight eyebrows, wide-set eyes, narrow nose.',
    faceReviewNote: 'Check the broad forehead, straight eyebrows and eye spacing against the approved individual brief.',
  };
  assert.doesNotThrow(() => checkNewFaceBrief(character));
  assert.throws(() => checkNewFaceBrief({
    ...character,
    identityBlock: 'Oval face, round face, angular face, square face, broad face, mole above an eyebrow.',
  }), /found 1/);
  assert.throws(() => checkNewFaceBrief({ ...character, faceReviewNote: '' }), /faceReviewNote/);
  assert.throws(() => checkNewFaceBrief({ ...character, faceReviewNote: 'line one\nline two' }), /faceReviewNote/);
});

test('regional draft characters meet the face brief and cannot enter shot composition', () => {
  const { characters } = loadCatalogue(new URL('../data/proposals/characters-levant-gulf-20261124.json', import.meta.url));
  assert.equal(characters.length, 10);
  assert.equal(characters.filter((character) => character.age < 18).length, 2);
  assert.equal(new Set(characters.map((character) => character.id)).size, 10);
  for (const character of characters) {
    checkNewFaceBrief(character);
    assert.equal(character.wardrobeSource, 'inferred');
    assert.equal(character.requiresOwnerApproval, true);
    assert.throws(() => composeCharacterShot({ character, action: character.activity }), /blocked/);
    if (character.age < 18) {
      assert.throws(() => composeCharacterShot({
        character: { ...character, requiresOwnerApproval: false }, action: character.activity,
      }), /blocked/);
    }
  }
});
