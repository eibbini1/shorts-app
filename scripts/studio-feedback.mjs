// Product feedback for iShorts Studio: validation plus a small append-only store.
//
// Two JSONL files under one directory:
//   submissions.jsonl  one immutable line per submission
//   events.jsonl       one line per owner action: status change, internal note, or reply to the author
// Current state is rebuilt by replaying events, so history is never rewritten. This is deliberately
// separate from the learning ledger (runs.jsonl): nothing written here can steer future plans.
// No dependencies. The viewer is the Studio user object ({ name, role }); owner is the only admin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORIES = ['bug', 'feature', 'general', 'video', 'improvement'];
export const STATUSES = ['new', 'reviewing', 'planned', 'resolved', 'closed'];
export const LIMITS = { title: [3, 120], comment: [3, 4000], note: 2000, reply: 2000, textBody: 16 * 1024, page: 100, defaultPage: 25 };

const FEEDBACK_ID = /^fb-[a-z0-9]{6,12}-[0-9a-f]{8}$/;
const SESSION_ID = /^\d{10,16}$/;
const CLIENT_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const DUPLICATE_WINDOW_MS = 60_000;

export class FeedbackError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status = 400) => { throw new FeedbackError(code, message, status); };

export const isFeedbackId = (value) => FEEDBACK_ID.test(String(value));

// Remove control characters but keep tabs and line breaks; normalise line endings.
const text = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
const length = (value) => [...value].length;
const normalise = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();

export function validateSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Send the feedback form.' };
  if (!CATEGORIES.includes(input.category)) return { error: 'Choose a category.' };
  let rating = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== '') {
    rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5 stars, or leave it empty.' };
  }
  const title = text(input.title).replace(/\s+/g, ' ');
  if (length(title) < LIMITS.title[0] || length(title) > LIMITS.title[1]) {
    return { error: `Give it a title of ${LIMITS.title[0]} to ${LIMITS.title[1]} characters.` };
  }
  const comment = text(input.comment);
  if (length(comment) < LIMITS.comment[0] || length(comment) > LIMITS.comment[1]) {
    return { error: `Describe it in ${LIMITS.comment[0]} to ${LIMITS.comment[1]} characters.` };
  }
  let sessionId = null;
  if (input.sessionId !== undefined && input.sessionId !== null && input.sessionId !== '') {
    sessionId = String(input.sessionId);
    if (!SESSION_ID.test(sessionId)) return { error: 'That video reference is not valid.' };
  }
  let clientKey = null;
  if (input.clientKey !== undefined && input.clientKey !== null && input.clientKey !== '') {
    clientKey = String(input.clientKey);
    if (!CLIENT_KEY.test(clientKey)) return { error: 'Reload the page and try again.' };
  }
  const screenshot = typeof input.screenshot === 'string' && input.screenshot ? input.screenshot : null;
  if (input.screenshot !== undefined && input.screenshot !== null && input.screenshot !== '' && screenshot === null) {
    return { error: 'The screenshot could not be read.' };
  }
  return { value: { category: input.category, rating, title, comment, sessionId, clientKey, screenshot } };
}

// Read a JSON request body, refusing anything larger than `limit` bytes.
export function boundedJson(req, limit) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0; let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return resolve({ error: 'That is too large to send. Shorten the text or use a smaller screenshot.', status: 413 });
      try { return resolve({ value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }); }
      catch { return resolve({ error: 'The request could not be read.', status: 400 }); }
    });
    req.on('error', () => resolve({ error: 'The request could not be read.', status: 400 }));
  });
}

