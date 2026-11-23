import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

describe('Studio hosted simulation HTTP entry point', () => {
  it.each([true, false])('enforces real owner authentication for simulation (token configured: %s)', async (useAuth) => {
    const fixture = mkdtempSync(path.join(tmpdir(), 'ishorts-hosted-http-'));
    const project = process.cwd();
    const dir = (name: string) => mkdirSync(path.join(fixture, name), { recursive: true });
    const sessionId = '1795300000000';
    const scenario = 'drafts/generated/simulation.json';
    const script = 'scripts/studio-server.mjs';
    const image = 'storage/any-local/simulation/opening.png';
    const data = JSON.stringify({ plan: { shots: [{ motionPrompt: 'A lamp brightens.' }] } });
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');
    const write = (name: string, value: string) => writeFileSync(path.join(fixture, name), value);
    try {
      for (const name of ['scripts', 'drafts/generated', 'storage/any-local/simulation', 'storage/studio-sessions', 'studio/dist']) dir(name);
      for (const name of ['node_modules', 'src']) symlinkSync(path.join(project, name), path.join(fixture, name));
      for (const name of readdirSync(path.join(project, 'scripts')).filter((s) => s.endsWith('.mjs') && !s.includes('.test.'))) {
        copyFileSync(path.join(project, 'scripts', name), path.join(fixture, 'scripts', name));
      }
      copyFileSync(path.join(project, 'package.json'), path.join(fixture, 'package.json'));
      write(scenario, data);
      write(image, 'approved test fixture bytes');
      if (useAuth) write('storage/studio-users.json', JSON.stringify({ users: [{ name: 'relative', token: 'fixture-relative' }] }));
      write('storage/studio-sessions/' + sessionId + '.json', JSON.stringify({ id: sessionId, user: 'owner', kind: 'stills',
        createdAt: Date.now(), status: 'done', lines: [], steps: [], options: {}, scenario, sequence: {
          approvedFrames: [{ shot: 1, file: 'opening.png', sha256: hash('approved test fixture bytes'), scenarioSha256: hash(data) }],
        } }));
      const socket = createServer();
      socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
      const address = socket.address();
      if (!address || typeof address === 'string') throw new Error('Could not acquire localhost port');
      const port = address.port;
      const closed = once(socket, 'close'); socket.close(); await closed;
      const server = spawn(process.execPath, [script], { cwd: fixture,
        env: { ...process.env, STUDIO_PORT: String(port), STUDIO_TOKEN: useAuth ? 'fixture-owner' : '', STUDIO_USERS_FILE: path.join(fixture, 'storage/studio-users.json') }, stdio: 'ignore' });
      const exited = once(server, 'exit');
      try {
        const url = 'http://127.0.0.1:' + port;
        let ready = false;
        for (let n = 0; n < 100 && server.exitCode === null; n++) {
          try { ready = (await fetch(url + '/api/me')).status === (useAuth ? 401 : 200); } catch { /* starting */ }
          if (ready) break;
          await delay(50);
        }
        expect(ready).toBe(true);
        const post = (token: string, extra: Record<string, unknown> = {}) =>
          fetch(url + '/api/hosted/dry-run', { method: 'POST', headers: { cookie: 'studio_token=' + token, 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, shot: 1, model: 'wan-2.2', capUsd: 1, action: 'quote', ...extra }) });
        if (!useAuth) {
          expect((await post('')).status).toBe(403);
          expect(await (await fetch(url + '/api/me')).json()).toMatchObject({ canSimulateHostedShot: false });
          return;
        }
        expect((await post('')).status).toBe(401);
        expect((await post('fixture-relative', { role: 'owner' })).status).toBe(403);
        expect((await post('fixture-owner', { provider: 'external' })).status).toBe(400);
        const quote = await post('fixture-owner');
        const body = await quote.json();
        expect(quote.status, JSON.stringify(body)).toBe(200);
        expect(body).toMatchObject({ provider: 'local-simulation', referenceSha256: hash('approved test fixture bytes'), estimateUsd: 0.25, capUsd: 1 });
        const confirm = { action: 'confirm', approval: body.approval };
        expect((await post('fixture-relative', confirm)).status).toBe(403);
        expect((await post('fixture-owner', { ...confirm, model: 'ltx-2.5' })).status).toBe(409);
        const receipt = await post('fixture-owner', confirm);
        expect(await receipt.json()).toMatchObject({ simulation: true, status: 'succeeded', actualUsd: 0 });
        expect((await post('fixture-owner', confirm)).status).toBe(409);
        write(image, 'changed image');
        expect((await post('fixture-owner')).status).toBe(409);
      } finally {
        if (server.exitCode === null) server.kill('SIGTERM');
        await exited;
      }
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  }, 15_000);
});
