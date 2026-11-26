// Character bible: one fixed identity per character, shown the same way in every shot.
// Like the kitchen studio's reference plates, consistency comes from approved reference images
// (stored by the Studio in storage/studio-characters, checked by SHA-256), not from text alone.
// Rigged mascots (2D puppet, 3D rig) are drawn by code, so they never go through diffusion.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStudioPreset } from './studio-presets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = path.join(ROOT, 'data', 'style-packs');
const CATALOGUE = path.join(ROOT, 'data', 'characters.json');
const REF_ID = /^[0-9a-f]{32}$/;
const PROMPT_LIMIT = 1000;

// The views every realistic or stylised character needs before it is called "referenced".
export const SHEET_SLOTS = ['front', 'three-quarter', 'profile', 'full-body', 'hands', 'expression-neutral',
  'expression-smile', 'expression-thinking'];
// FLUX.2 klein on this Mac takes up to three references; these are the ones that carry identity best.
export const THREE_ANGLE_SLOTS = ['front', 'three-quarter-left', 'three-quarter-right'];
const SHOT_REFERENCES = ['front', 'three-quarter', 'full-body'];

export function loadStylePack(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid style pack ID.');
  const file = path.join(PACK_DIR, id + '.json');
  if (!fs.existsSync(file)) throw new Error('Unknown style pack: ' + id);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadCatalogue(file = CATALOGUE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function findCharacter(id, catalogue = loadCatalogue()) {
  const found = [...(catalogue.characters || []), ...(catalogue.mascots || [])].find((row) => row.id === id);
  if (!found) throw new Error('Unknown character: ' + id);
  return found;
}

// A slot counts only when its image exists in the Studio's reference store and still has the approved hash.
export function sheetStatus(character, { refDir = path.join(ROOT, 'storage', 'studio-characters') } = {}) {
  const slots = {};
  for (const slot of new Set([...SHEET_SLOTS, ...THREE_ANGLE_SLOTS.filter((slot) => character.referenceSheet?.[slot])])) {
    const entry = character.referenceSheet?.[slot];
    if (!entry) { slots[slot] = 'missing'; continue; }
    if (!REF_ID.test(String(entry.refId)) || !/^[0-9a-f]{64}$/.test(String(entry.sha256))) { slots[slot] = 'invalid'; continue; }
    const file = ['png', 'jpg'].map((ext) => path.join(refDir, `${entry.refId}.${ext}`)).find((f) => fs.existsSync(f));
    if (!file) { slots[slot] = 'missing-file'; continue; }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    slots[slot] = actual === entry.sha256 ? 'approved' : 'changed';
  }
  const approved = Object.values(slots).filter((s) => s === 'approved').length;
  return { slots, approved, complete: SHEET_SLOTS.every((slot) => slots[slot] === 'approved') };
}

const sentence = (text) => { const t = String(text || '').trim(); return !t ? '' : /[.!?]$/.test(t) ? t : t + '.'; };
const fit = (text) => {
  if (text.length <= PROMPT_LIMIT) return text;
  const cut = text.slice(0, PROMPT_LIMIT - 1);
  const end = cut.lastIndexOf('. ');
  return end > 200 ? cut.slice(0, end + 1) : cut.trimEnd() + '.';
};

// What one shot of this character needs. Action first, then identity, place and style, so the
// action is never cut off. Fails closed on forbidden style references and on changed reference images.
export function composeCharacterShot({ character, styleId, action, studioId = null, lightingVariantId = 'base', refDir, referenceMode = 'legacy', preferredAngle = 'front' } = {}) {
  if (!character) throw new Error('A character is required.');
  if (character.requiresOwnerApproval || (typeof character.age === 'number' && character.age < 18)) {
    throw new Error('This character is blocked from shot composition pending owner review.');
  }
  if (typeof action !== 'string' || !action.trim()) throw new Error('A concrete action is required.');
  const style = loadStylePack(styleId || character.defaultStyle || 'realistic');
  if (character.styles && !character.styles.includes(style.id)) throw new Error(`${character.id} is not approved for style ${style.id}.`);
  const rig = character.rigs?.[style.id];
  if (rig || style.route !== 'diffusion-reference') {
    const route = rig || style.route;
    return { route, status: 'rigged', source: character.rigSources?.[route] || null,
      note: 'Rendered by its rig (same drawing every frame); do not send this character through FLUX/LTX.' };
  }
  const studio = studioId ? loadStudioPreset(studioId, lightingVariantId) : null;
  const sheet = sheetStatus(character, { refDir });
  if (Object.values(sheet.slots).includes('changed')) throw new Error(`${character.id} reference sheet changed after approval; re-approve it.`);
  let referenceSlots = SHOT_REFERENCES;
  if (referenceMode === 'three-angle' || referenceMode === 'closest-angle') {
    if (!THREE_ANGLE_SLOTS.includes(preferredAngle)) throw new Error('Invalid preferred reference angle.');
    referenceSlots = [preferredAngle, ...THREE_ANGLE_SLOTS.filter((slot) => slot !== preferredAngle)];
    if (!THREE_ANGLE_SLOTS.every((slot) => sheet.slots[slot] === 'approved')) {
      throw new Error('Three-angle references require approved front, left, and right portraits.');
    }
    if (referenceMode === 'closest-angle') referenceSlots = referenceSlots.slice(0, 1);
  } else if (referenceMode !== 'legacy') {
    throw new Error('Unknown character reference mode.');
  }
  const references = referenceSlots.filter((slot) => sheet.slots[slot] === 'approved')
    .map((slot) => ({ slot, refId: character.referenceSheet[slot].refId, sha256: character.referenceSheet[slot].sha256 }));
  const imagePrompt = fit([sentence(action), sentence(character.identityBlock),
    studio && `Setting: ${sentence(studio.set)}`, studio && `Light: ${sentence(studio.lighting)}`,
    references.length ? 'Keep the face, hair, build and clothing identical to the reference images.' : '',
    sentence(style.promptStyle)].filter(Boolean).join(' '));
  for (const banned of style.forbiddenReferences || []) {
    if (imagePrompt.toLowerCase().includes(banned.toLowerCase())) throw new Error(`Prompt names a forbidden style reference: ${banned}`);
  }
  return { route: style.route, status: references.length ? 'referenced' : 'text-only', imagePrompt, references,
    identityCheck: style.identityCheck, sheet: { approved: sheet.approved, complete: sheet.complete } };
}
