// Pure notification logic for the Studio bell. No React and no browser globals except the optional storage
// argument, so every rule here is unit-tested. Events are derived only from status changes the server already
// reports (the live job over SSE and the sessions list); nothing here invents a result.
export const MAX_ITEMS = 50;
export const DEDUPE_MS = 15_000;
export const STORAGE_KEY = 'ishorts-notifications-v1';
export const PREFS_KEY = 'ishorts-notification-prefs-v1';

const ACTIVE = new Set(['running', 'stopping']);
const END = {
  done: { type: 'ready', severity: 'success' },
  failed: { type: 'failed', severity: 'error' },
  cancelled: { type: 'stopped', severity: 'info' },
  interrupted: { type: 'interrupted', severity: 'warning' },
};
const WHAT = {
  render: 'Video', 'sequence-motion': 'Shot motion', stills: 'First frames', draft: 'Plan', idea: 'Idea',
};

export function titleFor(kind, status) {
  const what = WHAT[kind] || 'Job';
  if (status === 'done') {
    if (kind === 'stills') return 'First frames ready to review';
    if (kind === 'draft') return 'Plan ready to review';
    if (kind === 'sequence-motion') return 'Shot motion ready';
    return `${what} ready`;
  }
  if (status === 'failed') return `${what} failed`;
  if (status === 'cancelled') return `${what} stopped`;
  if (status === 'interrupted') return `${what} interrupted`;
  return what;
}

// A notification is created only when a job we saw running reaches an end state. First sight of a session is a
// baseline, so opening the Studio never replays old history as new alerts.
export function eventFromTransition(prev, next, { detail = '' } = {}) {
  if (!prev || !next || next.id == null || String(prev.id) !== String(next.id)) return null;
  if (!ACTIVE.has(prev.status)) return null;
  const end = END[next.status];
  if (!end) return null;
  const kind = next.kind || prev.kind;
  return {
    sessionId: String(next.id), kind, status: next.status, type: end.type, severity: end.severity,
    title: titleFor(kind, next.status), project: String(next.name || next.prompt || '').slice(0, 80),
    detail: String(detail || '').slice(0, 160),
  };
}

export function sessionEvents(previous, sessions) {
  const events = [];
  const map = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (!session || session.id == null) continue;
    map.set(String(session.id), { id: String(session.id), status: session.status, kind: session.kind });
    const event = eventFromTransition(previous?.get(String(session.id)), session);
    if (event) events.push({ ...event, detail: 'Open the project for details.' });
  }
  return { events, map };
}

export function addEvent(items, event, now = Date.now(), makeId = () => `${now}-${Math.random().toString(36).slice(2, 8)}`) {
  const list = Array.isArray(items) ? items : [];
  const duplicate = list.some((item) => item.sessionId === event.sessionId && item.kind === event.kind &&
    item.status === event.status && now - item.at < DEDUPE_MS);
  if (duplicate) return list;
  return [{ ...event, id: makeId(), at: now, read: false }, ...list].slice(0, MAX_ITEMS);
}

export const unreadCount = (items) => (Array.isArray(items) ? items.filter((item) => !item.read).length : 0);
export const markAllRead = (items) => items.map((item) => (item.read ? item : { ...item, read: true }));
export const markRead = (items, id) => items.map((item) => (item.id === id && !item.read ? { ...item, read: true } : item));

const valid = (item) => item && typeof item.id === 'string' && typeof item.sessionId === 'string' &&
  typeof item.title === 'string' && Number.isFinite(item.at);

export function loadItems(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX_ITEMS) : [];
  } catch { return []; }
}
export function saveItems(storage, items) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS))); return true; } catch { return false; }
}
export function loadPrefs(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(PREFS_KEY) || '{}');
    return { sound: parsed.sound !== false, desktop: parsed.desktop === true };
  } catch { return { sound: true, desktop: false }; }
}
export function savePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify({ sound: prefs.sound !== false, desktop: prefs.desktop === true })); return true; }
  catch { return false; }
}

export function relativeTime(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Coalesce rapid SSE updates (one per log line) so React renders at most ~4 times a second, but never delay a
// change of job, kind or status.
export const COALESCE_MS = 250;
export function flushNow(shown, next) {
  return !shown || shown.id !== next.id || shown.status !== next.status || shown.kind !== next.kind;
}
