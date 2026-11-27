const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'before', 'beside', 'by', 'chef', 'create',
  'creates', 'film', 'for', 'from', 'in', 'into', 'is', 'make', 'makes', 'of', 'on',
  'one', 'or', 'over', 'show', 'shows', 'short', 'story', 'the', 'then', 'this',
  'small', 'to', 'up', 'video', 'with',
]);

export function normalizeSessionPrompt(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function sessionTitle(prompt) {
  const words = String(prompt || '').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  const useful = words.filter((word) => !TITLE_STOP_WORDS.has(word.toLocaleLowerCase()));
  const selected = (useful.length >= 2 ? useful : words).slice(0, 5);
  if (!selected.length) return 'New project';
  return selected.map((word) => word[0].toLocaleUpperCase() + word.slice(1)).join(' ').slice(0, 48).trim();
}

export function createSessionId(existingIds, now = Date.now()) {
  const latest = [...existingIds].map(Number).filter(Number.isSafeInteger).reduce((max, id) => Math.max(max, id), 0);
  const timestamp = Number.isSafeInteger(now) && now > 0 ? now : Date.now();
  const next = Math.max(timestamp, latest + 1);
  if (next > 9999999999999999) throw new Error('Studio session ID limit reached.');
  return String(next);
}

export function draftTimeoutMs(seconds, configured = '') {
  const override = Number(configured);
  if (String(configured).trim() && Number.isFinite(override) && override > 0) return override;
  const duration = Number(seconds);
  return Math.max(480000, (Number.isFinite(duration) && duration > 0 ? duration : 30) * 16000);
}

export function draftIdleTimeoutMs(seconds, configured = '') {
  const override = Number(configured);
  if (String(configured).trim() && Number.isFinite(override) && override > 0) return override;
  const duration = Number(seconds);
  return Math.max(900000, (Number.isFinite(duration) && duration > 0 ? duration : 30) * 15000);
}
