import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadChannel, channelCatalog } from './channel-profile.mjs';
test('BB and WorklessAI profiles keep separate catalogs', async () => {
  const bb = await loadChannel('channels/bb.json');
  const work = await loadChannel('channels/worklessai.json');
  assert.notEqual(bb.catalogFile, work.catalogFile);
  assert.equal(work.brand, 'WorklessAI');
  assert.deepEqual(await channelCatalog({}), []);
});
test('catalog accepts both snapshot and plain titles and rejects malformed data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shorts-channel-'));
  const file = path.join(dir, 'catalog.json');
  try {
    await writeFile(file, JSON.stringify({ videos: [{ title: 'A' }, { snippet: { title: 'B' } }] }));
    assert.deepEqual(await channelCatalog({ catalogFile: file }), ['A', 'B']);
    await writeFile(file, '{}');
    await assert.rejects(channelCatalog({ catalogFile: file }), /videos array/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
