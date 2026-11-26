// Studio access rules over real HTTP: an unreadable users file must lock the Studio, a creator reaches only
// their own work folder, a symlink cannot lead out of a media folder, and a stills session that has no
// sequential review (sessions saved before it existed) can still have its frames approved.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close((e) => e ? reject(e) : resolve(port)); });
});

const OWNER = 'owner-secret-token';
const ANA = 'ana-secret-token';
const BEN = 'ben-secret-token';

function setupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-access-it-'));
  for (const dir of ['scripts', 'storage/studio-sessions', 'studio/dist', 'outputs', 'drafts/generated']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  for (const file of fs.readdirSync(here).filter((n) => n.endsWith('.mjs') && !n.includes('.test.'))) {
    fs.copyFileSync(path.join(here, file), path.join(root, 'scripts', file));
  }
  return root;
}
const usersFile = (root) => path.join(root, 'storage', 'studio-users.json');
const writeUsers = (root) => fs.writeFileSync(usersFile(root), JSON.stringify({ users: [
  { name: 'Ana', token: ANA, dailyRenders: 3 }, { name: 'Ben', token: BEN, dailyRenders: 3 },
] }));
const scenarioOf = (slug) => `drafts/generated/${slug}.local-scenario.json`;
const workOf = (slug) => `storage/any-local/${slug}.local-scenario`;

// One Studio project on disk: a two-shot story, its session, and its work folder. Returns the refs folder.
function addProject(root, id, user, slug) {
  fs.writeFileSync(path.join(root, scenarioOf(slug)), JSON.stringify({ plan: { shots: [{}, {}] } }));
  fs.writeFileSync(path.join(root, 'storage', 'studio-sessions', id + '.json'), JSON.stringify({
    id, user, name: slug, scenario: scenarioOf(slug), status: 'done', kind: 'stills', lines: [], steps: [] }));
  const refs = path.join(root, workOf(slug), 'refs');
  fs.mkdirSync(refs, { recursive: true });
  return refs;
}

async function start(root, extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, STUDIO_PORT: String(port), STUDIO_TOKEN: OWNER, STUDIO_USERS_FILE: usersFile(root), ...extraEnv },
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { await fetch(base + '/api/me'); return { child, base }; } catch { /* not up yet */ }
    await sleep(150);
  }
  child.kill();
  throw new Error('studio server did not start');
}
const stop = (server) => new Promise((resolve) => {
  if (!server || server.child.exitCode !== null) return resolve();
  server.child.once('exit', resolve);
  server.child.kill();
});
const get = (base, route, token) => fetch(base + route, { headers: token ? { cookie: `studio_token=${token}` } : {} });
const status = async (base, route, token) => (await get(base, route, token)).status;

