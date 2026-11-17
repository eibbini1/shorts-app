#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'creative-learning <ingest|revoke|analyze|approve|retrieve|plan|compare|record|preference> INPUT.json [--db PATH]';
const [command, input, option, databasePath, ...extra] = process.argv.slice(2);
const commands = ['ingest', 'revoke', 'analyze', 'approve', 'retrieve', 'plan', 'compare', 'record', 'preference'];
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const json = JSON.stringify;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
function requireFields(condition, message) {
  if (!condition) throw new Error(message);
}
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
function run(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, cwd: root });
}
function streamHash(video, selector) {
  return run('ffmpeg', ['-v', 'error', '-i', video, '-map', selector, '-c', 'copy', '-f', 'streamhash', '-']).trim();
}
function audioWindows(video, stream, duration) {
  if (!stream) return { status: 'missing', windows: [], transients: [] };
  const rate = 8000;
  const width = rate / 10;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vn', '-ac', '1',
    '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 32 * 1024 * 1024 });
  const windows = [];
  for (let start = 0; start < pcm.length / 4; start += width) {
    const count = Math.min(width, pcm.length / 4 - start);
    let sum = 0;
    for (let n = start; n < start + count; n++) sum += pcm.readFloatLE(n * 4) ** 2;
    const startMs = Math.round(start * 1000 / rate);
    if (startMs >= duration) break;
    windows.push({ startMs, endMs: Math.min(duration, Math.round((start + count) * 1000 / rate)),
      rmsDbfs: Math.round(100 * Math.max(-120, 10 * Math.log10(sum / count))) / 100 });
  }
  const transients = windows.filter((window, index) =>
    window.rmsDbfs >= -40 && window.rmsDbfs - (windows[index - 1]?.rmsDbfs ?? -120) >= 12
  ).map(({ startMs, endMs }) => ({ startMs, endMs, kind: 'energy-rise-candidate' }));
  return { status: 'measured', method: 'FFmpeg mono decode, 100ms RMS, 12dB rise at or above -40dBFS',
    windows, transients };
}
function setup(db) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS reference (
      id TEXT PRIMARY KEY, sha TEXT NOT NULL, manifest TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analysis (
      id INTEGER PRIMARY KEY, reference_id TEXT NOT NULL REFERENCES reference(id),
      version INTEGER NOT NULL, report TEXT NOT NULL, UNIQUE(reference_id, version)
    );
    CREATE TABLE IF NOT EXISTS technique (
      id TEXT NOT NULL, revision INTEGER NOT NULL, reference_id TEXT NOT NULL REFERENCES reference(id),
      entry TEXT NOT NULL, PRIMARY KEY(id, revision)
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY, entry TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preference (id TEXT PRIMARY KEY, entry TEXT NOT NULL);
    PRAGMA user_version=1;`);
}

async function analyze(db, request) {
  const row = db.prepare('SELECT * FROM reference WHERE id=?').get(request.id);
  requireFields(row, 'Unknown reference');
  const reference = readRow(row.manifest);
  requireFields(!reference.revokedAt, 'Reference authorization was withdrawn');
  requireFields(await hash(reference.file) === row.sha, 'Reference bytes changed; ingest under a new ID');
  const existing = db.prepare('SELECT report FROM analysis WHERE reference_id=? AND version=1').get(request.id);
  if (existing) return readRow(existing.report);
  const probe = readRow(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', reference.file]));
  const durationMs = Math.round(Number(probe.format.duration) * 1000);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  requireFields(video && durationMs > 0 && durationMs <= 300_000, 'Reference must be a local video up to five minutes');
  const cuts = readRow(run(resolve(root, 'storage/tools/scenedetect/.venv/bin/python'),
    [resolve(root, 'scripts/scene-cuts.py'), '--video', reference.file]));
  const boundaries = [0, ...cuts.cutSeconds.map((s) => Math.round(s * 1000))
    .filter((ms) => ms > 0 && ms < durationMs), durationMs];
  const audio = audioWindows(reference.file, probe.streams.some((s) => s.codec_type === 'audio'), durationMs);
  if (audio.status === 'measured') {
    // Call the same loudness and silence filters used by final-file QA.
    Object.assign(audio, readAudioQa(reference.file));
  }
  const report = { schemaVersion: 1, referenceId: request.id, sha256: row.sha,
    observations: { durationMs, width: video.width, height: video.height,
      cutDetector: cuts.tool, cutThreshold: cuts.threshold,
      shots: boundaries.slice(1).map((endMs, index) => ({ startMs: boundaries[index], endMs })),
      audio, captions: { status: 'unchecked', embeddedTracks: probe.streams.filter((s) => s.codec_type === 'subtitle').length },
      framingAndMotion: { status: 'requires-human-review' } },
    interpretations: [] };
  db.prepare('INSERT INTO analysis(reference_id,version,report) VALUES (?,1,?)').run(request.id, json(report));
  return report;
}

function readAudioQa(file) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af',
    'silencedetect=n=-45dB:d=1.0,loudnorm=print_format=json', '-f', 'null', '-'],
  { encoding: 'utf8' });
  requireFields(result.status === 0, result.error?.message ?? 'FFmpeg audio analysis failed');
  const block = result.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
  const stats = block ? readRow(block) : {};
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const events = Array.from(result.stderr.matchAll(/silence_(start|end): ([\d.]+)/g),
    ([, kind, seconds]) => ({ kind, atMs: Math.round(Number(seconds) * 1000) }));
  return { integratedLufs: finite(stats.input_i), truePeakDb: finite(stats.input_tp), silenceEvents: events };
}

const readRow = JSON.parse;
function retrieve(db, request) {
  const { genre, format, audioIntent, editor } = request;
  requireFields([genre, format, audioIntent, editor].every(text), 'Set genre, format, audioIntent and editor');
  const rows = db.prepare(`SELECT t.entry, r.manifest FROM technique t JOIN reference r ON r.id=t.reference_id WHERE t.revision=(
    SELECT MAX(i.revision) FROM technique i WHERE i.id=t.id)`).all();
  return rows.filter((row) => !readRow(row.manifest).revokedAt).map((row) => readRow(row.entry))
    .filter((item) => item.status === 'approved' && item.genres.includes(genre)
      && item.formats.includes(format) && item.audioIntents.includes(audioIntent) && item.editors.includes(editor))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)).slice(0, 3);
}

async function main(db, request) {
  switch (command) {
    case 'ingest': {
      requireFields([request.id, request.file, request.owner, request.source, request.rights?.evidence].every(text)
        && request.rights.analyze === true && typeof request.rights.reuse === 'boolean', 'Explicit analysis rights and provenance are required');
      const file = resolve(request.file);
      const sha256 = await hash(file);
      db.prepare('INSERT INTO reference VALUES (?,?,?)').run(request.id, sha256, json({ ...request, file }));
      return { id: request.id, sha256 };
    }
    case 'revoke': {
      const row = db.prepare('SELECT manifest FROM reference WHERE id=?').get(request.id);
      requireFields(row && text(request.reason), 'Revocation needs a reference and reason');
      const manifest = readRow(row.manifest);
      requireFields(!manifest.revokedAt, 'Reference already revoked');
      manifest.revokedAt = new Date().toISOString();
      manifest.revokedReason = request.reason;
      db.prepare('UPDATE reference SET manifest=? WHERE id=?').run(json(manifest), request.id);
      return { id: request.id, revokedAt: manifest.revokedAt };
    }
    case 'analyze': return analyze(db, request);
    case 'approve': {
      requireFields([request.id, request.referenceId, request.name, request.category, request.explanation,
        request.conditions, request.reviewer].every(text), 'Technique and reviewer fields are required');
      requireFields(['genres', 'formats', 'audioIntents', 'editors'].every((field) =>
        Array.isArray(request[field]) && request[field].length && request[field].every(text)), 'Technique needs applicability tags');
      requireFields(typeof request.confidence === 'number' && request.confidence >= 0 && request.confidence <= 1,
        'Confidence must be between 0 and 1');
      const { durationMs } = (await analyze(db, { id: request.referenceId })).observations;
      requireFields(Number.isInteger(request.startMs) && Number.isInteger(request.endMs)
        && request.startMs >= 0 && request.startMs < request.endMs && request.endMs <= durationMs,
      'Technique timestamp is outside the reference');
      const prior = db.prepare('SELECT MAX(revision) AS revision FROM technique WHERE id=?').get(request.id).revision;
      const entry = { ...request, revision: (prior ?? 0) + 1, previousRevision: prior,
        status: request.retired === true ? 'retired' : 'approved', approvedAt: new Date().toISOString() };
      db.prepare('INSERT INTO technique VALUES (?,?,?,?)').run(entry.id, entry.revision, entry.referenceId, json(entry));
      return entry;
    }
    case 'retrieve': return retrieve(db, request);
    case 'plan': {
      const technique = retrieve(db, request).find((item) => item.id === request.techniqueId);
      requireFields(technique && text(request.scenario) && text(request.rationale), 'Plan needs an applicable technique, scenario and rationale');
      const scenario = read(request.scenario);
      const shots = scenario.plan.shots;
      const seconds = scenario.settings.seconds;
      requireFields(request.editor === 'ffmpeg' && request.format === 'portrait' && scenario.settings.format === 'short'
        && request.audioIntent === 'asmr' && scenario.settings.presentationMode === 'asmr', 'Pilot supports portrait ASMR and FFmpeg finishing');
      requireFields(shots.every((s) => Number.isFinite(s.seconds) && s.seconds > 0)
        && shots.reduce((sum, s) => sum + s.seconds, 0) === seconds, 'Invalid storyboard timing');
      const shot = shots[request.shot - 1];
      const startMs = shots.slice(0, request.shot - 1).reduce((sum, s) => sum + s.seconds * 1000, 0);
      requireFields(shot && Number.isInteger(request.shot) && [request.actionMs, request.baselineCueMs].every((ms) =>
        Number.isInteger(ms) && ms >= startMs && ms < startMs + shot.seconds * 1000), 'Cue and action must fall inside the selected shot');
      return { schemaVersion: 1, scenarioSha256: await hash(request.scenario), technique: { id: technique.id, revision: technique.revision },
        editor: request.editor, shot: request.shot, windowMs: [startMs, startMs + shot.seconds * 1000],
        actionMs: request.actionMs, baselineCueMs: request.baselineCueMs, variantCueMs: request.actionMs,
        rationale: request.rationale, status: 'review-required' };
    }
    case 'compare': {
      requireFields([request.plan, request.scenario, request.video, request.cue, request.outputDir,
        request.experimentId, request.rightsEvidence].every(text), 'Comparison needs local media, plan, experiment ID and rights evidence');
      const plan = read(request.plan);
      requireFields(plan.schemaVersion === 1 && plan.editor === 'ffmpeg' && plan.status === 'review-required'
        && request.confirmPlan === true && plan.scenarioSha256 === await hash(request.scenario)
        && Array.isArray(plan.windowMs) && [plan.baselineCueMs, plan.variantCueMs, plan.actionMs].every((ms) =>
          Number.isInteger(ms) && ms >= plan.windowMs[0] && ms < plan.windowMs[1])
        && plan.variantCueMs === plan.actionMs && plan.baselineCueMs !== plan.variantCueMs,
      'Confirm a valid edit plan for this exact scenario');
      const row = db.prepare(`SELECT t.entry, r.manifest FROM technique t JOIN reference r ON r.id=t.reference_id
        WHERE t.id=? AND t.revision=(SELECT MAX(revision) FROM technique WHERE id=?)`)
        .get(plan.technique?.id, plan.technique?.id);
      requireFields(row && !readRow(row.manifest).revokedAt && readRow(row.entry).status === 'approved'
        && readRow(row.entry).revision === plan.technique.revision, 'Plan technique is no longer approved');
      requireFields(Number.isFinite(request.cueStartSeconds) && request.cueStartSeconds >= 0,
        'Specify an inspected source cue start in seconds');
      const output = resolve(request.outputDir);
      requireFields(!existsSync(output), 'Use a new output directory');
      mkdirSync(output, { recursive: true });
      const seconds = read(request.scenario).settings.seconds;
      const results = [];
      for (const [variant, cueMs] of [['baseline', plan.baselineCueMs], ['aligned', plan.variantCueMs]]) {
        const video = join(output, variant + '.mp4');
        const qa = join(output, variant + '.qa.json');
        const graph = `[1:a]atrim=start=${request.cueStartSeconds}:duration=0.4,asetpts=PTS-STARTPTS,volume=0.45,adelay=${cueMs}:all=1[cue];`
          + '[0:a][cue]amix=inputs=2:duration=first:normalize=0[a]';
        const started = performance.now();
        run('ffmpeg', ['-n', '-v', 'error', '-i', resolve(request.video), '-i', resolve(request.cue),
          '-filter_complex', graph, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', video]);
        const wallSeconds = Math.round((performance.now() - started)) / 1000;
        const qaRun = spawnSync('python3', ['scripts/qa-local-video.py', '--video', video,
          '--scenario', resolve(request.scenario), '--expected-seconds', String(seconds), '--report', qa],
        { cwd: root, encoding: 'utf8' });
        requireFields(existsSync(qa), qaRun.error?.message ?? qaRun.stderr ?? 'QA did not produce a report');
        const evidence = { id: request.experimentId + '-' + variant, video, qa, plan: resolve(request.plan),
          experimentId: request.experimentId, variant, wallSeconds, directCostUsd: 0 };
        writeFileSync(join(output, variant + '.record.json'), json(evidence, null, 2) + '\n', { flag: 'wx' });
        results.push({ ...evidence, cueMs, scheduledOffsetMs: cueMs - plan.actionMs, technicalPassed: read(qa).passed });
      }
      const streams = results.map(({ video }) => streamHash(video, '0:v:0'));
      const audioStreams = results.map(({ video }) => streamHash(video, '0:a:0'));
      const comparison = { experimentId: request.experimentId, identicalVideoStream: streams[0] === streams[1],
        differentAudioStreams: audioStreams[0] !== audioStreams[1], cueStartSeconds: request.cueStartSeconds,
        sourceVideoSha256: await hash(request.video), cueSha256: await hash(request.cue),
        rightsEvidence: request.rightsEvidence, results, humanPreference: 'pending' };
      writeFileSync(join(output, 'comparison.json'), json(comparison, null, 2) + '\n', { flag: 'wx' });
      if (!comparison.identicalVideoStream || !comparison.differentAudioStreams || results.some((item) => !item.technicalPassed)) process.exitCode = 1;
      return comparison;
    }
    case 'record': {
      requireFields([request.id, request.video, request.qa, request.experimentId, request.variant, request.plan].every(text),
        'Evidence needs an experiment, variant, video, edit plan and QA report');
      requireFields(Number.isFinite(request.wallSeconds) && request.wallSeconds >= 0
        && Number.isFinite(request.directCostUsd) && request.directCostUsd >= 0, 'Record runtime and direct cost');
      const sha256 = await hash(request.video);
      const qa = read(request.qa);
      requireFields(qa.videoSha256 === sha256 && typeof qa.passed === 'boolean', 'QA must match the exact rendered file');
      const entry = { ...request, videoSha256: sha256, qaSha256: await hash(request.qa),
        planSha256: await hash(request.plan), technicalPassed: qa.passed, editorialStatus: 'pending' };
      if (request.editorial) {
        const review = read(request.editorial);
        const verification = review.reviewEvidence ?? {};
        const facts = ['watchedFullVideo', 'listenedFullAudio', 'checkedOpeningHook', 'checkedFoodContinuity',
          'checkedShotTransitions', 'checkedSoundCueSync'];
        const categories = ['continuity', 'realism', 'story', 'audio', 'payoff'];
        requireFields(verification.videoSha256 === sha256 && text(verification.reviewer)
          && facts.every((key) => verification[key] === true)
          && categories.every((key) => Number.isFinite(review[key]) && review[key] >= 0 && review[key] <= 5),
        'Use a complete existing editorial review of the exact rendered file');
        entry.editorialStatus = 'recorded';
        entry.editorialReviewer = verification.reviewer;
        entry.editorialSha256 = await hash(request.editorial);
      }
      db.prepare('INSERT INTO evidence VALUES (?,?)').run(request.id, json(entry));
      return entry;
    }
    case 'preference': {
      requireFields([request.id, request.experimentId, request.baselineEvidenceId, request.alignedEvidenceId,
        request.reviewer, request.notes].every(text) && ['baseline', 'aligned', 'tie'].includes(request.choice),
      'Preference needs a reviewer, explanation and choice of baseline, aligned or tie');
      const entries = [request.baselineEvidenceId, request.alignedEvidenceId].map((id) =>
        db.prepare('SELECT entry FROM evidence WHERE id=?').get(id));
      requireFields(entries.every(Boolean), 'Both cuts need recorded editorial evidence');
      const [baseline, aligned] = entries.map((row) => readRow(row.entry));
      requireFields(baseline.variant === 'baseline' && aligned.variant === 'aligned'
        && baseline.planSha256 === aligned.planSha256 && baseline.videoSha256 !== aligned.videoSha256
        && [baseline, aligned].every((entry) => entry.experimentId === request.experimentId
          && entry.editorialStatus === 'recorded' && entry.editorialReviewer === request.reviewer),
      'Reviews must cover both cuts of the same experiment and name this reviewer');
      const entry = { ...request, recordedAt: new Date().toISOString() };
      db.prepare('INSERT INTO preference VALUES (?,?)').run(entry.id, json(entry));
      return entry;
    }
  }
}

try {
  requireFields(commands.includes(command) && input && !extra.length
    && ((!option && !databasePath) || (option === '--db' && databasePath)), usage);
  const file = resolve(databasePath ?? resolve(root, 'storage/learning/creative.sqlite'));
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    requireFields(version <= 1, 'Unsupported creative database version');
    setup(db);
    process.stdout.write(json(await main(db, read(input)), null, 2) + '\n');
  } finally {
    db.close();
  }
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
