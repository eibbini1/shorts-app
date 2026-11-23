import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commitTakes, motionState } from './studio-motion-state.mjs';

test('assembly keeps observations from parts it did not screen again', (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-motion-state-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const segments = [{ sha256: 'part-one' }, { sha256: 'part-two' }];
  const row = { shot: 1, take: 0, parts: 2, renderSettings: { quality: 'high' }, segments };
  const first = { part: 1, clipSha256: 'part-one', reason: null };
  const second = { part: 2, clipSha256: 'part-two', reason: 'motion froze' };
  commitTakes(work, [{ ...row, technicalScreen: [first, second] }]);
  const repeatedFirst = { ...first, reason: 'first frame too dark' };
  commitTakes(work, [{ ...row, technicalScreen: [repeatedFirst, { ...second, clipSha256: 'wrong' }] }]);
  const merged = motionState(work)[0].completed[0];
  assert.deepEqual(merged.technicalScreen, [repeatedFirst, second]);
  assert.deepEqual(merged.technicalFlags, [repeatedFirst.reason, second.reason]);
});
