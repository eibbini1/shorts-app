// A restarted Studio must keep a take reservation and refuse new takes while its motion worker is still alive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePsProcessIdentity } from './studio-watchdog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close((e) => e ? reject(e) : resolve(port)); });
});
const identity = (pid) => parsePsProcessIdentity(execFileSync('ps', ['-o', 'pid=', '-o', 'pgid=', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }));
const groupAlive = (pgid) => execFileSync('ps', ['-axo', 'pid=', '-o', 'pgid=', '-o', 'stat='], { encoding: 'utf8' }).split(/\r?\n/).some((line) => {
  const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/);
  return m && Number(m[2]) === Number(pgid) && !m[3].startsWith('Z');
});

test('live take worker keeps its reservation and blocks new takes until it is verified dead', { timeout: 30_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('process-group signalling is POSIX-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-take-recovery-'));
  let server; let worker;
  try {
    for (const dir of ['scripts', 'storage/studio-sessions', 'studio/dist']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const file of fs.readdirSync(here).filter((n) => n.endsWith('.mjs') && !n.includes('.test.'))) {
      fs.copyFileSync(path.join(here, file), path.join(root, 'scripts', file));
    }
    fs.writeFileSync(path.join(root, 'scripts', 'make-local-video.sh'), "#!/usr/bin/env bash\ntrap '' TERM\nwhile :; do sleep 60 & wait $!; done\n");
    const scenario = 'drafts/generated/take-recovery.local-scenario.json';
    const takes = path.join(root, 'storage/any-local/take-recovery.local-scenario/motion/takes.json');
    fs.mkdirSync(path.dirname(takes), { recursive: true });
    fs.writeFileSync(takes, JSON.stringify({ 0: { current: 0, highest: 0, completed: {} } }));
    const takesBefore = fs.readFileSync(takes);

    worker = spawn('bash', ['scripts/make-local-video.sh', '--scenario', scenario], { cwd: root, detached: true, stdio: 'ignore' });
    await sleep(100);
    const live = identity(worker.pid);
    assert.ok(live, 'could not read the worker identity');
    const id = String(Date.now());
    const sessionFile = path.join(root, 'storage', 'studio-sessions', id + '.json');
    fs.writeFileSync(sessionFile, JSON.stringify({
      id, user: 'owner', name: 'take worker fixture', prompt: 'x', options: {}, createdAt: Date.now(), updatedAt: Date.now(),
      kind: 'sequence-motion', status: 'running', steps: [], lines: [], events: [], attempts: [], requestIds: [],
      scenario, sequence: { active: true, stage: 'motion', currentShot: 1 }, takeJob: { id: 'take-fixture', take: 1 },
      procInfo: { pid: worker.pid, pgid: worker.pid, command: live.command, scenario },
    }));

    const port = await freePort();
    server = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
      cwd: root, stdio: 'ignore', env: { ...process.env, STUDIO_PORT: String(port), STUDIO_ORPHAN_TERM_GRACE_MS: '3000' } });
    const url = (p) => `http://127.0.0.1:${port}${p}`;
    const retake = async () => {
      const response = await fetch(url('/api/render'), { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario, retakeMotion: 1 }) });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    let session;
    for (let i = 0; i < 80 && !session; i += 1) {
      try { const r = await fetch(url('/api/sessions/' + id)); if (r.status === 200) session = await r.json(); } catch { await sleep(100); }
    }
    assert.ok(session, 'Studio did not start');
    assert.equal(session.status, 'interrupted');

    // During the TERM grace period the worker ignores TERM and is still alive.
    await sleep(500);
    assert.equal(groupAlive(worker.pid), true, 'the TERM-ignoring worker should still be alive in the grace window');
    const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    assert.equal(saved.procInfo?.pid, worker.pid, 'the process record must be kept while the worker is alive');
    assert.ok(saved.takeJob, 'the take reservation must not be freed while the worker is alive');
    assert.deepEqual(fs.readFileSync(takes), takesBefore, 'recovery must not change committed takes');
    const blocked = await retake();
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.match(String(blocked.body.error), /previous motion worker still needs to be cleared/i);

    // After escalation the verified worker is gone and its record is released.
    const until = Date.now() + 8_000;
    while (Date.now() < until && JSON.parse(fs.readFileSync(sessionFile, 'utf8')).procInfo) await sleep(100);
    assert.equal(groupAlive(worker.pid), false, 'the worker must be stopped after escalation');
    assert.equal(JSON.parse(fs.readFileSync(sessionFile, 'utf8')).procInfo, null);
    assert.doesNotMatch(String((await retake()).body.error || ''), /previous motion worker still needs to be cleared/i);
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await sleep(300); if (server.exitCode === null) server.kill('SIGKILL'); }
    if (worker) { try { process.kill(-worker.pid, 'SIGKILL'); } catch { /* already gone */ } }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
