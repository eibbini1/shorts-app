import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStillAdvice, stillAdviceFor } from './still-planner-advice.mjs';

test('historical advice changes only matching shot types and excludes raw ledger text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'still-advice-'));
  try {
    const shot = 'Overhead burger build';
    assert.deepEqual(stillAdviceFor(await readStillAdvice(dir), shot), []);
    await writeFile(join(dir, 'still-rejections.jsonl'),
      'broken row\n' + JSON.stringify({ shotType: 'overhead', reason: 'bare bun missing, private story text' }) + '\nnull\n');
    const rows = await readStillAdvice(dir);
    const advised = stillAdviceFor(rows, shot);
    assert.deepEqual(advised.map(({ id, shotType }) => [id, shotType]), [['premature-result', 'overhead']]);
    assert.doesNotMatch(JSON.stringify(advised), /private story text/);
    assert.deepEqual(stillAdviceFor(rows, 'Macro shot of the crust'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
