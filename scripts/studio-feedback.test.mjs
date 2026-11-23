import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import zlib from 'node:zlib';
import { CATEGORIES, FeedbackError, STATUSES, SCREENSHOT, boundedJson, createFeedbackStore, parseScreenshot, validateSubmission } from './studio-feedback.mjs';

const owner = { name: 'owner', role: 'owner' };
const mum = { name: 'Mum', role: 'creator' };
const dad = { name: 'Dad', role: 'creator' };
const good = { category: 'bug', title: 'Preview freezes', comment: 'The preview stops after two seconds.' };

function fresh(clock = { t: 1_700_000_000_000 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-'));
  let counter = 0;
  const store = createFeedbackStore({ dir, now: () => clock.t, randomHex: () => String(++counter).padStart(8, '0') });
  const add = (user, extra = {}, options = {}) => {
    const parsed = validateSubmission({ ...good, ...extra });
    assert.ok(parsed.value, parsed.error);
    clock.t += 120_000; // beyond the duplicate window unless a test wants otherwise
    return store.submit({ user, value: parsed.value, ...options });
  };
  return { dir, store, add, clock };
}
const throwsCode = (fn, code) => assert.throws(fn, (error) => error instanceof FeedbackError && error.code === code);

test('FB-2 validation: category, rating, title, comment, references', () => {
  assert.ok(validateSubmission(good).value);
  assert.equal(validateSubmission({ ...good, category: 'praise' }).error, 'Choose a category.');
  assert.match(validateSubmission({ ...good, rating: 6 }).error, /1 to 5/);
  assert.match(validateSubmission({ ...good, rating: 2.5 }).error, /1 to 5/);
  assert.equal(validateSubmission({ ...good, rating: '' }).value.rating, null);
  assert.equal(validateSubmission({ ...good, rating: '4' }).value.rating, 4);
  assert.match(validateSubmission({ ...good, title: 'ab' }).error, /title/);
  assert.match(validateSubmission({ ...good, title: 'x'.repeat(121) }).error, /title/);
  assert.match(validateSubmission({ ...good, comment: 'x'.repeat(4001) }).error, /Describe/);
  assert.match(validateSubmission({ ...good, sessionId: '../etc' }).error, /video reference/);
  assert.match(validateSubmission({ ...good, clientKey: 'short' }).error, /Reload/);
  assert.match(validateSubmission(null).error, /feedback form/);
  assert.deepEqual(CATEGORIES.length, 5);
  assert.deepEqual(STATUSES, ['new', 'reviewing', 'planned', 'resolved', 'closed']);
});

test('validation strips control characters and collapses title whitespace', () => {
  const { value } = validateSubmission({ ...good, title: '  Two\u0000   words\t here ', comment: 'line one\r\nline\u0007 two' });
  assert.equal(value.title, 'Two words here');
  assert.equal(value.comment, 'line one\nline two');
});

test('FB-1 a submission is listed for its author after a fresh store is opened', () => {
  const { dir, add } = fresh();
  const { item, duplicate } = add(mum);
  assert.equal(duplicate, false);
  assert.equal(item.status, 'new');
  const reopened = createFeedbackStore({ dir });
  const page = reopened.list({ viewer: mum });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, 'Preview freezes');
});

test('FB-3 a creator sees only their own feedback and cannot read or list others', () => {
  const { store, add } = fresh();
  const a = add(mum).item; const b = add(dad, { title: 'Dad request', category: 'feature' }).item;
  assert.deepEqual(store.list({ viewer: mum }).items.map((i) => i.id), [a.id]);
  assert.equal(store.get(b.id, mum), null);
  assert.equal(store.get('fb-doesnotexist-00000000', mum), null);
  assert.equal(store.get('not an id', mum), null);
  throwsCode(() => store.list({ viewer: mum, scope: 'all' }), 'forbidden');
  assert.equal(store.list({ viewer: owner, scope: 'all' }).items.length, 2);
});

test('FB-3/FB-4 internal notes and author names reach only the owner; replies reach the author', () => {
  const { store, add } = fresh();
  const { item } = add(mum);
  store.update({ id: item.id, viewer: owner, note: 'internal: check the cache', reply: 'Thanks, we are looking.', status: 'reviewing' });
  const seenByAuthor = store.get(item.id, mum);
  assert.equal(seenByAuthor.status, 'reviewing');
  assert.deepEqual(seenByAuthor.replies.map((r) => r.text), ['Thanks, we are looking.']);
  assert.equal('notes' in seenByAuthor, false);
  assert.equal('user' in seenByAuthor, false);
  assert.doesNotMatch(JSON.stringify(store.list({ viewer: mum })), /internal: check the cache/);
  const seenByOwner = store.get(item.id, owner);
  assert.deepEqual(seenByOwner.notes.map((n) => n.text), ['internal: check the cache']);
  assert.equal(seenByOwner.user, 'Mum');
});

