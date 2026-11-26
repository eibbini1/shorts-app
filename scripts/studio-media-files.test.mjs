import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { exportArtifacts, imageDimensions, serveFile, uploadedImage } from './studio-media-files.mjs';

function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('uploadedImage validates magic bytes and dimensions', () => {
  const valid = makePng(384, 640);
  assert.deepEqual(imageDimensions(valid, 'image/png'), { width: 384, height: 640 });
  const parsed = uploadedImage(`data:image/png;base64,${valid.toString('base64')}`);
  assert.equal(parsed.ext, 'png');
  assert.equal(parsed.mime, 'image/png');
  assert.equal(parsed.buffer.length, valid.length);

  const tiny = makePng(64, 64);
  assert.throws(() => uploadedImage(`data:image/png;base64,${tiny.toString('base64')}`), /256 px/);
  assert.throws(() => uploadedImage('data:text/html;base64,PGh0bWw+'), /PNG or JPEG/);
});

test('serveFile blocks symlink escapes and supports HTTP byte ranges', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-media-test-'));
  const allowed = path.join(dir, 'outputs');
  const outside = path.join(dir, 'secret.txt');
  fs.mkdirSync(allowed, { recursive: true });
  fs.writeFileSync(path.join(allowed, 'clip.mp4'), '0123456789abcdef');
  fs.writeFileSync(outside, 'top-secret');
  fs.symlinkSync(outside, path.join(allowed, 'escape.mp4'));

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    serveFile(req, res, path.join(dir, u.searchParams.get('p') || ''), [allowed]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const blocked = await fetch(`http://127.0.0.1:${port}/?p=outputs/escape.mp4`);
    assert.equal(blocked.status, 403);

    const traversal = await fetch(`http://127.0.0.1:${port}/?p=secret.txt`);
    assert.equal(traversal.status, 403);

    const partial = await fetch(`http://127.0.0.1:${port}/?p=outputs/clip.mp4`, {
      headers: { Range: 'bytes=2-5' },
    });
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), '2345');

    const badRange = await fetch(`http://127.0.0.1:${port}/?p=outputs/clip.mp4`, {
      headers: { Range: 'bytes=10-2' },
    });
    assert.equal(badRange.status, 416);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exportArtifacts discovers sidecar captions, pack, quality, and provenance files safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-artifacts-test-'));
  try {
    const outputs = path.join(dir, 'outputs');
    fs.mkdirSync(outputs, { recursive: true });
    fs.writeFileSync(path.join(outputs, 'demo.sfx.captioned.mp4'), 'mp4');
    fs.writeFileSync(path.join(outputs, 'demo.srt'), '1\n');
    fs.writeFileSync(path.join(outputs, 'demo.pack.json'), '{}');
    fs.writeFileSync(path.join(outputs, 'demo.pack.quality.json'), '{}');
    fs.writeFileSync(path.join(outputs, 'demo.sfx.captioned.provenance.json'), '{}');

    const found = exportArtifacts(dir, { video: 'outputs/demo.sfx.captioned.mp4' });
    assert.deepEqual(found.map((item) => item.kind), ['captions', 'publish-pack', 'quality-report', 'provenance']);
    assert.deepEqual(exportArtifacts(dir, { video: '../outside.mp4' }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