export function createFeedbackStore({ dir, now = () => Date.now(), randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex') }) {
  const submissionsFile = path.join(dir, 'submissions.jsonl');
  const eventsFile = path.join(dir, 'events.jsonl');

  const readLines = (file) => {
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
    // A damaged line is skipped instead of hiding every other entry.
    return raw.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  };
  const append = (file, record) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(file, JSON.stringify(record) + '\n', { mode: 0o600 });
  };

  function replay() {
    const items = new Map();
    for (const row of readLines(submissionsFile)) {
      if (!isFeedbackId(row.id) || !CATEGORIES.includes(row.category)) continue;
      items.set(row.id, { ...row, status: 'new', notes: [], replies: [], updatedAt: row.ts });
    }
    for (const event of readLines(eventsFile)) {
      const item = items.get(event.feedbackId);
      if (!item) continue;
      if (event.type === 'status' && STATUSES.includes(event.value)) item.status = event.value;
      else if (event.type === 'note' && typeof event.value === 'string') item.notes.push({ ts: event.ts, text: event.value });
      else if (event.type === 'reply' && typeof event.value === 'string') item.replies.push({ ts: event.ts, text: event.value });
      else continue;
      item.updatedAt = Math.max(item.updatedAt, Number(event.ts) || 0);
    }
    return [...items.values()];
  }

  const isOwner = (viewer) => viewer?.role === 'owner';
  const mayRead = (viewer, item) => isOwner(viewer) || item.user === viewer?.name;

  // What leaves the server. Internal notes and the author's name go to the owner only; file paths never leave.
  function present(item, viewer) {
    const shown = {
      id: item.id, ts: item.ts, updatedAt: item.updatedAt, category: item.category, rating: item.rating,
      title: item.title, comment: item.comment, status: item.status, context: item.context || {},
      attachment: item.attachment ? { mime: item.attachment.mime, bytes: item.attachment.bytes } : null,
      replies: item.replies,
    };
    if (isOwner(viewer)) { shown.user = item.user; shown.notes = item.notes; }
    return shown;
  }

  const dayKey = (ts) => new Date(ts).toDateString();

  return {
    // Idempotent: the same client key, or the same content within a minute, returns the first copy.
    submit({ user, value, context = {}, attachment = null, dailyLimit }) {
      const all = readLines(submissionsFile);
      const mine = all.filter((row) => row.user === user.name);
      if (value.clientKey) {
        const same = mine.find((row) => row.clientKey === value.clientKey);
        if (same) return { item: present(replay().find((i) => i.id === same.id) || { ...same, status: 'new', notes: [], replies: [], updatedAt: same.ts }, user), duplicate: true };
      }
      const fingerprint = crypto.createHash('sha256').update([value.category, normalise(value.title), normalise(value.comment)].join('\n')).digest('hex');
      const at = now();
      const repeat = mine.find((row) => row.fingerprint === fingerprint && at - row.ts < DUPLICATE_WINDOW_MS);
      if (repeat) return { item: present(replay().find((i) => i.id === repeat.id), user), duplicate: true };
      if (dailyLimit && mine.filter((row) => dayKey(row.ts) === dayKey(at)).length >= dailyLimit) {
        fail('limit', `That is today's limit of ${dailyLimit} feedback messages. Try again tomorrow.`, 429);
      }
      const record = {
        id: `fb-${at.toString(36)}-${randomHex(4)}`, ts: at, user: user.name, category: value.category, rating: value.rating,
        title: value.title, comment: value.comment, clientKey: value.clientKey || undefined, fingerprint, context,
        ...(attachment ? { attachment } : {}),
      };
      append(submissionsFile, record);
      return { item: present({ ...record, status: 'new', notes: [], replies: [], updatedAt: at }, user), duplicate: false };
    },

    list({ viewer, scope = 'mine', status, category, q, cursor, limit } = {}) {
      if (scope === 'all' && !isOwner(viewer)) fail('forbidden', 'Only the owner can see everyone\'s feedback.', 403);
      if (status && !STATUSES.includes(status)) fail('bad-request', 'Unknown status.');
      if (category && !CATEGORIES.includes(category)) fail('bad-request', 'Unknown category.');
      const needle = normalise(String(q || ''));
      let rows = replay()
        .filter((item) => (scope === 'all' ? true : item.user === viewer?.name))
        .filter((item) => (!status || item.status === status) && (!category || item.category === category))
        .filter((item) => !needle || normalise(`${item.title} ${item.comment}${isOwner(viewer) && scope === 'all' ? ' ' + item.user : ''}`).includes(needle))
        .sort((a, b) => b.ts - a.ts || (a.id < b.id ? 1 : -1));
      const total = rows.length;
      if (cursor) {
        const index = rows.findIndex((item) => item.id === cursor);
        if (index < 0) fail('bad-cursor', 'That page is no longer available. Reload the list.');
        rows = rows.slice(index + 1);
      }
      const size = Math.min(LIMITS.page, Math.max(1, Math.floor(Number(limit)) || LIMITS.defaultPage));
      const page = rows.slice(0, size);
      return { items: page.map((item) => present(item, viewer)), nextCursor: rows.length > size ? page.at(-1).id : null, total };
    },

    // Not found and not allowed look the same, so ids of other people's feedback cannot be probed.
    get(id, viewer) {
      if (!isFeedbackId(id)) return null;
      const item = replay().find((row) => row.id === id);
      return item && mayRead(viewer, item) ? present(item, viewer) : null;
    },

    // Raw record for the owner or the author, used to serve an attachment.
    attachmentOf(id, viewer) {
      if (!isFeedbackId(id)) return null;
      const item = replay().find((row) => row.id === id);
      return item?.attachment && mayRead(viewer, item) ? item.attachment : null;
    },

    update({ id, viewer, status, note, reply }) {
      if (!isOwner(viewer)) fail('forbidden', 'Only the owner can manage feedback.', 403);
      const item = isFeedbackId(id) ? replay().find((row) => row.id === id) : null;
      if (!item) fail('not-found', 'That feedback was not found.', 404);
      const events = [];
      if (status !== undefined) {
        if (!STATUSES.includes(status)) fail('bad-request', 'Unknown status.');
        events.push({ type: 'status', value: status });
      }
      for (const [type, raw, max] of [['note', note, LIMITS.note], ['reply', reply, LIMITS.reply]]) {
        if (raw === undefined) continue;
        const value = text(raw);
        if (!value || length(value) > max) fail('bad-request', `A ${type} needs 1 to ${max} characters.`);
        events.push({ type, value });
      }
      if (!events.length) fail('bad-request', 'Choose a status, note or reply.');
      const at = now();
      for (const event of events) append(eventsFile, { id: `ev-${at.toString(36)}-${randomHex(4)}`, ts: at, feedbackId: id, actor: viewer.name, ...event });
      return present(replay().find((row) => row.id === id), viewer);
    },
  };
}