test('an unreadable users file locks the Studio instead of opening it', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  let server;
  try {
    // No owner token and no users file: the plain local Studio stays open, as before.
    server = await start(root, { STUDIO_TOKEN: '' });
    assert.equal(await status(server.base, '/api/me'), 200);

    // Relatives are added (the file is read on every request, so no restart): a private link is now required.
    writeUsers(root);
    assert.equal(await status(server.base, '/api/me'), 401);
    assert.equal(await status(server.base, '/api/me', ANA), 200);

    // The file is caught half-written or damaged. Nobody may be let in, least of all as the owner.
    fs.writeFileSync(usersFile(root), '{"users":[{"name":"Ana","tok');
    assert.equal(await status(server.base, '/api/me'), 401, 'a damaged users file must not unlock the Studio');
    assert.equal(await status(server.base, '/api/me', ANA), 401);
    fs.writeFileSync(usersFile(root), JSON.stringify({ users: 'not a list' }));
    assert.equal(await status(server.base, '/api/me'), 401, 'a users file of the wrong shape must not unlock the Studio');
    fs.writeFileSync(usersFile(root), '[]');
    assert.equal(await status(server.base, '/api/me'), 401, 'a JSON array users file must fail closed instead of unlocking as empty');

    // Repairing the file restores the relatives' links.
    writeUsers(root);
    assert.equal(await status(server.base, '/api/me', ANA), 200);
    await stop(server);

    // With an owner token set, a damaged users file locks out relatives only.
    fs.writeFileSync(usersFile(root), '{"users":[');
    server = await start(root);
    assert.equal(await status(server.base, '/api/me', OWNER), 200);
    assert.equal(await status(server.base, '/api/me', ANA), 401);
    assert.equal(await status(server.base, '/api/me'), 401);
  } finally {
    await stop(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a creator opens files in their own work folder and nobody else\'s', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  writeUsers(root);
  const anaRefs = addProject(root, '1794900000101', 'Ana', 'ana-film');
  const benRefs = addProject(root, '1794900000102', 'Ben', 'ben-film');
  fs.writeFileSync(path.join(anaRefs, 'shot-0-aaaa.png'), 'ana frame');
  fs.writeFileSync(path.join(benRefs, 'shot-0-bbbb.png'), 'ben frame');
  const anaStill = '/media?p=' + workOf('ana-film') + '/refs/shot-0-aaaa.png';
  const benStill = '/media?p=' + workOf('ben-film') + '/refs/shot-0-bbbb.png';
  let server;
  try {
    server = await start(root);
    const own = await get(server.base, anaStill, ANA);
    assert.equal(own.status, 200, 'a creator must be able to see the first frames of their own film');
    assert.equal(await own.text(), 'ana frame');
    assert.equal(await status(server.base, benStill, BEN), 200);
    assert.equal(await status(server.base, benStill, ANA), 403);
    assert.equal(await status(server.base, anaStill, BEN), 403);
    assert.equal(await status(server.base, anaStill, OWNER), 200);
    assert.equal(await status(server.base, anaStill), 401);
    // The story file itself was already limited to its creator; keep it that way.
    assert.equal(await status(server.base, '/media?p=' + scenarioOf('ana-film'), ANA), 200);
    assert.equal(await status(server.base, '/media?p=' + scenarioOf('ana-film'), BEN), 403);
    // A folder that merely starts with the creator's project name belongs to someone else.
    fs.mkdirSync(path.join(root, 'storage/any-local/ana-film.local-scenario-copy'), { recursive: true });
    fs.writeFileSync(path.join(root, 'storage/any-local/ana-film.local-scenario-copy/x.png'), 'other');
    assert.equal(await status(server.base, '/media?p=storage/any-local/ana-film.local-scenario-copy/x.png', ANA), 403);
    // Unattended server queue belongs exclusively to the owner.
    assert.equal(await status(server.base, '/api/queue', ANA), 403);
    assert.equal(await status(server.base, '/api/queue', OWNER), 200);
  } finally {
    await stop(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a symlink inside a media folder cannot serve a file from outside it', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  writeUsers(root);
  fs.writeFileSync(path.join(root, 'outputs', 'real.json'), '{"ok":true}');
  fs.symlinkSync(path.join(root, 'outputs', 'real.json'), path.join(root, 'outputs', 'alias.json'));
  fs.symlinkSync(usersFile(root), path.join(root, 'outputs', 'leak.json'));
  let server;
  try {
    server = await start(root);
    assert.equal(await status(server.base, '/media?p=outputs/real.json', OWNER), 200);
    assert.equal(await status(server.base, '/media?p=outputs/alias.json', OWNER), 200, 'a link that stays inside the folder still works');
    const leak = await get(server.base, '/media?p=outputs/leak.json', OWNER);
    assert.equal(leak.status, 403, 'a link out of the media folder must not be followed');
    assert.ok(!(await leak.text()).includes(ANA), 'the users file must never be served');
    assert.equal(await status(server.base, '/media?p=outputs/missing.json', OWNER), 404);
    assert.equal(await status(server.base, '/media?p=storage/studio-users.json', OWNER), 403);
  } finally {
    await stop(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('first frames of a stills session without sequential review can be approved together', { timeout: 60_000 }, async () => {
  const root = setupRoot();
  writeUsers(root);
  const id = '1794900000201';
  const refs = addProject(root, id, 'Ana', 'legacy-film');
  const frames = [1, 2].map((shot) => {
    const file = `refs/shot-${shot - 1}-${'ab'.repeat(shot)}.png`;
    fs.writeFileSync(path.join(refs, path.basename(file)), `frame ${shot}`);
    return { shot, candidates: [{ candidate: 1, file, sha256: sha256(`frame ${shot}`) }] };
  });
  const work = path.join(root, workOf('legacy-film'));
  fs.writeFileSync(path.join(work, 'pending-first-frames.json'), JSON.stringify({
    schemaVersion: 1, scenarioSha256: sha256(fs.readFileSync(path.join(root, scenarioOf('legacy-film')))), frames }));
  let server;
  try {
    server = await start(root);
    const res = await fetch(server.base + '/api/approve-frames', {
      method: 'POST', headers: { cookie: `studio_token=${ANA}`, 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: scenarioOf('legacy-film'), sessionId: id,
        selections: [{ shot: 1, candidate: 1 }, { shot: 2, candidate: 1 }] }),
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const data = JSON.parse(text);
    assert.equal(data.ok, true);
    assert.equal(data.sequential, undefined);
    assert.deepEqual(data.stills.map((still) => still.shot), [1, 2]);
    const saved = JSON.parse(fs.readFileSync(path.join(work, 'first-frames.json'), 'utf8'));
    assert.equal(saved.reviewedBy, 'Ana');
    assert.deepEqual(saved.frames.map((frame) => frame.sha256), frames.map((frame) => frame.candidates[0].sha256));
  } finally {
    await stop(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
