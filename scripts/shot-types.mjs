import fs from 'node:fs';

const catalogue = JSON.parse(fs.readFileSync(new URL('../data/shot-types.json', import.meta.url)));
const enabledTypes = catalogue.types.filter(type => type.enabled);

// CPU-only recipe selection. No session, model, renderer, or learning-ledger access.
export function selectShotTypes({ enabled = process.env.SHORTS_SHOT_TYPES === '1',
  shotCount, beats = [], typeIds = [], cameraMoves = [], saved = null } = {}) {
  if (!enabled) return null;
  if (!Number.isInteger(shotCount) || shotCount < 1 || shotCount > 60) {
    throw new Error('shotCount must be an integer from 1 to 60.');
  }
  if (!Array.isArray(typeIds) || !Array.isArray(cameraMoves)) throw new Error('Shot choices must be arrays.');
  if (typeIds.length > shotCount || cameraMoves.length > shotCount) throw new Error('Too many shot choices.');
  if (saved) {
    if (!Array.isArray(saved) || saved.length !== shotCount) throw new Error('Saved recipe count changed.');
    for (const row of saved) {
      const type = enabledTypes.find(type => type.id === row.typeId);
      if (!type || row.libraryVersion !== catalogue.version ||
          (row.camera !== 'locked' && !type.camera.allowedMoves.includes(row.camera))) {
        throw new Error('Saved recipe version, type or camera is unavailable.');
      }
    }
    return structuredClone(saved);
  }
  if (!Array.isArray(beats) || (beats.length && beats.length !== shotCount)) {
    throw new Error('The beat count must match shotCount.');
  }
  const defaultKinds = shotCount === 1 ? ['action'] : shotCount === 2
    ? ['action', 'feeling'] : ['place', 'action', 'feeling'];
  const typeForBeat = (beat) => {
    const kind = typeof beat === 'string' ? beat : beat?.kind;
    if (kind === 'place') return 'wide-establishing';
    if (kind === 'feeling') return 'face-led-portrait';
    if (kind === 'detail' || (kind === 'action' && beat?.scale === 'detail')) return 'macro-detail';
    if (kind === 'action') return 'hands-in-action';
    throw new Error('Unknown beat kind: ' + kind);
  };
  return Array.from({ length: shotCount }, (_, index) => {
    const id = typeIds[index] ?? typeForBeat(beats[index] ?? defaultKinds[index % defaultKinds.length]);
    const type = catalogue.types.find(type => type.id === id);
    if (!type) throw new Error('Unknown shot type: ' + id);
    if (!type.enabled) throw new Error('Shot type is disabled: ' + id);
    const camera = cameraMoves[index] ?? type.camera.default;
    if (camera !== 'locked' && !type.camera.allowedMoves.includes(camera)) {
      throw new Error('Camera movement has not been opted in for ' + id);
    }
    return { shotIndex: index, typeId: id, libraryVersion: catalogue.version, camera,
      framing: type.framing, stillPhase: type.stillPhase,
      stillTemplate: type.stillTemplate, examples: structuredClone(type.examples),
      background: structuredClone(type.background), motionTemplate: type.motionTemplate,
      forbiddenMotions: [...type.forbiddenMotions], seconds: type.seconds,
      expectedRisk: type.expectedRisk, riskStatus: type.riskStatus };
  });
}


// This materializes caller-reviewed text; it does not invent or verify an action.
export function materializeShotRecipe(recipe, { action, startState } = {}) {
  if (typeof action !== 'string' || !action.trim()) throw new Error('A concrete action is required.');
  if (typeof startState !== 'string' || !startState.trim()) throw new Error('An already-underway start state is required.');
  if (typeof recipe?.stillTemplate !== 'string' || typeof recipe?.motionTemplate !== 'string') {
    throw new Error('A current shot recipe is required.');
  }
  const clean = text => text.trim().replace(/[.!?]+$/, '');
  const fill = template => template.replaceAll('{action}', clean(action))
    .replaceAll('{startState}', clean(startState));
  return {
    imagePrompt: recipe.framing + '. ' + fill(recipe.stillTemplate),
    motionPrompt: fill(recipe.motionTemplate),
  };
}
