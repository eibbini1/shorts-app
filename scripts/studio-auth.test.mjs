import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canSee, createStudioAuth, keyOf, sameToken } from './studio-auth.mjs';

test('sameToken compares constant-time non-empty tokens only', () => {
  assert.equal(sameToken('alpha-secret', 'alpha-secret'), true);
  assert.equal(sameToken('alpha-secret', 'alpha-secrex'), false);
  assert.equal(sameToken('', ''), false);
  assert.equal(sameToken(null, undefined), false);
});

test('readUsers fails closed on corrupt or array JSON and unlocks only when ENOENT with no owner token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-auth-test-'));
  try {
    const usersFile = path.join(dir, 'studio-users.json');
    const sessions = new Map();
    const auth = createStudioAuth({ token: '', usersFile, sessions });
    assert.deepEqual(auth.readUsers(), []);
    assert.equal(auth.authOn(), false);

    fs.writeFileSync(usersFile, '{broken');
    assert.equal(auth.readUsers(), null);
    assert.equal(auth.authOn(), true);
    assert.equal(auth.userFor('anything'), null);

    fs.writeFileSync(usersFile, '[]');
    assert.equal(auth.readUsers(), null);
    assert.equal(auth.authOn(), true);

    fs.writeFileSync(usersFile, JSON.stringify({
      users: [
        { name: 'owner', token: 'impersonation-attempt' },
        { name: 'Alice', token: 'alice-secret', dailyRenders: 4 },
      ],
    }));
    assert.equal(auth.userFor('impersonation-attempt'), null);
    assert.deepEqual(auth.userFor('alice-secret'), { name: 'Alice', role: 'creator', dailyRenders: 4 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mayUse isolates creator drafts, .local-scenario work folders, and outputs while blocking traversal', () => {
  const sessions = new Map([
    ['1700000000001', { id: '1700000000001', user: 'Alice', scenario: 'drafts/generated/guided-alice.local-scenario.json' }],
    ['1700000000002', { id: '1700000000002', user: 'Bob', scenario: 'drafts/generated/guided-bob.local-scenario.json' }],
  ]);
  const auth = createStudioAuth({
    token: 'owner-secret',
    usersFile: path.join(os.tmpdir(), 'nonexistent-users-' + Date.now() + '.json'),
    extraOrigins: ['https://studio.tailnet.ts.net'],
    sessions,
  });
  const alice = { name: 'Alice', role: 'creator' };
  const owner = { name: 'owner', role: 'owner' };

  assert.equal(keyOf('drafts/generated/guided-alice.local-scenario.json'), 'guided-alice');
  assert.equal(canSee(alice, sessions.get('1700000000001')), true);
  assert.equal(canSee(alice, sessions.get('1700000000002')), false);
  assert.equal(canSee(owner, sessions.get('1700000000002')), true);

  assert.equal(auth.mayUse(alice, 'drafts/generated/guided-alice.local-scenario.json'), true);
  assert.equal(auth.mayUse(alice, 'drafts/generated/guided-bob.local-scenario.json'), false);
  assert.equal(auth.mayUse(alice, 'storage/any-local/guided-alice.local-scenario/refs/shot-00-abc.png'), true);
  assert.equal(auth.mayUse(alice, 'storage/any-local/guided-bob.local-scenario/refs/shot-00-abc.png'), false);
  assert.equal(auth.mayUse(alice, 'outputs/guided-alice-20261125.mp4'), true);
  assert.equal(auth.mayUse(alice, 'outputs/guided-bob-20261125.mp4'), false);
  assert.equal(auth.mayUse(alice, 'outputs/../storage/studio-users.json'), false);
  assert.equal(auth.mayUse(alice, '/etc/passwd'), false);

  assert.equal(auth.isAllowedOrigin('http://127.0.0.1:8787'), true);
  assert.equal(auth.isAllowedOrigin('https://studio.tailnet.ts.net'), true);
  assert.equal(auth.isAllowedOrigin('https://evil.example.com'), false);
});
