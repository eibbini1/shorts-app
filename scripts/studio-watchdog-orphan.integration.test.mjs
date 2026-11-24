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
  // kill(0) may report EPERM for an already-exited orphan that remains as a zombie
  // under a different parent. Count only live processes in the group via ps.
  const output = execFileSync('ps', ['-axo', 'pid=', '-o', 'pgid=', '-o', 'stat='], { encoding: 'utf8' });
  return output.split(/\r?\n/).some((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/);
    return match && Number(match[2]) === Number(pgid) && !match[3].startsWith('Z');
  });
};
async function waitForGroupStopped(pgid, timeoutMs = 2_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!groupAlive(pgid)) return;
    await sleep(25);
  }
  assert.equal(groupAlive(pgid), false, `group ${pgid} should stop within ${timeoutMs} ms`);
}
async function waitForProcInfoCleared(root, id, timeoutMs = 2_000) {
  const file = path.join(root, 'storage', 'studio-sessions', id + '.json');
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (!JSON.parse(fs.readFileSync(file, 'utf8')).procInfo) return; } catch { /* retry while recovery writes */ }
    await sleep(25);
  }
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).procInfo, null, 'completed orphan cleanup should clear the persisted process record');
}
function writeSession(root, id, procInfo) {
  fs.writeFileSync(path.join(root, 'storage', 'studio-sessions', id + '.json'), JSON.stringify({
    id, user: 'owner', name: 'orphan fixture', prompt: 'test-owned process group', options: {},
    createdAt: Date.now(), updatedAt: Date.now(), kind: 'render', status: 'running',
    steps: [], lines: [], events: [], attempts: [], requestIds: [], procInfo, takeJob: { id: 'fixture-take' },
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
      env: { ...process.env, STUDIO_PORT: String(port), STUDIO_ORPHAN_TERM_GRACE_MS: '500' },
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
    await waitForProcInfoCleared(root, firstId);

    const preserved = await getSession(secondId);
    assert.equal(preserved.status, 'interrupted');
    const preservedOnDisk = JSON.parse(fs.readFileSync(path.join(root, 'storage', 'studio-sessions', secondId + '.json'), 'utf8'));
    assert.equal(preservedOnDisk.procInfo.pid, nonLeaderIdentity.pid, 'unverified records must remain available for a later safe retry');
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

test('restart reaper finds scenario-matched orphan workers and escalates when TERM is ignored', { timeout: 15_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('process-group signalling is POSIX-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-orphan-children-'));
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
    fs.writeFileSync(path.join(root, 'scripts', 'render-any-local.py'), 'import time\ntime.sleep(60)\n');
    fs.writeFileSync(path.join(root, 'scripts', 'make-local-video.sh'), [
      '#!/usr/bin/env bash',
      "trap '' TERM",
      'while :; do sleep 60 & wait $!; done',
    ].join('\n') + '\n');

    const orphanLeader = spawn('bash', ['-c', 'python3 scripts/render-any-local.py --scenario drafts/generated/orphan.local-scenario.json & wait'], {
      cwd: root, detached: true, stdio: 'ignore',
    });
    groups.push(orphanLeader.pid);
    let orphanWorker;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const childPid = Number(execFileSync('pgrep', ['-P', String(orphanLeader.pid)], { encoding: 'utf8' }).trim().split('\n')[0]);
        orphanWorker = processIdentity(childPid);
        if (orphanWorker) break;
      } catch { /* child has not started yet */ }
      await sleep(20);
    }
    assert.ok(orphanWorker, 'could not read the scenario worker');
    assert.notEqual(orphanWorker.pid, orphanWorker.pgid);
    assert.match(orphanWorker.command, /drafts\/generated\/orphan\.local-scenario\.json/);
    const orphanId = String(Date.now());
    writeSession(root, orphanId, {
      pid: orphanLeader.pid, pgid: orphanLeader.pid,
      command: 'bash scripts/make-local-video.sh --scenario drafts/generated/orphan.local-scenario.json',
      scenario: 'drafts/generated/orphan.local-scenario.json',
    });
    process.kill(orphanLeader.pid, 'SIGKILL'); // leave the scenario-matched worker alive in the detached group
    await sleep(80);
    assert.equal(groupAlive(orphanLeader.pid), true, 'the child should remain after its leader dies');

    const stubborn = spawn('bash', ['scripts/make-local-video.sh', '--scenario', 'drafts/generated/stubborn.local-scenario.json'], {
      cwd: root, detached: true, stdio: 'ignore',
    });
    groups.push(stubborn.pid);
    const stubbornIdentity = processIdentity(stubborn.pid);
    assert.ok(stubbornIdentity);
    const stubbornId = String(Date.now() + 1);
    writeSession(root, stubbornId, {
      pid: stubborn.pid, pgid: stubborn.pid,
      command: stubbornIdentity.command,
      scenario: 'drafts/generated/stubborn.local-scenario.json',
    });

    const bystander = spawn('bash', ['-c', 'sleep 60 & wait'], { detached: true, stdio: 'ignore' });
    groups.push(bystander.pid);

    port = await freePort();
    server = spawn(process.execPath, [path.join(root, 'scripts', 'studio-server.mjs')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, STUDIO_PORT: String(port), STUDIO_ORPHAN_TERM_GRACE_MS: '400' },
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

    assert.equal((await getSession(orphanId)).status, 'interrupted');
    assert.equal((await getSession(stubbornId)).status, 'interrupted');
    await waitForGroupStopped(orphanLeader.pid, 4_000);
    await waitForGroupStopped(stubborn.pid, 4_000);
    await waitForProcInfoCleared(root, orphanId, 4_000);
    await waitForProcInfoCleared(root, stubbornId, 4_000);
    assert.equal(groupAlive(bystander.pid), true, 'unrelated process groups must survive both cleanup paths');
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
