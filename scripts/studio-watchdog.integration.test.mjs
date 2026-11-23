// Integration test: runs the REAL studio-server.mjs in a throwaway root, with a stub render script that
// misbehaves on demand (crash, stall, QA failure, slow-but-chatty). Exercises real spawn, signals and retry.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-wd-'));
let server; let port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STUB = `#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo run >> "$ROOT/runs.txt"
N=$(wc -l < "$ROOT/runs.txt" | tr -d ' ')
MODE="$(cat "$ROOT/mode.txt")"
echo "stub start mode=$MODE attempt=$N"
ok() { mkdir -p "$ROOT/outputs"; echo fake > "$ROOT/outputs/ok.mp4"; echo "Studio verified export: outputs/ok.mp4"; node "$ROOT/scripts/fixture-take-report.mjs"; exit 0; }
case "$MODE" in
  crash-once) if [ "$N" = 1 ]; then kill -9 $$; fi; ok ;;
  crash-always) kill -9 $$ ;;
  qa-fail) echo "Technical QA failed: duration"; exit 1 ;;
  stall-once) if [ "$N" = 1 ]; then sleep 60; fi; ok ;;
  chatty) for i in 1 2 3 4 5 6 7 8 9 10; do echo "progress $i"; sleep 0.4; done; ok ;;
  hang) sleep 60 ;;
esac
`;

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const api = async (p, opts) => (await fetch(`http://127.0.0.1:${port}${p}`, opts)).json();
const post = (p, b) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
const runs = () => (fs.existsSync(path.join(root, 'runs.txt')) ? fs.readFileSync(path.join(root, 'runs.txt'), 'utf8').split('\n').filter(Boolean).length : 0);

async function runMode(mode, { until = 25_000 } = {}) {
  fs.writeFileSync(path.join(root, 'mode.txt'), mode);
  fs.rmSync(path.join(root, 'runs.txt'), { force: true });
  const started = await post('/api/render', { scenario: 'drafts/generated/t.local-scenario.json' });
  assert.equal(started.status, 'running', JSON.stringify(started).slice(0, 300));
  const deadline = Date.now() + until;
  let state;
  do { await sleep(300); state = await api('/api/state'); } while (state.status === 'running' && Date.now() < deadline);
  await sleep(300); // let a retry that was just launched show up
  while (state.status === 'running' && Date.now() < deadline) { await sleep(300); state = await api('/api/state'); }
  return api('/api/state');
}

before(async () => {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  for (const f of fs.readdirSync(here)) if (f.endsWith('.mjs') && !f.includes('.test.')) fs.copyFileSync(path.join(here, f), path.join(root, 'scripts', f));
  fs.writeFileSync(path.join(root, 'scripts', 'make-local-video.sh'), STUB, { mode: 0o755 });
  fs.mkdirSync(path.join(root, 'drafts', 'generated'), { recursive: true });
  const scenarioFile = path.join(root, 'drafts', 'generated', 't.local-scenario.json');
  fs.writeFileSync(scenarioFile, JSON.stringify({ plan: { shots: [{}] } }));
  // the render endpoint refuses plans without reviewed first frames, so give it a valid one-frame manifest
  const work = path.join(root, 'storage', 'any-local', 't.local-scenario');
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'f1.png'), 'frame');
  const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(path.join(work, 'first-frames.json'), JSON.stringify({
    schemaVersion: 1, scenarioSha256: sha(scenarioFile), referenceManifestSha256: null,
    frames: [{ shot: 1, file: 'f1.png', sha256: sha(path.join(work, 'f1.png')) }] }));
  fs.writeFileSync(path.join(root, 'scripts', 'fixture-take-report.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const work = 'storage/any-local/t.local-scenario';
const clip = path.join(work, 'motion.mp4');
fs.writeFileSync(clip, 'fixture motion');
const clipSha256 = hash(clip);
const row = {schemaVersion:1,shot:1,take:0,parts:1,
  scenarioSha256:hash('drafts/generated/t.local-scenario.json'),
  approvedReferenceSha256:hash(path.join(work,'f1.png')),
  clip:'motion.mp4',clipSha256,
  segments:[{clip:'motion.mp4',sha256:clipSha256,seed:2200}],
  renderSettings:{quality:'standard',width:384,height:640,frames:97,fps:24,editor:'ffmpeg',model:null,gemma:null}};
fs.writeFileSync(process.env.SHORTS_STUDIO_TAKE_REPORT,JSON.stringify([row]));
`);
  port = await freePort();
  server = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, STUDIO_PORT: String(port), STUDIO_RENDER_IDLE_TIMEOUT_MS: '1500' },
  });
  let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i += 1) { try { await fetch(`http://127.0.0.1:${port}/api/state`); return; } catch { await sleep(200); } }
  throw new Error('studio server did not start: ' + log.slice(0, 500));
});

after(() => { server?.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); });

test('WD-3 crash once: automatically retried once, then succeeds', async () => {
  const s = await runMode('crash-once');
  assert.equal(s.status, 'done');
  assert.equal(runs(), 2);
  assert.equal(s.watchdog.retries, 1);
  assert.equal(s.attempts.length, 1);
  assert.equal(s.attempts[0].status, 'failed');
});

test('WD-3 crash twice: exactly one retry, then stops and says why', async () => {
  const s = await runMode('crash-always');
  assert.equal(s.status, 'failed');
  assert.equal(runs(), 2);
  assert.equal(s.watchdog.lastFault, 'crash');
  assert.equal(s.watchdog.retries, 1);
});

test('WD-3 a QA failure is rejected work, not retried', async () => {
  const s = await runMode('qa-fail');
  assert.equal(s.status, 'failed');
  assert.equal(runs(), 1);
  assert.equal(s.watchdog.retries, 0);
});

test('WD-1 + WD-5 a silent job is stopped, retried once, and a bystander process survives', async () => {
  const bystander = spawn('sleep', ['300'], { stdio: 'ignore' });
  try {
    const s = await runMode('stall-once');
    assert.equal(s.status, 'done');
    assert.equal(runs(), 2);
    assert.match(s.attempts[0].error, /no output for \d+ minutes/);
    assert.equal(s.watchdog.retries, 1);
    assert.doesNotThrow(() => process.kill(bystander.pid, 0), 'unrelated process was killed');
  } finally { bystander.kill('SIGKILL'); }
});

test('WD-2 a slow job that keeps printing is not stopped', async () => {
  const s = await runMode('chatty');
  assert.equal(s.status, 'done');
  assert.equal(runs(), 1);
  assert.equal(s.watchdog.retries, 0);
});

test('a user cancel is never retried', async () => {
  fs.writeFileSync(path.join(root, 'mode.txt'), 'hang');
  fs.rmSync(path.join(root, 'runs.txt'), { force: true });
  await post('/api/render', { scenario: 'drafts/generated/t.local-scenario.json' });
  await sleep(800);
  await post('/api/cancel');
  let s; for (let i = 0; i < 30; i += 1) { await sleep(300); s = await api('/api/state'); if (s.status !== 'running' && s.status !== 'stopping') break; }
  await sleep(500);
  s = await api('/api/state');
  assert.equal(s.status, 'cancelled');
  assert.equal(runs(), 1);
});
