function normalizePrompt(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function sessionDisplayName(session, sessions = []) {
  const duplicates = sessions.filter((item) => item.id !== session.id && normalizePrompt(item.name) === normalizePrompt(session.name));
  if (!duplicates.length) return session.name;
  const stamp = Number(session.createdAt) || Number(session.id) || 0;
  const time = stamp ? new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : `#${String(session.id).slice(-4)}`;
  return `${session.name} · ${time}`;
}

export function findMatchingSession(prompt, sessions = [], selectedId = null) {
  const key = normalizePrompt(prompt);
  if (key.length < 6) return null;
  return sessions.filter((item) => normalizePrompt(item.prompt) === key)
    .sort((a, b) => (b.id === selectedId) - (a.id === selectedId) || (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0] || null;
}