test('FB-4/FB-5 only the owner updates; statuses are validated and replayed in order', () => {
  const { store, add } = fresh();
  const { item } = add(mum);
  throwsCode(() => store.update({ id: item.id, viewer: mum, status: 'closed' }), 'forbidden');
  throwsCode(() => store.update({ id: item.id, viewer: owner, status: 'done' }), 'bad-request');
  throwsCode(() => store.update({ id: item.id, viewer: owner }), 'bad-request');
  throwsCode(() => store.update({ id: item.id, viewer: owner, reply: '   ' }), 'bad-request');
  throwsCode(() => store.update({ id: item.id, viewer: owner, note: 'x'.repeat(2001) }), 'bad-request');
  throwsCode(() => store.update({ id: 'fb-abcdefgh-00000000', viewer: owner, status: 'closed' }), 'not-found');
  for (const status of ['reviewing', 'planned', 'resolved']) store.update({ id: item.id, viewer: owner, status });
  assert.equal(store.get(item.id, owner).status, 'resolved');
  assert.equal(store.list({ viewer: owner, scope: 'all', status: 'planned' }).items.length, 0);
  assert.equal(store.list({ viewer: owner, scope: 'all', status: 'resolved' }).items.length, 1);
});

test('FB-2 duplicates: the same client key or the same content within a minute is stored once', () => {
  const { store, add } = fresh();
  const first = add(mum, { clientKey: 'abc12345' });
  const again = store.submit({ user: mum, value: validateSubmission({ ...good, clientKey: 'abc12345', title: 'Changed' }).value });
  assert.equal(again.duplicate, true);
  assert.equal(again.item.id, first.item.id);
  const clock = { t: 1_700_000_000_000 };
  const f = fresh(clock);
  const value = validateSubmission(good).value;
  const one = f.store.submit({ user: mum, value });
  clock.t += 5_000;
  const two = f.store.submit({ user: mum, value: validateSubmission({ ...good, title: '  PREVIEW   freezes ' }).value });
  assert.equal(two.duplicate, true);
  assert.equal(two.item.id, one.item.id);
  clock.t += 61_000;
  assert.equal(f.store.submit({ user: mum, value }).duplicate, false);
  assert.equal(f.store.list({ viewer: mum }).total, 2);
  // another person sending the same words is not a duplicate
  assert.equal(f.store.submit({ user: dad, value }).duplicate, false);
});

test('FB-2 a daily limit stops floods but repeating a duplicate does not count against it', () => {
  const { store, add } = fresh();
  add(mum, { title: 'one' + 'a'.repeat(3) }, { dailyLimit: 2 });
  add(mum, { title: 'two' + 'b'.repeat(3) }, { dailyLimit: 2 });
  throwsCode(() => add(mum, { title: 'three ccc' }, { dailyLimit: 2 }), 'limit');
  assert.equal(add(dad, { title: 'dad one' }, { dailyLimit: 2 }).duplicate, false);
  assert.equal(store.list({ viewer: mum }).total, 2);
});

test('pagination walks newest first without gaps; a stale cursor is refused', () => {
  const { store, add } = fresh();
  const ids = [1, 2, 3, 4, 5].map((n) => add(mum, { title: `Request number ${n}` }).item.id);
  const first = store.list({ viewer: mum, limit: 2 });
  assert.deepEqual(first.items.map((i) => i.id), [ids[4], ids[3]]);
  assert.equal(first.total, 5);
  const second = store.list({ viewer: mum, limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((i) => i.id), [ids[2], ids[1]]);
  const last = store.list({ viewer: mum, limit: 2, cursor: second.nextCursor });
  assert.deepEqual(last.items.map((i) => i.id), [ids[0]]);
  assert.equal(last.nextCursor, null);
  throwsCode(() => store.list({ viewer: mum, cursor: 'fb-gone00000-00000000' }), 'bad-cursor');
  assert.equal(store.list({ viewer: mum, limit: 9999 }).items.length, 5);
});

test('search and filters; owner search can match the author, creators cannot', () => {
  const { store, add } = fresh();
  add(mum, { title: 'Audio is quiet', comment: 'The sound effects are too soft.', category: 'video' });
  add(dad, { title: 'Add dark mode', comment: 'A darker theme please.', category: 'feature' });
  assert.equal(store.list({ viewer: owner, scope: 'all', q: 'SOUND' }).items.length, 1);
  assert.equal(store.list({ viewer: owner, scope: 'all', category: 'feature' }).items[0].title, 'Add dark mode');
  assert.equal(store.list({ viewer: owner, scope: 'all', q: 'dad' }).items.length, 1);
  assert.equal(store.list({ viewer: mum, q: 'dad' }).items.length, 0);
  throwsCode(() => store.list({ viewer: owner, scope: 'all', status: 'bogus' }), 'bad-request');
  throwsCode(() => store.list({ viewer: owner, scope: 'all', category: 'bogus' }), 'bad-request');
});

test('a damaged line, an unknown event and an orphan event do not hide other entries', () => {
  const { dir, store, add } = fresh();
  const { item } = add(mum);
  fs.appendFileSync(path.join(dir, 'submissions.jsonl'), '{not json\n');
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ feedbackId: item.id, type: 'status', value: 'bogus', ts: 1 }) + '\n');
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ feedbackId: 'fb-orphan000-00000000', type: 'reply', value: 'x', ts: 1 }) + '\n');
  const got = store.get(item.id, mum);
  assert.equal(got.status, 'new');
  assert.equal(store.list({ viewer: owner, scope: 'all' }).total, 1);
});

