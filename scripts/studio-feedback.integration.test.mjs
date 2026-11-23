// Product feedback over real HTTP: submission, persistence across restart, privacy between creators, owner-only management.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close((e) => e ? reject(e) : resolve(port)); });
});

const OWNER = 'owner-secret-token';
const ANA = 'ana-secret-token';
const BEN = 'ben-secret-token';

function setupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-feedback-it-'));
  for (const dir of ['scripts', 'storage/studio-sessions', 'studio/dist']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of fs.readdirSync(here).filter((n) => n.endsWith('.mjs') && !n.includes('.test.'))) {
    fs.copyFileSync(path.join(here, file), path.join(root, 'scripts', file));
  }
  fs.writeFileSync(path.join(root, 'storage', 'studio-users.json'), JSON.stringify({ users: [
    { name: 'Ana', token: ANA, dailyRenders: 3 }, { name: 'Ben', token: BEN, dailyRenders: 3 },
  ] }));
  return root;
}

async function start(root, extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, STUDIO_PORT: String(port), STUDIO_TOKEN: OWNER, STUDIO_USERS_FILE: path.join(root, 'storage', 'studio-users.json'), ...extraEnv },
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/me', { headers: { cookie: `studio_token=${OWNER}` } }); if (r.status === 200) return { child, base }; } catch { /* not up yet */ }
    await sleep(150);
  }
  child.kill();
  throw new Error('studio server did not start');
}

const api = (base, token) => async (method, route, payload, raw) => {
  const res = await fetch(base + route, {
    method, headers: { cookie: token ? `studio_token=${token}` : '', ...(payload || raw ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (payload ? JSON.stringify(payload) : undefined),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text };
};

test('product feedback: submit, privacy, owner management, persistence', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  let server;
  try {
    server = await start(root, { STUDIO_FEEDBACK_DAILY_LIMIT: '3' });
    const owner = api(server.base, OWNER), ana = api(server.base, ANA), ben = api(server.base, BEN), nobody = api(server.base, '');

    // FB-1 / FB-2: a creator submits and sees it in My feedback.
    const made = await ana('POST', '/api/product-feedback', { category: 'bug', title: 'Export button stuck', comment: 'It never finishes on my phone.', rating: 2 });
    assert.equal(made.status, 201, made.text);
    const id = made.data.item.id;
    assert.equal(made.data.item.status, 'new');
    const mine = await ana('GET', '/api/product-feedback');
    assert.deepEqual(mine.data.items.map((i) => i.id), [id]);

    // FB-3: another creator can neither list nor open it; scope=all is refused; unknown and foreign ids look identical.
    assert.deepEqual((await ben('GET', '/api/product-feedback')).data.items, []);
    assert.equal((await ben('GET', '/api/product-feedback?scope=all')).status, 403);
    const foreign = await ben('GET', `/api/product-feedback/item?id=${id}`);
    const missing = await ben('GET', '/api/product-feedback/item?id=fb-zzzzzzzz-00000000');
    assert.equal(foreign.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(foreign.text, missing.text);

    // Unauthenticated callers get nothing at all.
    assert.equal((await nobody('GET', '/api/product-feedback')).status, 401);

    // FB-4: management is owner-only.
    assert.equal((await ana('POST', '/api/product-feedback/update', { id, status: 'resolved' })).status, 403);
    assert.equal((await ben('POST', '/api/product-feedback/update', { id, status: 'resolved' })).status, 403);
    const inbox = await owner('GET', '/api/product-feedback?scope=all');
    assert.equal(inbox.status, 200);
    assert.equal(inbox.data.items.length, 1);
    assert.equal(inbox.data.items[0].user, 'Ana');

    // Owner triages: status, internal note (never shown to author), reply (shown to author).
    const updated = await owner('POST', '/api/product-feedback/update', { id, status: 'reviewing', note: 'INTERNAL-ONLY note', reply: 'Thanks, looking at it.' });
    assert.equal(updated.status, 200, updated.text);
    const seen = await ana('GET', `/api/product-feedback/item?id=${id}`);
    assert.equal(seen.status, 200);
    assert.equal(seen.data.status, 'reviewing');
    assert.ok(!seen.text.includes('INTERNAL-ONLY'), 'internal notes must never reach the author');
    assert.ok(seen.text.includes('Thanks, looking at it.'));
    assert.ok(JSON.stringify((await owner('GET', `/api/product-feedback/item?id=${id}`)).data).includes('INTERNAL-ONLY'));

    // FB-5: validation, duplicates, size cap, daily limit.
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'nope', title: 'abc', comment: 'abcdef' })).status, 400);
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'bug', title: '', comment: 'abcdef' })).status, 400);
    assert.equal((await ana('POST', '/api/product-feedback', null, 'not json{')).status, 400);
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'bug', title: 'big', comment: 'x'.repeat(40 * 1024) })).status, 400);
    const huge = JSON.stringify({ category: 'bug', title: 'big', comment: 'x'.repeat(4 * 1024 * 1024) });
    assert.equal((await ana('POST', '/api/product-feedback', null, huge)).status, 413);
    const again = await ana('POST', '/api/product-feedback', { category: 'bug', title: 'Export button stuck', comment: 'It never finishes on my phone.', rating: 2 });
    assert.equal(again.status, 200);
    assert.equal(again.data.duplicate, true);
    assert.equal((await ana('GET', '/api/product-feedback')).data.items.length, 1);
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'general', title: 'Second idea', comment: 'More templates please.' })).status, 201);
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'general', title: 'Third idea', comment: 'Dark theme option.' })).status, 201);
    assert.equal((await ana('POST', '/api/product-feedback', { category: 'general', title: 'Fourth idea', comment: 'Slower captions.' })).status, 429);
    // The limit is per person: Ben is unaffected.
    assert.equal((await ben('POST', '/api/product-feedback', { category: 'feature', title: 'Ben idea', comment: 'Add a timer.' })).status, 201);

    // A video reference to a session that is not available is refused, not silently stored.
    assert.equal((await ben('POST', '/api/product-feedback', { category: 'video', title: 'About a video', comment: 'It looks off.', sessionId: '1700000000000' })).status, 404);

    // /api/me tells the UI who may manage feedback.
    assert.equal((await owner('GET', '/api/me')).data.canManageFeedback, true);
    assert.equal((await ana('GET', '/api/me')).data.canManageFeedback, false);

    // The learning ledger is untouched by feedback.
    assert.equal(fs.existsSync(path.join(root, 'storage', 'studio-learning', 'runs.jsonl')), false);

    // FB-1: everything survives a restart.
    server.child.kill();
    await sleep(300);
    server = await start(root, { STUDIO_FEEDBACK_DAILY_LIMIT: '3' });
    const after = await api(server.base, ANA)('GET', `/api/product-feedback/item?id=${id}`);
    assert.equal(after.status, 200);
    assert.equal(after.data.status, 'reviewing');
    assert.equal((await api(server.base, ANA)('GET', '/api/product-feedback')).data.items.length, 3);
  } finally {
    server?.child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
const png = (w = 64, h = 64) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 3 + 1) * h, 0x7f))), chunk('IEND', Buffer.alloc(0))]);
};

