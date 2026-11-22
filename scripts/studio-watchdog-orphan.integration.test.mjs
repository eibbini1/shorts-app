// Exercise restart recovery in a temporary Studio root with test-owned POSIX process groups only.
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
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
const processIdentity = (pid) => parsePsProcessIdentity(execFileSync(
  'ps', ['-o', 'pid=', '-o', 'pgid=', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' },
));
const groupAlive = (pgid) => {
  try { process.kill(-pgid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};
async function waitForGroupStopped(pgid, timeoutMs = 2_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!groupAlive(pgid)) return;
    await sleep(25);
  }
  assert.equal(groupAlive(pgid), false, `group ${pgid} should stop within ${timeoutMs} ms`);
}
function writeSession(root, id, procInfo) {
  fs.writeFileSync(path.join(root, 'storage', 'studio-sessions', id + '.json'), JSON.stringify({
    id, user: 'owner', name: 'orphan fixture', prompt: 'test-owned process group', options: {},
    createdAt: Date.now(), updatedAt: Date.now(), kind: 'render', status: 'running',
    steps: [], lines: [], events: [], attempts: [], requestIds: [], procInfo,
  }));
}

test('restart reaper stops only the matching job group and lets TERM finish', { timeout: 15_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('process-group signalling is POSIX-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-orphan-'));
  const groups = [];
  let server;
  let port;
  try {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'storage', 'studio-sessions'), { recursive: true });
    fs.mkdirSync(path.join(root, 'studio', 'dist'), { recursive: true });
    for (const file of fs.readdirSync(here).filter((name) => name.endsWith('.mjs') && !name.includes('.test.'))) {
      fs.copyFileSync(path.join(here, file), path.join(root, 'scripts', file));
    }

    // Match the actual Studio spawn shape: detached `bash scripts/make-local-video.sh ...`.
    fs.writeFileSync(path.join(root, 'scripts', 'make-local-video.sh'), [
      '#!/usr/bin/env bash',
      "trap 'sleep 0.35; exit 0' TERM",
      'while :; do sleep 60 & wait $!; done',
    ].join('\n') + '\n');
    const matching = spawn('bash', ['scripts/make-local-video.sh', '--scenario', 'fixture.json'], {
      cwd: root, detached: true, stdio: 'ignore',
    });
    groups.push(matching.pid);
    const matchingIdentity = processIdentity(matching.pid);
    assert.ok(matchingIdentity, 'could not read the matching Studio-style child');
    assert.equal(matchingIdentity.pid, matching.pid);
    assert.equal(matchingIdentity.pgid, matching.pid, 'detached child should lead its process group');

    // A process with an exactly matching command line must survive if it is not its group's leader.
    const nonLeader = spawn('bash', ['-c', 'sleep 60 & wait'], { detached: true, stdio: 'ignore' });
    groups.push(nonLeader.pid);
    let nonLeaderIdentity;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const childPid = Number(execFileSync('pgrep', ['-P', String(nonLeader.pid)], { encoding: 'utf8' }).trim().split('\n')[0]);
        nonLeaderIdentity = processIdentity(childPid);
        if (nonLeaderIdentity) break;
      } catch { /* child has not started yet */ }
      await sleep(20);
    }
    assert.ok(nonLeaderIdentity, 'could not read the non-leader process');
    assert.notEqual(nonLeaderIdentity.pid, nonLeaderIdentity.pgid);

    const bystander = spawn('bash', ['-c', 'sleep 60'], { detached: true, stdio: 'ignore' });
    groups.push(bystander.pid);
    const bystanderIdentity = processIdentity(bystander.pid);
    assert.ok(bystanderIdentity);
    assert.equal(bystanderIdentity.pgid, bystander.pid);

    const firstId = String(Date.now());
    const secondId = String(Date.now() + 1);
    writeSession(root, firstId, { pid: matching.pid, command: matchingIdentity.command });
    writeSession(root, secondId, { pid: nonLeaderIdentity.pid, command: nonLeaderIdentity.command });

    port = await freePort();
    server = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, STUDIO_PORT: String(port) },
    });
    let startup = '';
    server.stdout.on('data', (data) => { startup += data.toString(); });
    server.stderr.on('data', (data) => { startup += data.toString(); });

    async function getSession(id) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${id}`);
          assert.equal(response.status, 200);
          return await response.json();
        } catch (error) {
          const code = error.cause?.code || error.code;
          if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') throw error;
          await sleep(100);
        }
      }
      throw new Error('Studio did not start: ' + startup.slice(0, 500));
    }

    const recovered = await getSession(firstId);
    assert.equal(recovered.status, 'interrupted');
    assert.match(recovered.error, /studio was restarted/i);
    assert.equal(recovered.procInfo, undefined);
    await waitForGroupStopped(matching.pid); // SIGTERM is asynchronous; allow its trap to exit.

    const preserved = await getSession(secondId);
    assert.equal(preserved.status, 'interrupted');
    assert.equal(groupAlive(nonLeaderIdentity.pgid), true, 'non-leader process group must survive reaping');
    assert.equal(groupAlive(bystander.pid), true, 'unrelated bystander group must survive reaping');
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => server.once('exit', resolve)), sleep(1500)]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    for (const pgid of groups) {
      if (!pgid) continue;
      try { process.kill(-pgid, 'SIGKILL'); } catch { /* fixture group already exited */ }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
