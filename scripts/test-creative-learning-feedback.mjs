import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, 'scripts/creative-learning.mjs');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' });
}

function callFeedback(directory, spec, dbName) {
  const input = join(directory, dbName + '.json');
  const database = join(directory, dbName + '.sqlite');
  writeFileSync(input, JSON.stringify(spec));
  const result = spawnSync(process.execPath, [cli, 'feedback', input, '--db', database], {
    cwd: root, encoding: 'utf8',
  });
  return { ...result, database };
}

test('records both-acceptable listening feedback only for identical pictures and changed audio', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ishorts-feedback-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const baseline = join(directory, 'baseline.mp4');
  const candidate = join(directory, 'candidate.mp4');
  const differentPicture = join(directory, 'different-picture.mp4');

  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=24:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', baseline]);
  ffmpeg(['-i', baseline, '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', candidate]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=24:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', differentPicture]);

  const spec = { id: 'fixture-review', experimentId: 'fixture-exp', outcome: 'both-acceptable-no-preference',
    baselineVideo: baseline, candidateVideo: candidate, reviewer: 'fixture owner', notes: 'Both sound good.' };
  const accepted = callFeedback(directory, spec, 'accepted');
  assert.equal(accepted.status, 0, accepted.stderr);
  const entry = JSON.parse(accepted.stdout);
  assert.equal(entry.outcome, 'both-acceptable-no-preference');
  assert.equal(entry.baseline.pictureStream, entry.candidate.pictureStream);
  assert.notEqual(entry.baseline.audioStream, entry.candidate.audioStream);
  assert.match(entry.baseline.videoSha256, /^[a-f0-9]{64}$/);
  assert.equal(entry.learningUse, 'human evidence only; no automatic preference or production-default update');

  const db = new DatabaseSync(accepted.database);
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 1);
  } finally {
    db.close();
  }

  const mismatched = callFeedback(directory, { ...spec, id: 'mismatch', candidateVideo: differentPicture }, 'mismatch');
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /identical decoded picture streams/);
  const sameAudio = callFeedback(directory, { ...spec, id: 'same-audio', candidateVideo: baseline }, 'same-audio');
  assert.notEqual(sameAudio.status, 0);
  assert.match(sameAudio.stderr, /different audio streams/);
});