test('product feedback screenshots: stored privately, served only to author and owner, bad files leave nothing behind', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  let server;
  try {
    server = await start(root);
    const owner = api(server.base, OWNER), ana = api(server.base, ANA), ben = api(server.base, BEN);
    const image = png();
    const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
    const base = { category: 'bug', title: 'With picture', comment: 'See the attached screenshot.' };
    const filesDir = path.join(root, 'storage', 'studio-feedback', 'files');

    const made = await ana('POST', '/api/product-feedback', { ...base, screenshot: dataUrl });
    assert.equal(made.status, 201, made.text);
    const id = made.data.item.id;
    assert.deepEqual(made.data.item.attachment, { mime: 'image/png', bytes: image.length });
    assert.ok(!made.text.includes('.png"'), 'the stored file name must not be returned');
    assert.equal(fs.readdirSync(filesDir).length, 1);
    assert.ok(!fs.readFileSync(path.join(root, 'storage', 'studio-feedback', 'submissions.jsonl'), 'utf8').includes('base64'), 'image data must not be copied into the log');

    // Author and owner get the exact bytes with safe headers; everyone else gets the same 404 as a missing item.
    for (const who of [ana, owner]) {
      const res = await fetch(server.base + `/api/product-feedback/screenshot?id=${id}`, { headers: { cookie: `studio_token=${who === ana ? ANA : OWNER}` } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.match(res.headers.get('cache-control'), /no-store/);
      assert.ok(Buffer.from(await res.arrayBuffer()).equals(image));
    }
    assert.equal((await ben('GET', `/api/product-feedback/screenshot?id=${id}`)).status, 404);
    assert.equal((await api(server.base, '')('GET', `/api/product-feedback/screenshot?id=${id}`)).status, 401);
    assert.equal((await ben('GET', '/api/product-feedback/screenshot?id=../../etc/passwd')).status, 404);

    // Refused uploads store nothing: wrong type, mislabelled bytes, too small, too big.
    const bad = (screenshot, title) => ana('POST', '/api/product-feedback', { ...base, title, screenshot });
    assert.equal((await bad('data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'gif one')).status, 400);
    assert.equal((await bad(`data:image/jpeg;base64,${image.toString('base64')}`, 'mislabelled')).status, 400);
    assert.equal((await bad(`data:image/png;base64,${png(16, 16).toString('base64')}`, 'tiny one')).status, 400);
    assert.equal((await bad(`data:image/png;base64,${Buffer.concat([image, Buffer.alloc(2.1 * 1024 * 1024)]).toString('base64')}`, 'too large')).status, 413);
    assert.equal(fs.readdirSync(filesDir).length, 1, 'rejected uploads must not leave files');

    // The same submission again is a duplicate and does not store a second copy.
    const again = await ana('POST', '/api/product-feedback', { ...base, screenshot: dataUrl });
    assert.equal(again.data.duplicate, true);
    assert.equal(fs.readdirSync(filesDir).length, 1);

    // A creator-b submission with its own screenshot stays out of Ana's reach.
    const other = await ben('POST', '/api/product-feedback', { ...base, title: 'Ben picture', screenshot: dataUrl });
    assert.equal(other.status, 201);
    assert.equal((await ana('GET', `/api/product-feedback/screenshot?id=${other.data.item.id}`)).status, 404);
  } finally {
    server?.child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
