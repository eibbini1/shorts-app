import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commitTakes, motionState, summarizeTakeScreens } from './studio-motion-state.mjs';

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

test('a take with an unscreened segment cannot rank as a fully checked take', () => {
  const parts = 2;
  const segments = [{ sha256: 'part-one' }, { sha256: 'part-two' }];
  const first = { part: 1, clipSha256: 'part-one', reason: null };
  const second = { part: 2, clipSha256: 'part-two', reason: 'motion froze' };
  const rows = {
    0: { take: 0, parts, segments, technicalFlags: [],
      technicalScreen: [first, first, { ...second, clipSha256: 'wrong' }] },
    1: { take: 1, parts, segments, technicalScreen: [first, second] },
    2: { take: 2, parts, segments, technicalFlags: [] },
  };
  const results = summarizeTakeScreens(rows)
    .map(({ take, checkedParts, complete, flags }) => ({ take, checkedParts, complete, flags }));
  assert.deepEqual(results, [
    { take: 1, checkedParts: 2, complete: true, flags: ['motion froze'] },
    { take: 0, checkedParts: 1, complete: false, flags: [] },
    { take: 2, checkedParts: 0, complete: false, flags: [] },
  ]);
});