test('context is stored as given and never includes prompt text; attachment paths are not exposed', () => {
  const { store, add } = fresh();
  const { item } = add(mum, {}, { context: { sessionId: '1700000000001', videoSha256: 'a'.repeat(64) },
    attachment: { file: 'files/secret-path.png', mime: 'image/png', bytes: 123, sha256: 'b'.repeat(64) } });
  assert.deepEqual(item.context, { sessionId: '1700000000001', videoSha256: 'a'.repeat(64) });
  assert.deepEqual(item.attachment, { mime: 'image/png', bytes: 123 });
  assert.doesNotMatch(JSON.stringify(store.get(item.id, mum)), /secret-path/);
  assert.equal(store.attachmentOf(item.id, dad), null);
  assert.equal(store.attachmentOf(item.id, mum).file, 'files/secret-path.png');
  assert.equal(store.attachmentOf(item.id, owner).file, 'files/secret-path.png');
});

test('boundedJson accepts normal bodies and returns 413 for oversized or 400 for broken JSON', async () => {
  const body = (chunks) => Readable.from(chunks.map((c) => Buffer.from(c)));
  assert.deepEqual((await boundedJson(body(['{"a":', '1}']), 100)).value, { a: 1 });
  assert.equal((await boundedJson(body(['x'.repeat(200)]), 100)).status, 413);
  assert.equal((await boundedJson(body(['{oops']), 100)).status, 400);
  assert.deepEqual((await boundedJson(body([]), 100)).value, {});
});

// ---- S3 screenshots ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
export function makePng(width = 64, height = 64) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x7f);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const makeJpeg = (width = 64, height = 64) => {
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
};
const url = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
const refuses = (fn, status) => assert.throws(fn, (e) => e instanceof FeedbackError && (status === undefined || e.status === status));

test('S3 screenshots: PNG and JPEG are accepted and identified by their own header', () => {
  assert.deepEqual({ ...parseScreenshot(url('image/png', makePng())), buffer: undefined }, { buffer: undefined, mime: 'image/png', ext: 'png' });
  assert.equal(parseScreenshot(url('image/jpeg', makeJpeg())).ext, 'jpg');
});

test('S3 screenshots: other types, mislabelled bytes, tiny or oversized images are refused', () => {
  refuses(() => parseScreenshot(url('image/gif', Buffer.from('GIF89a......'))), 400);
  refuses(() => parseScreenshot(url('image/png', makeJpeg())), 400); // declared PNG, JPEG bytes
  refuses(() => parseScreenshot(url('image/jpeg', makePng())), 400);
  refuses(() => parseScreenshot('data:image/png;base64,AAAA'), 400);
  refuses(() => parseScreenshot('not a data url'), 400);
  refuses(() => parseScreenshot(url('image/png', makePng(32, 32))), 400);
  refuses(() => parseScreenshot(url('image/png', makePng(9000, 64))), 400);
  refuses(() => parseScreenshot(url('image/png', Buffer.concat([makePng(), Buffer.alloc(SCREENSHOT.maxBytes)]))), 413);
});

test('S3 screenshots: saved whole under a random name, readable by the author and owner only, never exposed as a path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-shot-'));
  const store = createFeedbackStore({ dir });
  const shot = parseScreenshot(url('image/png', makePng()));
  const attachment = store.saveScreenshot(shot);
  assert.match(attachment.file, /^[0-9a-f]{32}\.png$/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'files')), [attachment.file]); // no temp leftovers
  const { item } = store.submit({ user: mum, value: validateSubmission(good).value, attachment });
  assert.deepEqual(item.attachment, { mime: 'image/png', bytes: shot.buffer.length });
  assert.ok(!JSON.stringify(item).includes(attachment.file));
  assert.equal(store.attachmentOf(item.id, mum).file, attachment.file);
  assert.equal(store.attachmentOf(item.id, owner).file, attachment.file);
  assert.equal(store.attachmentOf(item.id, dad), null);
  assert.equal(store.screenshotPath({ file: '../../etc/passwd' }), null);
  assert.equal(store.screenshotPath({ file: 'a'.repeat(32) + '.png' }), path.join(dir, 'files', 'a'.repeat(32) + '.png')); // well-formed names resolve inside files/
  store.discardScreenshot(attachment);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'files')), []);
});
