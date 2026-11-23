// Pure helpers for the iShorts feedback panel. Limits mirror scripts/studio-feedback.mjs; the server stays the authority.
export const CATEGORIES = [
  ['bug', 'Bug'], ['feature', 'Feature request'], ['general', 'General'], ['video', 'Video quality'], ['improvement', 'Improvement'],
];
export const STATUSES = [
  ['new', 'New'], ['reviewing', 'Reviewing'], ['planned', 'Planned'], ['resolved', 'Resolved'], ['closed', 'Closed'],
];
export const LIMITS = { title: [3, 120], comment: [3, 4000], note: 2000, reply: 2000 };

export const labelOf = (list, key) => (list.find(([k]) => k === key) || [key, key || ''])[1];

export function emptyDraft(sessionId = '') {
  return { category: 'general', rating: 0, title: '', comment: '', sessionId };
}

// Returns field errors in plain language; an empty object means the draft can be sent.
export function validateDraft(draft) {
  const errors = {};
  const title = String(draft.title || '').trim();
  const comment = String(draft.comment || '').trim();
  if (!CATEGORIES.some(([k]) => k === draft.category)) errors.category = 'Choose a type.';
  if (title.length < LIMITS.title[0]) errors.title = `Add a short title (at least ${LIMITS.title[0]} characters).`;
  else if (title.length > LIMITS.title[1]) errors.title = `Keep the title under ${LIMITS.title[1]} characters.`;
  if (comment.length < LIMITS.comment[0]) errors.comment = 'Tell us what happened or what you would like.';
  else if (comment.length > LIMITS.comment[1]) errors.comment = `Keep the details under ${LIMITS.comment[1]} characters.`;
  return errors;
}

// A key generated once per open form, so a double-click or retry cannot create two entries.
export function newClientKey(random = () => Math.random().toString(36).slice(2, 10)) {
  return `c${Date.now().toString(36)}${random()}${random()}`.slice(0, 40);
}

export function buildPayload(draft, clientKey) {
  const payload = {
    category: draft.category, title: String(draft.title).trim(), comment: String(draft.comment).trim(), clientKey,
  };
  if (draft.rating >= 1 && draft.rating <= 5) payload.rating = draft.rating;
  if (draft.sessionId) payload.sessionId = String(draft.sessionId);
  return payload;
}

export function listQuery({ scope = 'mine', status = '', category = '', q = '', cursor = '' } = {}) {
  const params = new URLSearchParams();
  if (scope === 'all') params.set('scope', 'all');
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (q.trim()) params.set('q', q.trim());
  if (cursor) params.set('cursor', cursor);
  const text = params.toString();
  return text ? `?${text}` : '';
}

// Short, plain sentence for a status as the author sees it.
export function statusHint(status) {
  return ({
    new: 'Received. Not read yet.', reviewing: 'We are looking at this.', planned: 'Planned for a future update.',
    resolved: 'Done. Thank you.', closed: 'Closed.',
  })[status] || '';
}

export const unreadReply = (item) => Boolean(item?.replies?.length);
