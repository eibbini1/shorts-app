// The relatives CLI must never leave the running Studio a half-written users file, or replace one it cannot read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'studio-users.mjs');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-users-'));
  const file = path.join(dir, 'nested', 'studio-users.json');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', env: { ...process.env, STUDIO_USERS_FILE: file, STUDIO_PUBLIC_URL: 'http://studio.test' } });
  return { dir, file, run };
}

test('add, list and remove keep a private, complete users file', () => {
  const { dir, file, run } = sandbox();
  try {
    const added = run('add', 'Mum', '5');
    assert.equal(added.status, 0, added.stderr);
    const token = /http:\/\/studio\.test\/\?token=(\S+)/.exec(added.stdout)[1];
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(saved.users.map((u) => [u.name, u.token, u.dailyRenders]), [['Mum', token, 5]]);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['studio-users.json'], 'no temporary file is left behind');
    assert.equal(run('add', 'mum').status, 1, 'the same name in another case is refused');
    assert.match(run('list').stdout, /Mum\s+5\/day/);
    assert.match(run('remove', 'Mum').stdout, /removed/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).users, []);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['studio-users.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a users file that cannot be read is reported, not replaced', () => {
  const { dir, file, run } = sandbox();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const damaged of ['{"users":[{"name":"Mum","tok', '{"users":"not a list"}', '']) {
      fs.writeFileSync(file, damaged);
      for (const args of [['add', 'Dad'], ['remove', 'Mum'], ['list']]) {
        const result = run(...args);
        assert.equal(result.status, 1, `${args.join(' ')} with ${JSON.stringify(damaged)}`);
        assert.match(result.stderr, /Cannot read/);
        assert.equal(fs.readFileSync(file, 'utf8'), damaged, 'the damaged file is left as it was');
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
