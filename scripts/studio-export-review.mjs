import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function readJson(file) {
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

export async function inspectExport(root, video, { running = false, probe = probeVideo } = {}) {
  const outputRoot = path.resolve(root, 'outputs');
  const file = path.resolve(root, video);
  if (!file.startsWith(outputRoot + path.sep)) throw new Error('Export is outside outputs.');
  const before = await fs.promises.stat(file);
  const hash = await fileHash(file);
  let report;
  let status;
  try {
    report = await readJson(file.replace(/\.mp4$/, '.prereview.json'));
    status = report.videoSha256 === hash ? 'complete' : 'stale';
  } catch (error) {
    status = error.code === 'ENOENT' ? (running ? 'pending' : 'unavailable') : 'unavailable';
  }
  const resolution = { status: 'unavailable', native: [], delivery: null };
  try {
    resolution.delivery = await probe(file);
    const provenance = await readJson(file.replace(/\.mp4$/, '.provenance.json'));
    const valid = (item) => Number.isInteger(item.width) && item.width > 0
      && Number.isInteger(item.height) && item.height > 0;
    if (provenance.outputSha256 === hash && provenance.nativeSources?.length && provenance.nativeSources.every(valid)) {
      resolution.native = provenance.nativeSources.map(({ width, height }) => ({ width, height }));
      resolution.status = 'verified';
    }
  } catch { /* Old exports or unavailable probes leave source dimensions unknown. */ }
  const after = await fs.promises.stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
    return { video, status: 'stale', weak: [], resolution: { status: 'unavailable', native: [], delivery: null } };
  }
  if (status !== 'complete') return { video, videoSha256: hash, status, weak: [], resolution };
  const textList = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  const flags = Object.fromEntries(Object.entries(report.flags && typeof report.flags === 'object' ? report.flags : {})
    .map(([key, value]) => [key, textList(value)]));
  const motion = Array.isArray(report.shotMotion) ? report.shotMotion : [];
  return {
    video, videoSha256: hash, status, resolution,
    shotMotion: motion,
    weak: motion.flatMap((value, index) => typeof value === 'number' && value < 2 ? [index + 1] : []),
    flags,
    unchecked: textList(report.unchecked),
    notMachineChecked: textList(report.notMachineChecked),
    visionChecked: report.visionChecked === true,
    motionChecked: motion.length > 0 && motion.every((value) => typeof value === 'number' && Number.isFinite(value)),
  };
}

async function probeVideo(file) {
  const { stdout } = await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', file], { timeout: 10000 });
  const stream = JSON.parse(stdout).streams[0];
  if (!stream?.width || !stream?.height) throw new Error('No video dimensions.');
  return { width: stream.width, height: stream.height };
}
