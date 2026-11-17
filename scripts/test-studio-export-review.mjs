import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileHash, inspectExport } from './studio-export-review.mjs';

test('review follows the exact export and never borrows another take', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-review-'));
  const output = path.join(root, 'outputs');
  await fs.mkdir(output);
  const a = path.join(output, 'take-a.mp4');
  const b = path.join(output, 'take-b.mp4');
  await fs.writeFile(a, 'first take');
  await fs.writeFile(b, 'second take');
  const probe = async () => ({ width: 1080, height: 1920 });
  const inspect = (video, options = {}) => inspectExport(root, video, { probe, ...options });
  const write = (file, data) => fs.writeFile(file, JSON.stringify(data));
  await write(a.replace('.mp4', '.prereview.json'), {
    videoSha256: await fileHash(a), shotMotion: [1, 5], visionChecked: true,
    flags: { realism: ['shot 1 lacks movement'] },
  });
  assert.deepEqual((await inspect('outputs/take-a.mp4')).weak, [1]);
  assert.equal((await inspect('outputs/take-b.mp4')).status, 'unavailable');
  assert.equal((await inspect('outputs/take-b.mp4', { running: true })).status, 'pending');
  await write(b.replace('.mp4', '.prereview.json'), { videoSha256: await fileHash(a), shotMotion: [1] });
  const stale = await inspect('outputs/take-b.mp4');
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.weak, []);
  await write(b.replace('.mp4', '.prereview.json'), { videoSha256: await fileHash(b), shotMotion: [5] });
  const reviewed = await inspect('outputs/take-b.mp4');
  assert.equal(reviewed.status, 'complete');
  assert.equal(reviewed.visionChecked, false);
  assert.equal(reviewed.motionChecked, true);
  assert.equal(reviewed.resolution.status, 'unavailable');
  await write(b.replace('.mp4', '.provenance.json'), {
    outputSha256: await fileHash(b), nativeSources: [{ width: 384, height: 640 }, { width: 768, height: 1280 }],
  });
  const resolution = (await inspect('outputs/take-b.mp4')).resolution;
  assert.equal(resolution.status, 'verified');
  assert.equal(resolution.native.length, 2);
  assert.deepEqual(resolution.delivery, { width: 1080, height: 1920 });
  await fs.writeFile(b, 'edited take');
  const changed = await inspect('outputs/take-b.mp4');
  assert.equal(changed.status, 'stale');
  assert.equal(changed.resolution.status, 'unavailable');
  await assert.rejects(inspect('../outside.mp4'));
});

test('an unreadable report or unknown motion stays unverified', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-unchecked-'));
  await fs.mkdir(path.join(root, 'outputs'));
  const file = path.join(root, 'outputs/take.mp4');
  await fs.writeFile(file, 'take');
  await fs.writeFile(file.replace('.mp4', '.prereview.json'), '{broken');
  const options = { probe: async () => { throw new Error('probe unavailable'); } };
  assert.equal((await inspectExport(root, 'outputs/take.mp4', options)).status, 'unavailable');
  await fs.writeFile(file.replace('.mp4', '.prereview.json'), JSON.stringify({
    videoSha256: await fileHash(file), shotMotion: [null], unchecked: ['vision timeout'],
  }));
  const report = await inspectExport(root, 'outputs/take.mp4', options);
  assert.equal(report.motionChecked, false);
  assert.deepEqual(report.unchecked, ['vision timeout']);
});
