// HTTP JSON helpers, symlink-confined static/Range media serving, PNG/JPEG upload validation, and readiness checks.
// TODO(security): Local studio accepts bounded PNG/JPEG reference images validated via magic bytes and dimensions without external antivirus/CDR APIs.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.srt': 'text/plain; charset=utf-8',
};

const DEFAULT_BODY_LIMIT = 2 * 1024 * 1024;

export const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
};

export const body = (req, limit = DEFAULT_BODY_LIMIT) => new Promise((ok) => {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { tooLarge = true; chunks.length = 0; }
    else if (!tooLarge) chunks.push(c);
  });
  req.on('end', () => {
    if (tooLarge) return ok({});
    try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch { ok({}); }
  });
  req.on('error', () => ok({}));
});

export function boundedJsonBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { tooLarge = true; chunks.length = 0; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return resolve({ error: 'The image upload is too large.', status: 413 });
      try { return resolve({ value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }); }
      catch { return resolve({ error: 'The image upload request is invalid.', status: 400 }); }
    });
    req.on('error', () => resolve({ error: 'Unable to read the image upload.', status: 400 }));
  });
}

export function imageDimensions(buffer, mime) {
  if (mime === 'image/png' && buffer.length >= 24 &&
      buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mime !== 'image/jpeg' || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (frameMarkers.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

export function uploadedImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!match || match[2].length > 11_185_000) throw new Error('Choose a PNG or JPEG image up to 8 MB.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024 || buffer.toString('base64') !== match[2]) {
    throw new Error('Choose a PNG or JPEG image up to 8 MB.');
  }
  const dimensions = imageDimensions(buffer, match[1]);
  if (!dimensions || dimensions.width < 256 || dimensions.height < 256 ||
      dimensions.width > 8192 || dimensions.height > 8192 || dimensions.width * dimensions.height > 40_000_000) {
    throw new Error('The image must be a valid PNG or JPEG between 256 px and 8192 px per side.');
  }
  return { buffer, mime: match[1], ext: match[1] === 'image/png' ? 'png' : 'jpg' };
}

export function serveFile(req, res, file, roots) {
  const real = path.resolve(file);
  if (roots && !roots.some((r) => real.startsWith(r + path.sep))) return json(res, 403, { error: 'Not allowed' });
  if (!fs.existsSync(real) || !fs.statSync(real).isFile()) return json(res, 404, { error: 'Not found' });
  // Follow symlinks before serving: a link inside an allowed folder must not lead to a file outside it.
  // Allowed roots are resolved as well, so a storage folder symlinked to another disk keeps working.
  let streamPath = real;
  if (roots) {
    const target = fs.realpathSync(real);
    const holds = (r) => { try { return target.startsWith(fs.realpathSync(r) + path.sep); } catch { return false; } };
    if (!roots.some(holds)) return json(res, 403, { error: 'Not allowed' });
    streamPath = target;
  }
  const size = fs.statSync(streamPath).size;
  const type = MIME[path.extname(streamPath)] || 'application/octet-stream';
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    const start = range?.[1] ? Number(range[1]) : Math.max(0, size - Number(range?.[2]));
    const end = range?.[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'X-Content-Type-Options': 'nosniff' });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = fs.createReadStream(streamPath, { start, end });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(streamPath).pipe(res);
}

export function exportArtifacts(root, session) {
  if (!session?.video || !/^outputs\/[\w.-]+\.mp4$/i.test(session.video)) return [];
  const outputRoot = path.resolve(root, 'outputs') + path.sep;
  const videoFile = path.resolve(root, session.video);
  if (!videoFile.startsWith(outputRoot)) return [];
  const videoStem = path.basename(session.video).replace(/\.mp4$/i, '').replace(/\.(?:captioned|artcraft|filmcraft)$/i, '');
  const stems = [...new Set([videoStem, videoStem.replace(/\.sfx$/i, '')])];
  const candidates = [
    { kind: 'captions', label: 'Captions (.srt)', files: stems.map((stem) => `${stem}.srt`) },
    { kind: 'publish-pack', label: 'Publish pack (.json)', files: [...stems.map((stem) => `${stem}.pack.json`), `${stems.at(-1)}.sfx.pack.json`] },
    { kind: 'quality-report', label: 'Release quality report (.json)', files: stems.flatMap((stem) => [`${stem}.pack.quality.json`, `${stem}.quality.json`]) },
    {
      kind: 'provenance',
      label: 'Provenance (.json)',
      files: [
        path.basename(session.video).replace(/\.mp4$/i, '.provenance.json'),
        ...stems.map((stem) => `${stem}.provenance.json`),
      ],
    },
  ];
  return candidates.flatMap(({ kind, label, files }) => {
    const file = files.map((name) => path.join(root, 'outputs', name))
      .find((candidate) => {
        const resolved = path.resolve(candidate);
        return resolved.startsWith(outputRoot) && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
      });
    return file ? [{ kind, label, path: path.relative(root, file) }] : [];
  });
}

export function runReadinessCheck(root) {
  return new Promise((resolve, reject) => {
    execFile('python3', ['scripts/check-env.py'], { cwd: root, timeout: 30000, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') return reject(error);
      const checks = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const match = /^(OK|FAIL|SKIP)\s+(.+?)(?:\s+->\s+(.+))?$/.exec(line);
        return match
          ? { status: match[1].toLowerCase(), name: match[2], fix: match[3] || '' }
          : { status: 'info', name: line, fix: '' };
      });
      resolve({ ready: !error, checks, error: stderr.trim() || null });
    });
  });
}
