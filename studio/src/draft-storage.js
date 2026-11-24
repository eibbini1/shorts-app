const COMPOSER_KEY = 'studio-composer-draft-v1';

function getStorage(storage) {
  return storage ?? globalThis.localStorage;
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

export function readComposerDraft(storage) {
  try {
    const raw = getStorage(storage)?.getItem(COMPOSER_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    return {
      prompt: text(draft.prompt, 600),
      look: ['food', 'cartoon', 'night', 'custom'].includes(draft.look) ? draft.look : 'food',
      seconds: Number.isInteger(draft.seconds) && draft.seconds >= 10 && draft.seconds <= 60 ? draft.seconds : 10,
      orientation: draft.orientation === 'wide' ? 'wide' : 'vertical',
      ...(draft.continuityAnchor === 'previous-end' ? { continuityAnchor: 'previous-end' } : {}),
      ...(draft.quality === 'high' ? { quality: 'high' } : {}),
      audio: ['asmr', 'voiced', 'auto'].includes(draft.audio) ? draft.audio : 'asmr',
      ending: text(draft.ending, 300),
      setting: text(draft.setting, 200),
    };
  } catch {
    return null;
  }
}

export function writeComposerDraft(draft, storage) {
  try {
    getStorage(storage)?.setItem(COMPOSER_KEY, JSON.stringify({
      prompt: text(draft.prompt, 600),
      look: draft.look,
      seconds: draft.seconds,
      orientation: draft.orientation,
      continuityAnchor: draft.continuityAnchor,
      quality: draft.quality,
      audio: draft.audio,
      ending: text(draft.ending, 300),
      setting: text(draft.setting, 200),
    }));
  } catch {
    // Browser storage can be disabled or full; the Studio remains usable.
  }
}

function repairKey(sessionId, video) {
  return sessionId && video ? `studio-repair-guidance:${sessionId}:${video}` : null;
}

export function readRepairGuidance(sessionId, video, storage) {
  const key = repairKey(sessionId, video);
  if (!key) return null;
  try {
    const value = getStorage(storage)?.getItem(key);
    return value === null || value === undefined ? null : value.slice(0, 600);
  } catch {
    return null;
  }
}

export function writeRepairGuidance(sessionId, video, value, storage) {
  const key = repairKey(sessionId, video);
  if (!key) return;
  try {
    getStorage(storage)?.setItem(key, text(value, 600));
  } catch {
    // Browser storage can be disabled or full; the Studio remains usable.
  }
}

function preflightKey(sessionId, scenario) {
  return sessionId && scenario ? `studio-preflight-approved:${sessionId}:${scenario}` : null;
}

export function readPreflightApproval(sessionId, scenario, storage) {
  const key = preflightKey(sessionId, scenario);
  if (!key) return false;
  try {
    return getStorage(storage)?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function writePreflightApproval(sessionId, scenario, approved, storage) {
  const key = preflightKey(sessionId, scenario);
  if (!key) return;
  try {
    getStorage(storage)?.setItem(key, approved ? 'true' : 'false');
  } catch {
    // Browser storage can be disabled or full; the Studio remains usable.
  }
}
