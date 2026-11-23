import fs from 'node:fs';

const catalogue = JSON.parse(fs.readFileSync(new URL('../data/shot-types.json', import.meta.url)));
const enabledTypes = catalogue.types.filter(type => type.enabled);

// CPU-only recipe selection. No session, model, renderer, or learning-ledger access.
export function selectShotTypes({ enabled = process.env.SHORTS_SHOT_TYPES === '1',
  shotCount, typeIds = [], cameraMoves = [], saved = null } = {}) {
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
  const mix = enabledTypes.slice(0, Math.min(shotCount, 3));
  return Array.from({ length: shotCount }, (_, index) => {
    const id = typeIds[index] ?? mix[index % mix.length].id;
    const type = catalogue.types.find(type => type.id === id);
    if (!type) throw new Error('Unknown shot type: ' + id);
    if (!type.enabled) throw new Error('Shot type is disabled: ' + id);
    const camera = cameraMoves[index] ?? type.camera.default;
    if (camera !== 'locked' && !type.camera.allowedMoves.includes(camera)) {
      throw new Error('Camera movement has not been opted in for ' + id);
    }
    return { shotIndex: index, typeId: id, libraryVersion: catalogue.version, camera,
      framing: type.framing, stillPhase: type.stillPhase, stillStart: type.stillStart,
      background: structuredClone(type.background), motionTemplate: type.motionTemplate,
      forbiddenMotions: [...type.forbiddenMotions], seconds: type.seconds,
      expectedRisk: type.expectedRisk, riskStatus: type.riskStatus };
  });
}
