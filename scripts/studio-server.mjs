#!/usr/bin/env node
// Local web studio backend. Dependency-free. Binds 127.0.0.1 only.
// POST /api/draft  {prompt, seconds, orientation, audio}  -> story plan (no media generated)
// POST /api/render {scenario}                              -> full local render
// GET  /api/events (SSE) | /api/state | POST /api/cancel | GET /media?p=outputs/x.mp4
import http from 'node:http';
import { createIdeaService } from './studio-ideas.mjs';
import { createIdeaRefiner } from './studio-refine-idea.mjs';
import { inspectExport, fileHash } from './studio-export-review.mjs';
import { blockerReasons, classifyGateLine, gateEventKey } from './studio-learning-signals.mjs';
import { EVENT_PREFIX, parseEventLine as parseEvent } from './pipeline-events.mjs';
import { buildLearningContext } from './studio-learning-memory.mjs';
import { createSessionId, draftIdleTimeoutMs, draftTimeoutMs, normalizeSessionPrompt, sessionTitle } from './studio-session-utils.mjs';
import { MAX_AUTO_RETRIES, WATCHED_KINDS, checkStall, classifyExit, isLocalCommand, isOrphanScenarioMember, keepAwakeCommand, mayReapOrphan, parsePsProcessIdentities, parsePsProcessIdentity, retryDecision, stallMessage, watchdogLimits } from './studio-watchdog.mjs';
import { availableTakes, commitTakes, motionState, reserveTake, sha256, summarizeTakeScreens, technicalObservations, verifiedTake } from './studio-motion-state.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ideaService = createIdeaService({ root: ROOT });
const ideaRefiner = createIdeaRefiner();
let localIdeaBusy = false;
const PORT = Number(process.env.STUDIO_PORT || 8787);
const DIST = path.join(ROOT, 'studio', 'dist');
const MEDIA_ROOTS = ['outputs', 'storage/any-local', 'storage/benchmarks', 'drafts/generated'].map((d) => path.join(ROOT, d));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.srt': 'text/plain; charset=utf-8' };

const SESS_DIR = path.join(ROOT, 'storage', 'studio-sessions');
fs.mkdirSync(SESS_DIR, { recursive: true });
const ID_RE = /^\d{10,16}$/;
const sessions = new Map(); // id -> session (see snap())
const pendingOrphanRecovery = [];
for (const f of fs.readdirSync(SESS_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const x = JSON.parse(fs.readFileSync(path.join(SESS_DIR, f), 'utf8'));
    if (!ID_RE.test(String(x.id))) continue;
    if (!Array.isArray(x.attempts)) x.attempts = [];
    if (!Array.isArray(x.requestIds)) x.requestIds = [];
    if (['running', 'stopping'].includes(x.status)) {
      x.status = 'interrupted'; x.error = 'The studio was restarted while this was running. Check the log, then run it again.';
      pendingOrphanRecovery.push(x);
    } else if (x.status === 'interrupted' && x.takeJob && x.procInfo) {
      pendingOrphanRecovery.push(x);
    }
    sessions.set(x.id, x);
  } catch { /* skip unreadable file */ }
}
let job = null; // the session that is running, or ran most recently in this server process
const clients = new Set();

const STEP_RULES = [
  [/^Fixing|^Fixed automatically/i, 'Fixing the story automatically'],
  [/Story gate:|Potential new motion time|Story passed|Plan ready/i, 'Checking the plan'],
  [/Saved director brief|Story spine|Locked the story/i, 'Reading your idea'],
  [/Drafted story beat|Rewriting beat|Repairing/i, 'Drafting the story beats'],
  [/preflight|strict|pacing|hook check/i, 'Checking the plan'],
  [/kokoro|voice track|narration audio|synthes/i, 'Recording narration'],
  [/\bflux\b|still\b.*(generat|saved|ok)|best-of/i, 'Generating stills'],
  [/\bltx\b|motion clip|clip \d+\/\d+/i, 'Generating motion clips'],
  [/music|loudness|mix\b|ducking/i, 'Mixing sound'],
  [/artcraft|filmcraft|ffmpeg|encod|export/i, 'Finishing and exporting'],
  [/final-file|qa\b|verified|contact sheet/i, 'Quality checks'],
];

const snap = (x = job) => x && { id: x.id, user: x.user, name: x.name, prompt: x.prompt, options: x.options, createdAt: x.createdAt, updatedAt: x.updatedAt, kind: x.kind, status: x.status, startedAt: x.startedAt, unattendedRun: x.unattendedRun, steps: x.steps, lines: x.lines.slice(-200), events: (x.events || []).slice(-100), scenario: x.scenario, plan: x.plan, sequence: x.sequence || null, referenceFrames: x.referenceFrames || [], video: x.video, previousVideo: x.previousVideo, technicalQa: x.technicalQa, error: x.error, attempts: x.attempts || [], watchdog: x.watchdog || null };
const persist = (x, touch = true) => {
  if (touch) x.updatedAt = Date.now();
  x.lastSave = Date.now();
  const target = path.join(SESS_DIR, x.id + '.json');
  const temporary = target + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...snap(x), requestIds: x.requestIds || [],
      procInfo: x.procInfo || null, takeJob: x.takeJob || null }));
    fs.renameSync(temporary, target);
  } catch { /* disk issue: keep running */ }
};
const ORPHAN_TERM_GRACE_MS = Math.max(100, Math.min(10_000, Number(process.env.STUDIO_ORPHAN_TERM_GRACE_MS) || 2_500));
function processGroupMembers(pgid) {
  try {
    const output = execFileSync('ps', ['-axo', 'pid=', '-o', 'pgid=', '-o', 'command='], { encoding: 'utf8' });
    return parsePsProcessIdentities(output).filter((item) => item.pgid === Number(pgid));
  } catch { return []; }
}
function liveProcessIdentity(pid) {
  try { return parsePsProcessIdentity(execFileSync('ps', ['-o', 'pid=', '-o', 'pgid=', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })); }
  catch { return null; }
}
function inspectOrphanGroup(recorded) {
  const pgid = Number(recorded?.pid);
  if (!Number.isSafeInteger(pgid) || pgid <= 1) return { state: 'unverified', members: [] };
  const recordedPid = liveProcessIdentity(pgid);
  if (recordedPid && !mayReapOrphan({ recorded, live: recordedPid })) {
    // A recorded PID that is still alive but is not the exact detached group leader
    // is not evidence that the intended group is gone; retain it without signaling.
    return { state: 'unverified', members: [] };
  }
  const members = processGroupMembers(pgid);
  if (!members.length) return { state: 'gone', members };
  const leader = members.find((item) => item.pid === pgid);
  if (leader) {
    return mayReapOrphan({ recorded, live: leader })
      ? { state: 'verified-leader', members }
      : { state: 'unverified', members };
  }
  const targets = members.filter((item) => isOrphanScenarioMember({ recorded, live: item }));
  return targets.length ? { state: 'verified-members', members: targets } : { state: 'unverified', members };
}
function signalOrphanGroup(recorded, signal) {
  const inspection = inspectOrphanGroup(recorded);
  if (inspection.state === 'gone' || inspection.state === 'unverified') return inspection;
  if (inspection.state === 'verified-leader') {
    try { process.kill(-Number(recorded.pid), signal); }
    catch (error) { if (error.code !== 'ESRCH') return { ...inspection, state: 'signal-error' }; }
    return inspection;
  }
  for (const target of inspection.members) {
    const fresh = liveProcessIdentity(target.pid);
    if (!fresh || fresh.pgid !== Number(recorded.pid) || fresh.command !== target.command || !isOrphanScenarioMember({ recorded, live: fresh })) continue;
    try { process.kill(fresh.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') return { ...inspection, state: 'signal-error' }; }
  }
  return inspection;
}
function clearRecoveredProcess(x) {
  if (x.takeJob && x.procInfo?.pid) {
    const recorded = x.procInfo;
    const inspection = inspectOrphanGroup(recorded);
    const current = liveProcessIdentity(recorded.pid);
    const unrelatedOccupant = current && current.command !== recorded.command &&
      !processGroupMembers(recorded.pid).some((member) => isOrphanScenarioMember({ recorded, live: member }));
    if (!unrelatedOccupant) {
      if (inspection.state !== 'gone') return;
      try { process.kill(-recorded.pid, 0); return; }
      catch (error) { if (error.code !== 'ESRCH') return; }
    }
  }
  if (x.takeJob && x.kind === 'render' && x.scenario) {
    try {
      const output = motionState(takeWork(x.scenario)).verifiedExport;
      if (output?.jobId === x.takeJob.id && output.session === x.id && /^outputs\/[^/\\]+\.mp4$/.test(output.path) &&
          sha256(path.join(ROOT, output.path)) === output.sha256) {
        x.video = output.path;
        x.technicalQa = { status: 'passed' };
        x.status = 'done';
        x.error = null;
        if (x.sequence?.stage === 'ready') {
          const state = motionState(takeWork(x.scenario));
          x.sequence.endFrames = x.sequence.endFrames.map((old) => {
            const entry = state[old.shot - 1];
            const row = entry?.completed?.[entry.current];
            return row?.completedJobId === x.takeJob.id && row.endFrame ? row : old;
          });
        }
      } else if (x.previousVideo) {
        x.video = x.previousVideo;
        x.technicalQa = { status: 'passed' };
      }
    } catch { /* preserve interrupted status if the export cannot be verified */ }
  }
  if (x.takeJob && x.kind === 'sequence-motion' && x.sequence?.currentShot) {
    try {
      const shot = x.sequence.currentShot;
      const context = takeContext(x, shot);
      const state = availableTakes(context.work, shot, context.expected);
      if (Object.values(state.completed).some((row) => row.completedJobId === x.takeJob.id)) {
        x.status = 'done';
        x.error = null;
      }
    } catch { /* a report without verified artifacts cannot restore a job */ }
  }
  restoreSequenceTake(x, x.takeJob?.optional, 'The optional take was interrupted.');
  if (/^take-[0-9a-f-]{36}\.report$/.test(x.takeJob?.id || '')) {
    try { fs.unlinkSync(path.join(SESS_DIR, x.takeJob.id)); } catch { /* no completed report */ }
  }
  x.takeJob = null;
  x.procInfo = null;
  persist(x, false);
}
function recoverOrphan(x) {
  const recorded = x.procInfo;
  if (!recorded?.pid) { clearRecoveredProcess(x); return; }
  const term = signalOrphanGroup(recorded, 'SIGTERM');
  if (term.state === 'gone') { clearRecoveredProcess(x); return; }
  x.lines ||= [];
  if (term.state === 'unverified' || term.state === 'signal-error') {
    clearRecoveredProcess(x);
    if (!x.procInfo) return;
    x.lines.push('Watchdog: a leftover process could not be safely identified; its process record is retained for another recovery check.');
    persist(x, false);
    return;
  }
  x.lines.push('Watchdog: sent SIGTERM to the verified job process; checking whether every worker exits.');
  persist(x, false);
  setTimeout(() => {
    const forced = signalOrphanGroup(recorded, 'SIGKILL');
    if (forced.state === 'gone') { clearRecoveredProcess(x); return; }
    if (forced.state === 'unverified' || forced.state === 'signal-error') {
      x.lines.push('Watchdog: process identity changed during recovery; retained its record and did not signal unverified processes.');
      persist(x, false);
      return;
    }
    x.lines.push('Watchdog: a verified worker did not exit after SIGTERM; sent SIGKILL and will verify cleanup.');
    persist(x, false);
    setTimeout(() => {
      const remaining = inspectOrphanGroup(recorded);
      if (remaining.state === 'gone') clearRecoveredProcess(x);
      else {
        x.lines.push(remaining.state === 'verified-leader' || remaining.state === 'verified-members'
          ? 'Watchdog: a verified worker is still present; retained its process record so a later restart can retry.'
          : 'Watchdog: the old group could not be conclusively cleared; retained its record without signaling unverified processes.');
        persist(x, false);
      }
    }, 750).unref();
  }, ORPHAN_TERM_GRACE_MS).unref();
}
for (const recovered of pendingOrphanRecovery) recoverOrphan(recovered);
const summary = (x) => ({ id: x.id, name: x.name, prompt: x.prompt, storyPrompt: x.options?.storyPrompt || '', createdAt: x.createdAt, updatedAt: x.updatedAt, status: x.status, kind: x.kind, hasVideo: Boolean(x.video || x.previousVideo), attemptCount: (x.attempts || []).length });
const canSee = (user, x) => !x || !user || user.role === 'owner' || x.user === user.name;
function legacyBrief(session) {
  const expected = normalizeSessionPrompt(session.options?.originalPrompt || session.prompt);
  const createdAt = Number(session.createdAt || session.id);
  const candidates = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'storage'))) {
    const match = /^studio-answers-(\d+)\.json$/.exec(file);
    if (!match || Math.abs(Number(match[1]) - createdAt) > 5 * 60 * 1000) continue;
    try {
      const answers = JSON.parse(fs.readFileSync(path.join(ROOT, 'storage', file), 'utf8'));
      if (normalizeSessionPrompt(answers.topic) === expected) candidates.push({ distance: Math.abs(Number(match[1]) - createdAt), answers });
    } catch { /* ignore unrelated or unreadable legacy answer files */ }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.answers || null;
}
const view = (user, x = job) => !x ? { status: 'idle' } : canSee(user, x) ? snap(x)
  : { id: 'other', name: 'Another video', prompt: '', options: {}, status: x.status, kind: x.kind, startedAt: x.startedAt, steps: [], lines: [], events: [], busyElsewhere: true };
const emit = () => { for (const c of clients) c.write(`data: ${JSON.stringify(view(c.user))}\n\n`); };

function busyReason() {
  for (const item of pendingOrphanRecovery) {
    if (!item.takeJob || !item.procInfo) continue;
    clearRecoveredProcess(item);
    if (item.procInfo) return 'A previous motion worker still needs to be cleared before the next job.';
  }
  if (localIdeaBusy || ideaRefiner.active) return 'The local idea model is still working. Wait for it to finish.';
  if (job && ['running', 'stopping'].includes(job.status)) return 'A studio job is already running.';
  try {
    const out = execFileSync('pgrep', ['-fl', 'run-food-motion-baseline|bench-nonfood-planning|bench-topic-packs|ltx-2-mlx|create-flux-image|make-local-video'], { encoding: 'utf8' });
    if (out.trim()) return 'Another local render is using the GPU (for example the food benchmark). Wait for it to finish.';
  } catch { /* pgrep exits 1 when nothing matches */ }
  return null;
}

function newest(dir, ext, since) {
  try {
    const found = [];
    const walk = (d, depth) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory() && depth < 2) walk(p, depth + 1);
        else if (e.name.endsWith(ext)) { const m = fs.statSync(p).mtimeMs; if (m >= since) found.push([m, p]); }
      }
    };
    walk(path.join(ROOT, dir), 0);
    found.sort((a, b) => b[0] - a[0]);
    return found[0] && path.relative(ROOT, found[0][1]);
  } catch { return null; }
}


function readReferenceManifest(scenario) {
  const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
  const workRoot = path.resolve(ROOT, work);
  const manifest = path.join(workRoot, 'references.json');
  if (!fs.existsSync(manifest)) return { rows: [], references: [], sha256: null };
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const story = path.join(ROOT, scenario);
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) || !Array.isArray(data.references)) {
    throw new Error('The reference images belong to an older version of this story. Upload them again.');
  }
  const shotCount = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
  const seen = new Set();
  const references = data.references.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('The reference-image manifest is invalid.');
    const fileName = String(row.file || '');
    const match = /^references\/shot-(\d+)-[0-9a-f]{16}\.(png|jpg)$/i.exec(fileName);
    if (!match || Number(match[1]) !== row.shot || !Number.isInteger(row.shot) ||
        row.shot < 1 || row.shot > shotCount || seen.has(row.shot)) {
      throw new Error('The reference-image manifest is invalid.');
    }
    seen.add(row.shot);
    const file = path.resolve(workRoot, fileName);
    const real = fs.realpathSync(file);
    if (!real.startsWith(workRoot + path.sep) || hash(real) !== row.sha256) {
      throw new Error(`The reference image for shot ${row.shot} changed. Upload it again.`);
    }
    return { shot: row.shot, p: path.relative(ROOT, real), t: fs.statSync(real).mtimeMs, sha256: row.sha256 };
  }).sort((a, b) => a.shot - b.shot);
  return { rows: data.references, references, sha256: hash(manifest) };
}

function referenceIdentity(scenario) {
  const rows = readReferenceManifest(scenario).rows
    .map((row) => ({ shot: row.shot, file: row.file, sha256: row.sha256 }))
    .sort((a, b) => a.shot - b.shot);
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function frameManifest(scenario) {
  const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, work, 'first-frames.json'), 'utf8'));
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const referenceHash = readReferenceManifest(scenario).sha256;
  const story = path.join(ROOT, scenario);
  const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
  if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) ||
      (data.referenceManifestSha256 ?? null) !== referenceHash || data.frames?.length !== count) {
    throw new Error('Review fresh first frames for this story and its reference images.');
  }
  const stills = data.frames.map((frame, index) => {
    const workRoot = path.resolve(ROOT, work);
    const file = path.resolve(workRoot, frame.file);
    const real = fs.realpathSync(file);
    if (frame.shot !== index + 1 || !real.startsWith(workRoot + path.sep) || hash(real) !== frame.sha256) throw new Error('A first frame changed. Make first frames again.');
    return { shot: frame.shot, p: path.relative(ROOT, real), t: fs.statSync(real).mtimeMs, n: path.basename(real), verified: true };
  });
  return { stills };
}

function pendingFrameManifest(scenario) {
  const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
  const workRoot = path.resolve(ROOT, work);
  const story = path.join(ROOT, scenario);
  const data = JSON.parse(fs.readFileSync(path.join(workRoot, 'pending-first-frames.json'), 'utf8'));
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const referenceHash = readReferenceManifest(scenario).sha256;
  const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
  if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) ||
      (data.referenceManifestSha256 ?? null) !== referenceHash || !Array.isArray(data.frames)) {
    throw new Error('The pending frame review is stale. Generate first frames again.');
  }
  const seen = new Set();
  for (const frame of data.frames) {
    if (!Number.isInteger(frame.shot) || frame.shot < 1 || frame.shot > count || seen.has(frame.shot) ||
        !Array.isArray(frame.candidates) || frame.candidates.length === 0) {
      throw new Error('The pending frame review is incomplete or invalid.');
    }
    seen.add(frame.shot);
    const candidateIds = new Set();
    for (const candidate of frame.candidates) {
      const file = path.resolve(workRoot, candidate.file || '');
      if (!file.startsWith(workRoot + path.sep) || !fs.existsSync(file)) {
        throw new Error('A pending frame changed. Generate first frames again.');
      }
      const real = fs.realpathSync(file);
      const relative = path.relative(workRoot, real);
      const match = /^refs\/shot-(\d+)-[0-9a-f]+\.png$/i.exec(relative);
      if (!real.startsWith(workRoot + path.sep) || !match || Number(match[1]) !== frame.shot - 1 ||
          hash(real) !== candidate.sha256 ||
          !Number.isInteger(candidate.candidate) || candidate.candidate < 1 ||
          candidateIds.has(candidate.candidate)) {
        throw new Error('A pending frame changed. Generate first frames again.');
      }
      candidateIds.add(candidate.candidate);
    }
  }
  return { work, workRoot, data, count };
}

function studioMotionEditor() {
  const configured = process.env.SHORTS_EDITOR || 'auto';
  if (configured !== 'auto') return configured === 'artcraft' ? 'artcraft' : 'ffmpeg';
  const artcraftTools = ['photocraft-cli', 'filmcraft-cli', 'soundcraft-cli', 'effectcraft-cli']
    .map((tool) => path.join(ROOT, 'storage', 'tools', 'artcraft', tool));
  return process.platform === 'darwin' && artcraftTools.every((tool) => {
    try { return (fs.statSync(tool).mode & 0o111) !== 0; } catch { return false; }
  }) ? 'artcraft' : 'ffmpeg';
}

function takeWork(scenario) {
  return path.resolve(ROOT, 'storage', 'any-local', path.basename(scenario, '.json'));
}
function takeContext(session, shot) {
  const story = path.resolve(ROOT, session.scenario);
  const work = takeWork(session.scenario);
  const scenario = JSON.parse(fs.readFileSync(story, 'utf8').replace(/^\uFEFF/, ''));
  const pick = String(scenario.settings?.quality || session.options?.quality || '').toLowerCase().trim();
  const quality = pick === 'high' ? 'high' : 'standard';
  const [shortWidth, shortHeight] = quality === 'high' ? [704, 1280] : [384, 640];
  const [width, height] = (scenario.settings?.format || 'short') !== 'short' ? [shortHeight, shortWidth] : [shortWidth, shortHeight];
  const pointer = (name) => {
    try { return fs.readFileSync(path.join(ROOT, 'storage', 'setup', name + '-dir.txt'), 'utf8').trim(); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const expected = {
    scenarioSha256: sha256(story),
    renderSettings: { quality, width, height, frames: 97, fps: 24, editor: studioMotionEditor(),
      model: pointer('ltx-model'), gemma: pointer('gemma-model') },
    referenceSha256: session.sequence?.approvedFrames?.find((frame) => frame.shot === shot)?.sha256,
  };
  if (expected.referenceSha256) {
    const approved = session.sequence.approvedFrames.find((frame) => frame.shot === shot);
    const reference = fs.realpathSync(path.resolve(work, approved.file));
    if (!reference.startsWith(fs.realpathSync(work) + path.sep) || sha256(reference) !== expected.referenceSha256) {
      throw new Error('The approved take reference changed.');
    }
  } else if (shot) {
    const frame = frameManifest(session.scenario).stills[shot - 1];
    if (frame) expected.referenceSha256 = sha256(path.join(ROOT, frame.p));
  }
  return { work, expected, shotCount: scenario.plan.shots.length };
}
function restoreSequenceTake(session, optional, message) {
  if (!optional || session.kind !== 'sequence-motion' || session.status === 'done') return;
  const shot = session.sequence?.currentShot;
  if (!shot) return;
  try {
    const { work, expected } = takeContext(session, shot);
    const state = availableTakes(work, shot, expected);
    if (!state.completed[state.current]) return;
    session.sequence.takeError = message;
    session.status = 'done';
    session.error = null;
  } catch { /* a missing or stale selection cannot be restored */ }
}
function commitTakeJob(session, reportFile, request) {
  const { work, shotCount } = takeContext(session);
  const rows = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const shots = session.kind === 'sequence-motion' ? [session.sequence.currentShot] : Array.from({ length: shotCount }, (_, i) => i + 1);
  if (!Array.isArray(rows) || rows.length !== shots.length) throw new Error('Incomplete take report.');
  const state = motionState(work);
  for (const [index, shot] of shots.entries()) {
    const take = request?.shot === shot ? request.take : state[shot - 1]?.current ?? 0;
    const row = rows[index];
    verifiedTake(work, row, { ...takeContext(session, shot).expected, shot, take });
    if (session.kind === 'sequence-motion' && !row.endFrame) throw new Error('Missing continuity frame.');
    const cached = state[shot - 1]?.completed?.[take];
    const sameApprovedInput = cached?.scenarioSha256 === row.scenarioSha256 &&
      cached.approvedReferenceSha256 === row.approvedReferenceSha256 &&
      Object.entries(row.renderSettings).every(([key, value]) => cached.renderSettings?.[key] === value);
    const switching = request?.cacheOnly && request.shot === shot;
    const preserving = sameApprovedInput && (!request || request.shot !== shot);
    if ((switching || (session.kind === 'render' && preserving)) &&
        (!sameApprovedInput || cached.segments.length !== row.segments.length ||
          row.segments.some(({ clip, sha256, seed }, part) => {
            const prior = cached.segments[part];
            return prior.clip !== clip || prior.sha256 !== sha256 || prior.seed !== seed;
          }))) {
      throw new Error('Assembly did not reuse the selected take.');
    }
  }
  const finalExport = session.kind === 'render' ? { jobId: session.takeJob.id, session: session.id,
    path: session.video, sha256: sha256(path.join(ROOT, session.video)) } : null;
  commitTakes(work, rows.map((row) => ({ ...row, completedJobId: session.takeJob.id })), request, finalExport);
  for (const row of rows) {
    const prior = technicalObservations(state[row.shot - 1]?.completed?.[row.take]);
    for (const { part, clipSha256, reason } of technicalObservations(row)) {
      if (prior.some((entry) => entry.part === part && entry.clipSha256 === clipSha256 && entry.reason === reason)) continue;
      ledger({ type: 'motion-clip-gate', schemaVersion: 1, gate: 'technical-screen',
        gateVersion: 'first-checks-v1', session: session.id, shot: row.shot, take: row.take,
        part, clipSha256, flagged: Boolean(reason), reason });
    }
  }
  if (request && session.sequence?.stage === 'ready' && session.kind === 'render') {
    const row = rows.find((item) => item.shot === request.shot);
    if (row?.endFrame) session.sequence.endFrames = session.sequence.endFrames.map((item) => item.shot === row.shot ? row : item);
  }
}

function sequenceMotionResult(scenario, sequence, shot, includeSegments = false, options = {}) {
  const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(scenario, '.json'));
  const manifestPath = path.join(workRoot, 'sequence', `shot-${String(shot).padStart(2, '0')}.json`);
  const state = motionState(workRoot)[shot - 1];
  const result = state?.completed
    ? verifiedTake(workRoot, state.completed[state.current], { ...takeContext({ scenario, sequence, options }, shot).expected, shot, take: state.current })
    : JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const story = path.join(ROOT, scenario);
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const approved = sequence.approvedFrames.find((frame) => frame.shot === shot);
  const approvedPath = approved && path.resolve(workRoot, approved.file);
  if (!approvedPath || !approvedPath.startsWith(workRoot + path.sep) ||
      hash(fs.realpathSync(approvedPath)) !== approved.sha256) {
    throw new Error(`The approved first frame for shot ${shot} changed.`);
  }
  const checkedFile = (relative, expectedHash) => {
    const candidate = path.resolve(workRoot, relative || '');
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(workRoot + path.sep) || hash(real) !== expectedHash) {
      throw new Error(`The verified motion artifact for shot ${shot} changed.`);
    }
    return path.relative(workRoot, real);
  };
  if (!approved || result.schemaVersion !== 1 || result.shot !== shot ||
      result.scenarioSha256 !== hash(story) ||
      result.scenarioSha256 !== approved.scenarioSha256 ||
      result.approvedReferenceSha256 !== approved.sha256) {
    throw new Error(`Shot ${shot} motion does not match the current story and approved first frame.`);
  }
  const clip = checkedFile(result.clip, result.clipSha256);
  const endFrame = checkedFile(result.endFrame, result.endFrameSha256);
  return { shot, clip, clipSha256: result.clipSha256, endFrame, endFrameSha256: result.endFrameSha256,
    take: result.take ?? null, parts: result.parts ?? null,
    ...(includeSegments && Array.isArray(result.segments) ? {
      segments: result.segments.map((segment, index) => ({
        part: index + 1,
        clip: checkedFile(segment.clip, segment.sha256),
        sha256: segment.sha256,
      })),
    } : {}) };
}

function sequenceIdentityReference(scenario, sequence) {
  const identity = sequence.approvedFrames.find((frame) => frame.shot === 1);
  if (!identity || identity.scenarioSha256 !== crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, scenario))).digest('hex')) {
    throw new Error('The first approved shot is missing or belongs to an older story.');
  }
  const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(scenario, '.json'));
  const candidate = path.resolve(workRoot, identity.file);
  const real = fs.realpathSync(candidate);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');
  if (!real.startsWith(workRoot + path.sep) || digest !== identity.sha256) {
    throw new Error('The shared identity reference changed; review shot 1 again.');
  }
  return path.relative(ROOT, real);
}

function saveSequenceFrameManifest(scenario, sequence, reviewer) {
  const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(scenario, '.json'));
  const story = path.join(ROOT, scenario);
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const scenarioSha256 = hash(story);
  const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
  const frames = [...sequence.approvedFrames].sort((a, b) => a.shot - b.shot);
  if (frames.length !== count || frames.some((frame, index) => frame.shot !== index + 1)) {
    throw new Error('Sequential frame approval is incomplete.');
  }
  for (const frame of frames) {
    const file = path.resolve(workRoot, frame.file);
    const real = fs.realpathSync(file);
    if (!real.startsWith(workRoot + path.sep) || hash(real) !== frame.sha256) {
      throw new Error(`The approved first frame for shot ${frame.shot} changed.`);
    }
  }
  const manifest = {
    schemaVersion: 1,
    scenarioSha256,
    referenceManifestSha256: readReferenceManifest(scenario).sha256,
    reviewMethod: 'human',
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString(),
    sharedIdentityReference: {
      shot: frames[0].shot,
      file: frames[0].file,
      sha256: frames[0].sha256,
    },
    frames,
  };
  const target = path.join(workRoot, 'first-frames.json');
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, target);
}

function previewFrames(scenario, since = 0) {
  const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
  const refs = path.resolve(ROOT, work, 'refs');
  let count;
  try { count = JSON.parse(fs.readFileSync(path.join(ROOT, scenario), 'utf8')).plan.shots.length; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  let names;
  try { names = fs.readdirSync(refs); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const reviews = new Map();
  for (const name of names.filter((file) => /^vision-[0-9a-f]+\.json$/i.test(file))) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(refs, name), 'utf8'));
      const image = path.resolve(ROOT, report.image || '');
      if (!image.startsWith(refs + path.sep)) continue;
      if (!/^shot-\d+-[0-9a-f]+\.png$/i.test(path.basename(image))) continue;
      const checkedAt = fs.statSync(path.join(refs, name)).mtimeMs;
      const key = path.basename(image);
      if (!reviews.has(key) || reviews.get(key).checkedAt < checkedAt) {
        reviews.set(key, {
          checkedAt,
          status: String(report.status || 'unverified'),
          reason: (report.verdict?.missingOrWrong || []).join('; ').slice(0, 300),
        });
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error;
    }
  }
  const latest = new Map();
  for (const name of names.filter((file) => /^shot-\d+-[0-9a-f]+\.png$/i.test(file))) {
    const index = Number(name.match(/^shot-(\d+)-/)[1]);
    if (index >= count) continue;
    const file = path.join(refs, name);
    let fileTime;
    try { fileTime = fs.statSync(file).mtimeMs; }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const review = reviews.get(name);
    const t = Math.max(fileTime, review?.checkedAt || 0);
    if (since && t < since) continue;
    if (!latest.has(index) || latest.get(index).t < t) {
      latest.set(index, {
        shot: index + 1, p: path.relative(ROOT, file), t, n: name, verified: false,
        reviewStatus: review?.status || 'unverified', reviewReason: review?.reason || '',
      });
    }
  }
  return [...latest.values()].sort((a, b) => a.shot - b.shot);
}

function start(kind, args, extra = {}) {
  const startedAt = Date.now();
  let x = extra.session;
  if (!x) {
    x = { id: createSessionId(sessions.keys(), startedAt), user: extra.user, name: sessionTitle(extra.prompt || 'New video'), prompt: extra.prompt || '', options: extra.options || {}, attempts: [], requestIds: [], createdAt: startedAt, plan: null, scenario: null, video: null };
    sessions.set(x.id, x);
  } else if (extra.archiveAttempt) {
    x.attempts ||= [];
    x.attempts.push({
      startedAt: x.startedAt || x.createdAt,
      updatedAt: x.updatedAt || Date.now(),
      kind: x.kind,
      status: x.status,
      options: { ...(x.options || {}) },
      steps: [...(x.steps || [])],
      lines: [...(x.lines || [])],
      events: [...(x.events || [])],
      error: x.error || null,
      scenario: x.scenario || null,
      plan: x.plan || null,
      video: x.video || null,
      technicalQa: x.technicalQa || null,
    });
  }
  x.attempts ||= [];
  x.requestIds ||= [];
  if (extra.requestId && !x.requestIds.includes(extra.requestId)) x.requestIds.push(extra.requestId);
  if (extra.options) x.options = extra.options;
  if (extra.sequence) x.sequence = extra.sequence;
  Object.assign(x, { kind, status: 'running', startedAt, steps: [], lines: [], events: [], error: null, timedOut: false,
    unattendedRun: extra.unattended === true });
  if (kind === 'render' || kind === 'stills' || kind === 'sequence-motion') { if (kind === 'render') {
      if (x.video && x.technicalQa?.status === 'passed') x.previousVideo = x.video;
      x.video = null;
      x.technicalQa = { status: 'pending' };
    } x.scenario = extra.scenario || x.scenario; } else { x.plan = null; x.scenario = null; }
  if (kind === 'draft') {
    if (x.video && x.technicalQa?.status === 'passed') x.previousVideo = x.video;
    x.video = null;
    x.technicalQa = null;
    x.plan = null;
    x.scenario = null;
  }
  job = x;
  const reportFile = kind === 'sequence-motion' || (kind === 'render' && extra.pinFrames)
    ? path.join(SESS_DIR, `take-${crypto.randomUUID()}.report`) : null;
  x.takeJob = reportFile ? { id: path.basename(reportFile), shot: extra.takeRequest?.shot ?? x.sequence?.currentShot ?? null,
    take: extra.takeRequest?.take ?? null, optional: Boolean(extra.takeRequest) } : null;
  const proc = spawn(extra.cmd ? extra.cmd[0] : 'bash', extra.cmd ? [...extra.cmd.slice(1), ...args] : ['scripts/make-local-video.sh', ...args], { cwd: ROOT, detached: true, env: { ...process.env, PYTHONUNBUFFERED: '1', // the prompt gate scores food close-ups and a luxury-kitchen look; it does not apply to cartoon/custom looks
    ...(kind === 'render' && extra.pinFrames ? { SHORTS_STUDIO_PIN_FRAMES: '1' } : {}),
    ...(reportFile ? { SHORTS_STUDIO_TAKE_REPORT: reportFile } : {}),
    ...(extra.takeRequest ? { SHORTS_STUDIO_TAKE_SHOT: String(extra.takeRequest.shot),
      SHORTS_STUDIO_TAKE_INDEX: String(extra.takeRequest.take) } : {}),
    ...(extra.learningEvidence ? { SHORTS_STUDIO_LEARNING_EVIDENCE: JSON.stringify(extra.learningEvidence) } : {}),
    ...(kind === 'draft' ? { SHORTS_STUDIO_UNATTENDED: x.options?.unattended === true ? '1' : '0' } : {}),
    SHORTS_RENDER_QUALITY: x.options?.quality === 'high' ? 'high' : 'standard', // opt-in 704x1280 (scripts/render_quality.py); standard stays the fast default
    ...(x.options && x.options.look && x.options.look !== 'food' ? { SHORTS_MIN_PROMPT_SCORE: '0' } : {}) } });
  x.proc = proc; // not serialised: snap() copies named fields only
  const spawnCmd = extra.cmd ? extra.cmd[0] : 'bash';
  const spawnArgs = extra.cmd ? [...extra.cmd.slice(1), ...args] : ['scripts/make-local-video.sh', ...args];
  x.procInfo = { pid: proc.pid, pgid: proc.pid, command: [spawnCmd, ...spawnArgs].join(' '), scenario: extra.scenario || x.scenario || null };
  const watched = WATCHED_KINDS.includes(kind);
  const retriesUsed = extra.retries || 0;
  x.watchdog = watched ? { state: 'ok', retries: retriesUsed, maxRetries: MAX_AUTO_RETRIES, lastFault: null } : null;
  const awake = keepAwakeCommand(proc.pid);
  if (awake) {
    try {
      const keeper = spawn(awake.cmd, awake.args, { stdio: 'ignore' });
      keeper.on('error', () => x.lines.push('Keep-awake is unavailable (caffeinate not found); the Mac may sleep during this job.'));
      keeper.unref();
    } catch { /* keep-awake is best effort */ }
  }
  let lastActivityAt = Date.now();
  // Longer plans call the local story model once per shot; size the hard limit to requested runtime.
  // Keep an idle watchdog too, so a truly stalled model is still stopped and recoverable.
  const plannedSeconds = Math.max(10, Number(x.options?.seconds) || 30);
  const draftTimeout = draftTimeoutMs(plannedSeconds, process.env.STUDIO_DRAFT_TIMEOUT_MS);
  const draftIdleTimeout = draftIdleTimeoutMs(plannedSeconds, process.env.STUDIO_DRAFT_IDLE_TIMEOUT_MS);
  const limits = watchdogLimits(plannedSeconds, process.env);
  let stall = null;
  const watchdog = (kind === 'draft' || watched) ? setInterval(() => {
    if (x.status !== 'running') return;
    if (kind === 'draft') {
      if (Date.now() - startedAt < draftTimeout && Date.now() - lastActivityAt < draftIdleTimeout) return;
      x.error = 'Planning took too long and was stopped. Your brief and previous export are saved; retry planning or shorten the idea. No new media was rendered.';
    } else {
      stall = checkStall({ startedAt, lastActivityAt, now: Date.now(), limits });
      if (!stall) return;
      x.error = stallMessage(stall);
      if (x.watchdog) x.watchdog.state = 'stalled';
    }
    x.timedOut = true;
    x.status = 'stopping';
    try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* already exited */ }
    x.stopTimeout = setTimeout(() => {
      if (x.status === 'stopping') { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* exited */ } }
    }, 5000).unref();
    persist(x); emit();
  }, 250).unref() : null;
  let buf = '';
  let verifiedExport = null;
  let failedQa = false;
  const onData = (chunk) => {
    lastActivityAt = Date.now();
    if (x.takeJob && !x.takeJob.observedOwner && x.proc === proc && x.procInfo) {
      const identity = liveProcessIdentity(proc.pid);
      if (identity?.pid === proc.pid && identity.pgid === proc.pid &&
          isOrphanScenarioMember({ recorded: x.procInfo, live: identity })) {
        x.procInfo.command = identity.command;
        x.takeJob.observedOwner = true;
        persist(x);
      }
    }
    buf += chunk.toString();
    const parts = buf.split(/\r|\n/); buf = parts.pop();
    for (const raw of parts) {
      const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      if (!line) continue;
      if (line.startsWith(EVENT_PREFIX)) { const event = parseEvent(line); if (event) x.events.push({ ...event, at: Date.now() }); continue; } // structured, kept out of the human log
      x.lines.push(line);
      const verified = /^Studio verified export: (outputs\/[^/\\]+\.mp4)$/.exec(line);
      if (verified) verifiedExport = verified[1];
      if (line.startsWith('Technical QA failed:')) failedQa = true;
      const hiddenSteps = kind === 'draft'
        ? ['Finishing and exporting', 'Mixing sound', 'Recording narration', 'Generating stills', 'Generating motion clips']
        : kind === 'stills'
          ? ['Finishing and exporting', 'Mixing sound', 'Recording narration', 'Generating motion clips']
          : [];
      for (const [re, label] of STEP_RULES) if (!hiddenSteps.includes(label) && re.test(line)) { if (x.steps[x.steps.length - 1] !== label) x.steps.push(label); break; }
      const sc = line.match(/(drafts\/generated\/[^\s'"]+\.local-scenario\.json)/);
      if (sc) x.scenario = sc[1];
      recordGateEvent(x, line);
    }
    if (Date.now() - (x.lastSave || 0) > 5000) persist(x);
    if (job === x) emit();
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', (error) => { x.error = error.message; });
  proc.on('close', async (code, signal) => {
    clearInterval(watchdog);
    const stoppedByUser = x.status === 'stopping' && !x.timedOut;
    clearTimeout(x.stopTimeout);
    if (buf.trim()) onData(Buffer.from('\n'));
    if (x.status === 'stopping') x.status = x.timedOut ? 'failed' : 'cancelled';
    if (x.status !== 'cancelled') {
      x.status = code === 0 && !x.timedOut ? 'done' : 'failed';
      if (code !== 0) x.error ||= `Exited with code ${code}. See the log below.`;
    }
    if (x.status !== 'cancelled' && kind === 'draft') {
      x.scenario ||= newest('drafts/generated', '.local-scenario.json', startedAt);
      if (x.scenario) { try { x.plan = JSON.parse(fs.readFileSync(path.join(ROOT, x.scenario), 'utf8')); } catch { /* keep raw log */ } }
    } else if (x.status !== 'cancelled' && kind === 'stills' && x.scenario) {
      try { x.plan = JSON.parse(fs.readFileSync(path.join(ROOT, x.scenario), 'utf8')); } catch { /* keep the last valid plan */ }
    } else if (x.status !== 'cancelled' && kind === 'render') {
      if (code === 0 && verifiedExport && fs.existsSync(path.join(ROOT, verifiedExport))) {
        x.video = verifiedExport;
        x.technicalQa = { status: 'passed' };
      } else {
        x.technicalQa = { status: failedQa ? 'failed' : 'unverified' };
        if (code === 0) {
          x.status = 'failed';
          x.error = 'No verified final export was reported.';
        }
      }
    }
    if (reportFile) {
      if (x.status === 'done') {
        try { commitTakeJob(x, reportFile, extra.takeRequest); }
        catch (error) {
          x.status = 'failed';
          x.error = 'Motion take was not committed: ' + error.message;
        }
      }
      if (kind === 'render' && x.status !== 'done' && (extra.takeRequest || x.video || x.previousVideo)) {
        x.video = x.previousVideo || null;
        x.technicalQa = { status: x.video ? 'passed' : 'unverified' };
      }
      restoreSequenceTake(x, extra.takeRequest, x.error || 'The optional take was cancelled. The previous take is selected.');
      try { fs.unlinkSync(reportFile); } catch { /* an incomplete worker may not have produced a report */ }
      x.takeJob = null;
    }
    if (x.status === 'done' && !x.sequence?.takeError && extra.batchArgs && extra.takeRequest) {
      try {
        const { work, expected } = takeContext(x, extra.takeRequest.shot);
        const state = availableTakes(work, extra.takeRequest.shot, expected);
        if (Object.keys(state.completed).length < 3) {
          const reason = busyReason();
          if (reason) {
            x.sequence.takeError = 'Remaining takes paused. ' + reason;
          } else {
            const next = reserveTake(state);
            start(kind, extra.batchArgs, { ...extra, session: x, takeRequest: { ...next, shot: extra.takeRequest.shot, select: false } });
            return;
          }
        }
      } catch (error) {
        x.status = 'failed';
        x.error = error.message;
      }
    }
    x.procInfo = null;
    persist(x);
    await recordFinalReviewEvidence(x).catch(() => {});
    if (x.proc !== proc) return;
    logRun(x, code);
    recordSessionFailure(x);
    if (watched && x.status === 'failed') {
      const classification = classifyExit({ code, signal, stoppedByUser, stalled: Boolean(stall), tail: x.lines.slice(-40) });
      if (x.watchdog) x.watchdog.lastFault = ['stalled', 'oom', 'crash'].includes(classification) ? classification : null;
      const decision = retryDecision({ classification, kind, retriesUsed, local: isLocalCommand(extra.cmd, args) });
      x.lines.push(`Watchdog: ${decision.why}.`);
      if (decision.retry && job === x) {
        try {
          start(kind, args, { ...extra, session: x, archiveAttempt: true, retries: retriesUsed + 1 });
          emit();
          return;
        } catch (error) { x.error = error.message; }
      }
      persist(x);
    }
    if (job === x && extra.unattended && x.status === 'done' && ['draft', 'stills'].includes(kind)) {
      const blocked = x.lines.some((line) => /^(BLOCKED|NEEDS-CHOICE):/.test(line));
      if (!blocked && x.plan && x.scenario) {
        const args = ['--scenario', x.scenario];
        if (kind === 'draft') args.push('--stills-only', '--best-of-3-stills');
        if (x.options.allowRepeat) args.push('--allow-repeat');
        if (x.options.chain && kind === 'stills') args.push('--chain-images');
        try {
          if (kind === 'stills') frameManifest(x.scenario);
          start(kind === 'draft' ? 'stills' : 'render', args, { session: x, scenario: x.scenario, unattended: true, pinFrames: kind === 'stills' });
        } catch (error) {
          x.status = 'failed'; x.error = error.message; persist(x);
        }
      }
    }
    if (job === x) emit();
  });
  persist(x);
  return x;
}

// ---- learning ledger: every run and every rating is appended to storage/studio-learning/runs.jsonl ----
const LEARN_DIR = path.join(ROOT, 'storage', 'studio-learning');
const LEDGER = path.join(LEARN_DIR, 'runs.jsonl');
function ledger(rec) { try { fs.mkdirSync(LEARN_DIR, { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n'); return true; } catch { return false; } }
function readLedger() { try { return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
const recordedGateKeys = new Set(readLedger().filter((row) => row.type === 'gate-event').map(gateEventKey));
function recordGateEvent(session, line, evidenceSource = 'live-pipeline-output') {
  const signal = classifyGateLine(line);
  if (!signal) return;
  const row = { type: 'gate-event', user: session.user || 'owner', session: session.id, kind: session.kind,
    prompt: session.prompt, look: session.options?.look || null, scenario: session.scenario || null, ...signal,
    evidenceSource, evidenceStatus: 'observed pipeline output; no automatic quality inference' };
  const key = gateEventKey(row);
  if (recordedGateKeys.has(key)) return;
  if (ledger(row)) recordedGateKeys.add(key);
}
function recordSessionFailure(session, evidenceSource = 'terminal-session-state') {
  if (session.status !== 'failed') return;
  const detail = String(session.error || session.lines?.at(-1) || 'session ended in a failed state').replace(/[\r\n]+/g, ' ').slice(0, 240);
  recordGateEvent(session, `Run failed: ${detail}`, evidenceSource);
}
async function recordFinalReviewEvidence(session) {
  if (session.kind !== 'render' || session.status !== 'done' || !session.video
    || !/^outputs\/[\w.-]+\.mp4$/.test(session.video)
    || !/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(session.scenario || '')) return;
  const videoFile = path.resolve(ROOT, session.video);
  const scenarioFile = path.resolve(ROOT, session.scenario);
  const reportFile = videoFile.replace(/\.mp4$/i, '.prereview.json');
  if (!fs.existsSync(videoFile) || !fs.existsSync(scenarioFile) || !fs.existsSync(reportFile)) return;
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const [videoSha256, scenarioSha256] = await Promise.all([fileHash(videoFile), fileHash(scenarioFile)]);
  if (report.videoSha256 !== videoSha256 || report.scenarioSha256 !== scenarioSha256) return;
  if (readLedger().some((row) => row.type === 'machine-review' && row.session === session.id && row.videoSha256 === videoSha256)) return;
  ledger({ type: 'machine-review', evidenceType: 'hash-bound-advisory-prereview', user: session.user || 'owner',
    session: session.id, look: session.options?.look || null, video: session.video, videoSha256,
    scenario: session.scenario, scenarioSha256, visionChecked: report.visionChecked === true,
    flags: report.flags && typeof report.flags === 'object' ? report.flags : {},
    shotMotion: Array.isArray(report.shotMotion) ? report.shotMotion : [],
    likelyBelow4: Array.isArray(report.likelyBelow4) ? report.likelyBelow4 : [],
    unchecked: Array.isArray(report.unchecked) ? report.unchecked : [],
    technicalQa: session.technicalQa?.status || 'unverified',
    evidenceStatus: 'machine screening only; not an artistic verdict; human watch/listen review remains required' });
}
async function saveComparisonFeedback({ baseline, candidate, reviewer, notes }) {
  const outputRoot = fs.realpathSync(path.join(ROOT, 'outputs'));
  const resolveOutput = (value) => {
    if (typeof value !== 'string' || !/^outputs\/[\w.-]+\.mp4$/.test(value)) throw new Error('Choose two finished videos from the Studio output list.');
    const resolved = path.resolve(ROOT, value);
    if (!resolved.startsWith(outputRoot + path.sep) || !fs.existsSync(resolved)) throw new Error('A selected video is missing. Refresh the video list.');
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(outputRoot + path.sep)) throw new Error('Selected video is outside Studio outputs.');
    return real;
  };
  const baselineVideo = resolveOutput(baseline);
  const candidateVideo = resolveOutput(candidate);
  if (baselineVideo === candidateVideo) throw new Error('Choose two different exports.');
  const id = 'studio-listen-' + crypto.randomUUID();
  const input = path.join(ROOT, 'storage', id + '.json');
  const request = { id, experimentId: id, baselineVideo, candidateVideo,
    outcome: 'both-acceptable-no-preference', reviewer,
    notes: String(notes || 'Both acceptable; no preference indicated.').slice(0, 400) };
  fs.writeFileSync(input, JSON.stringify(request));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'creative-learning.mjs'), 'feedback', input],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), 20_000);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(stderr.trim().split('\n')[0] || 'Could not verify the audio comparison.'));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('The feedback recorder returned an unreadable result.')); }
      });
    });
    return result;
  } finally { try { fs.unlinkSync(input); } catch { /* already removed */ } }
}
async function checkpointReviewState(session, user, submitted) {
  if (!session?.scenario || !session?.video || !canSee(user, session)) throw new Error('Unknown export.');
  if (submitted?.video && submitted.video !== session.video) throw new Error('This review belongs to an older export. Reload the current video.');
  const scenarioName = String(session.scenario);
  if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(scenarioName)) throw new Error('The original storyboard is unavailable.');
  const scenarioFile = path.resolve(ROOT, scenarioName);
  const scenarioRoot = path.resolve(ROOT, 'drafts', 'generated') + path.sep;
  if (!scenarioFile.startsWith(scenarioRoot) || !fs.existsSync(scenarioFile)) throw new Error('The original storyboard is unavailable.');
  const inspected = await inspectExport(ROOT, session.video);
  if (inspected.status !== 'complete' || !inspected.contactSheet || !inspected.sampleTimeline.length) throw new Error('Run a fresh checkpoint review for this exact export first.');
  const videoFile = path.resolve(ROOT, session.video);
  const reportFile = videoFile.replace(/\.mp4$/i, '.prereview.json');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const scenarioSha256 = await fileHash(scenarioFile);
  const videoSha256 = await fileHash(videoFile);
  if (report.videoSha256 !== videoSha256 || report.scenarioSha256 !== scenarioSha256) throw new Error('The checkpoint report is stale or belongs to a different storyboard. Run the review again.');
  const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
  const shots = scenario.plan?.shots;
  if (!Array.isArray(shots) || shots.length !== inspected.sampleTimeline.length) throw new Error('The checkpoint list does not match the saved storyboard.');
  const timeline = inspected.sampleTimeline.map((item, index) => {
    const shot = shots[index];
    const action = String(shot.motionPrompt || shot.imagePrompt || '').slice(0, 400);
    if (item.shot !== index + 1 || item.plannedAction !== action) throw new Error('The checkpoint actions do not match the saved storyboard. Run the review again.');
    return item;
  });
  if (!submitted) {
    const past = readLedger().filter((item) => item.type === 'checkpoint-review' && item.user === user.name
      && item.session === session.id && item.videoSha256 === videoSha256 && item.scenarioSha256 === scenarioSha256
      && item.contactSheetSha256 === report.contactSheetSha256).at(-1);
    return { available: true, review: past || null, timeline };
  }
  const validShotOutcomes = new Set(['matches', 'partial', 'not-visible']);
  const validPayoff = new Set(['achieved', 'partial', 'not-visible']);
  const findings = submitted.shotFindings;
  if (submitted.confirmed !== true || !Array.isArray(findings) || findings.length !== shots.length
    || !validPayoff.has(submitted.payoff) || findings.some((item, index) => item?.shot !== index + 1
      || !validShotOutcomes.has(item.outcome))) throw new Error('Review every shot and the final payoff before saving.');
  const saved = { type: 'checkpoint-review', evidenceType: 'scenario-bound-human-checkpoint-review',
    id: 'checkpoint-' + crypto.randomUUID(), user: user.name, session: session.id,
    video: session.video, videoSha256, scenario: scenarioName, scenarioSha256,
    contactSheet: inspected.contactSheet, contactSheetSha256: report.contactSheetSha256,
    title: String(scenario.plan?.title || '').slice(0, 120),
    look: session.options?.look || null,
    shotFindings: findings.map((item, index) => ({ shot: item.shot, outcome: item.outcome,
      plannedAction: timeline[index].plannedAction, checkpoints: [timeline[index].startSeconds, timeline[index].middleSeconds, timeline[index].endSeconds] })),
    payoff: submitted.payoff, notes: String(submitted.notes || '').trim().slice(0, 500),
    learningUse: 'human evidence only; no score or automatic production-default update' };
  if (!ledger(saved)) throw new Error('Could not save the review record.');
  return { available: true, review: { ...saved, ts: new Date().toISOString() }, timeline };
}
function logRun(x, code) {
  const plan = x.plan?.plan || x.plan || {};
  const shots = plan.shots || [];
  const lines = x.lines || [];
    ledger({ type: 'run', user: x.user || 'owner', session: x.id, kind: x.kind, status: x.status, exitCode: code, prompt: x.prompt, look: x.options?.look, setting: x.options?.setting, ending: x.options?.ending, audio: x.options?.audio, seconds: x.options?.seconds,
    shots: shots.length, shotSeconds: shots.map((s) => s.seconds), title: plan.title, scenario: x.scenario, video: x.video,
    storyModel: x.plan?.model || plan.model || null, ideaModel: x.options?.ideaModel || null,
    technicalQa: x.technicalQa?.status || 'unverified', learningGuidanceCount: Number(x.options?.learningGuidanceCount) || 0,
    completedSteps: [...new Set(x.steps || [])],
    durationSec: Math.round((Date.now() - x.startedAt) / 1000),
    blocked: blockerReasons(lines), fixed: lines.filter((l) => /^Fixed automatically/.test(l)).map((l) => l.slice(21, 160)), tries: lines.filter((l) => /^Attempt \d+\/\d+/.test(l)).length || undefined, reviews: lines.filter((l) => /^REVIEW/.test(l)).length });
  if (x.kind === 'draft') recordScenePlans(x, shots);
}
function recordScenePlans(session, shots) {
  if (!Array.isArray(shots) || !shots.length) return;
  shots.forEach((shot, index) => ledger({ type: 'scene-plan', user: session.user || 'owner', session: session.id,
    scenario: session.scenario, shot: index + 1, seconds: shot.seconds, narration: shot.narration,
    imagePrompt: shot.imagePrompt, motionPrompt: shot.motionPrompt, sound: shot.sound,
    evidenceStatus: 'generated scene plan; not human-approved for reuse' }));
}
async function backfillPersistedEvidence() {
  const rows = readLedger();
  const sessionsWithSceneEvidence = new Set(rows.filter((item) => item.type === 'scene-plan').map((item) => item.session));
  for (const session of sessions.values()) {
    for (const line of session.lines || []) recordGateEvent(session, String(line), 'persisted-session-log');
    recordSessionFailure(session, 'persisted-session-status');
    await recordFinalReviewEvidence(session).catch(() => {});
    if (session.kind !== 'draft' || sessionsWithSceneEvidence.has(session.id)) continue;
    let shots = session.plan?.plan?.shots || session.plan?.shots;
    if (!Array.isArray(shots) && /^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(session.scenario || '')) {
      try { shots = JSON.parse(fs.readFileSync(path.resolve(ROOT, session.scenario), 'utf8')).plan?.shots; } catch { /* no readable historical plan */ }
    }
    recordScenePlans(session, shots);
  }
}
void backfillPersistedEvidence();
function learning(user) {
  const rows = readLedger();
  const ownedRows = rows.filter((r) => user?.role === 'owner' || r.user === user?.name);
  const runs = ownedRows.filter((r) => r.type === 'run'); const fb = ownedRows.filter((r) => r.type === 'feedback');
  const gateEvents = ownedRows.filter((r) => r.type === 'gate-event');
  const scenePlans = ownedRows.filter((r) => r.type === 'scene-plan');
  const machineReviews = ownedRows.filter((r) => r.type === 'machine-review');
  const checkpointReviews = ownedRows.filter((r) => r.type === 'checkpoint-review');
  const renders = runs.filter((r) => r.kind === 'render' && r.status === 'done' && r.shots > 0 && r.durationSec > 0);
  const per = renders.map((r) => (r.durationSec - 80) / r.shots).filter((v) => v > 120 && v < 600).sort((p, q) => p - q);
  const cycle = per.length >= 2 ? Math.round(per[Math.floor(per.length / 2)]) : null; // median seconds per shot from this Mac's own renders
  const blockers = {}; runs.forEach((r) => (r.blocked || []).filter((b) => !/provisional score/.test(b)).forEach((b) => { const k = b.replace(/^BLOCKED:\s*/, '').replace(/shot \d+: /, ''); blockers[k] = (blockers[k] || 0) + 1; }));
  const byLook = {}; fb.forEach((f) => { const k = f.look || 'unknown'; byLook[k] ||= { up: 0, down: 0 }; byLook[k][f.rating === 'up' ? 'up' : 'down']++; });
  const guidedRuns = runs.filter((run) => run.learningGuidanceCount > 0).length;
  return { drafts: runs.filter((r) => r.kind === 'draft').length, renders: renders.length, failed: runs.filter((r) => r.status === 'failed').length,
    gateEvents: gateEvents.length, scenePlans: scenePlans.length, machineReviews: machineReviews.length,
    recentGateEvents: gateEvents.slice(-5).map((event) => ({ gate: event.gate, outcome: event.outcome, message: event.message })),
    calibration: { cycleSec: cycle, samples: per.length }, topBlockers: Object.entries(blockers).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
    ratings: byLook, recentNotes: fb.filter((f) => f.note).slice(-5).map((f) => ({ look: f.look, rating: f.rating, note: f.note })),
    guidedRuns, recentMachineReviews: machineReviews.slice(-3).map((review) => ({ look: review.look,
      visionChecked: review.visionChecked, likelyBelow4: review.likelyBelow4, flags: review.flags, technicalQa: review.technicalQa })),
    checkpointReviews: checkpointReviews.length, recentCheckpointReviews: checkpointReviews.slice(-5).map((item) => ({
      title: item.title, payoff: item.payoff, notes: item.notes, findings: item.shotFindings.map((shot) => ({ shot: shot.shot, outcome: shot.outcome })),
    })) };
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });
function runReadinessCheck() {
  return new Promise((resolve, reject) => {
    execFile('python3', ['scripts/check-env.py'], { cwd: ROOT, timeout: 30000, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
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

function exportArtifacts(session) {
  if (!session?.video || !/^outputs\/[\w.-]+\.mp4$/i.test(session.video)) return [];
  const outputRoot = path.resolve(ROOT, 'outputs') + path.sep;
  const videoFile = path.resolve(ROOT, session.video);
  if (!videoFile.startsWith(outputRoot)) return [];
  const videoStem = path.basename(session.video).replace(/\.mp4$/i, '').replace(/\.(?:captioned|artcraft|filmcraft)$/i, '');
  const stems = [...new Set([videoStem, videoStem.replace(/\.sfx$/i, '')])];
  const candidates = [
    { kind: 'captions', label: 'Captions (.srt)', files: stems.map((stem) => `${stem}.srt`) },
    { kind: 'publish-pack', label: 'Publish pack (.json)', files: [...stems.map((stem) => `${stem}.pack.json`), `${stems.at(-1)}.sfx.pack.json`] },
    { kind: 'quality-report', label: 'Release quality report (.json)', files: stems.flatMap((stem) => [`${stem}.pack.quality.json`, `${stem}.quality.json`]) },
    { kind: 'provenance', label: 'Provenance (.json)', files: [
      path.basename(session.video).replace(/\.mp4$/i, '.provenance.json'),
      ...stems.map((stem) => `${stem}.provenance.json`),
    ] },
  ];
  return candidates.flatMap(({ kind, label, files }) => {
    const file = files.map((name) => path.join(ROOT, 'outputs', name))
      .find((candidate) => {
        const resolved = path.resolve(candidate);
        return resolved.startsWith(outputRoot) && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
      });
    return file ? [{ kind, label, path: path.relative(ROOT, file) }] : [];
  });
}

function boundedJsonBody(req, limit) {
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

function imageDimensions(buffer, mime) {
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

function uploadedImage(dataUrl) {
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

const CHARACTER_DIR = path.join(ROOT, 'storage', 'studio-characters');
const CHARACTER_ID = /^[0-9a-f]{32}$/;

function characterCatalog() {
  if (!fs.existsSync(CHARACTER_DIR)) return [];
  return fs.readdirSync(CHARACTER_DIR)
    .filter((name) => CHARACTER_ID.test(path.basename(name, '.json')) && name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(CHARACTER_DIR, name), 'utf8')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function characterImage(id) {
  if (!CHARACTER_ID.test(id)) throw new Error('Choose a saved character.');
  const record = characterCatalog().find((item) => item.id === id);
  if (!record || !['png', 'jpg'].includes(record.ext)) throw new Error('Saved character is unavailable.');
  const file = fs.realpathSync(path.join(CHARACTER_DIR, id + '.' + record.ext));
  if (path.dirname(file) !== fs.realpathSync(CHARACTER_DIR)) throw new Error('Saved character file is invalid.');
  const buffer = fs.readFileSync(file);
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== record.sha256) {
    throw new Error('Saved character image changed.');
  }
  return { buffer, ext: record.ext, mime: record.ext === 'png' ? 'image/png' : 'image/jpeg' };
}

function writeReferenceImage(workRoot, shot, image) {
  const digest = crypto.createHash('sha256').update(image.buffer).digest('hex');
  const relative = `references/shot-${String(shot).padStart(2, '0')}-${digest.slice(0, 16)}.${image.ext}`;
  const target = path.join(workRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== digest) {
      throw new Error('A stored reference image does not match its filename.');
    }
  } else {
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, image.buffer, { flag: 'wx' });
    fs.renameSync(temporary, target);
  }
  return { shot, file: relative, sha256: digest, mime: image.mime };
}

function serveFile(req, res, file, roots) {
  const real = path.resolve(file);
  if (roots && !roots.some((r) => real.startsWith(r + path.sep))) return json(res, 403, { error: 'Not allowed' });
  if (!fs.existsSync(real) || !fs.statSync(real).isFile()) return json(res, 404, { error: 'Not found' });
  const size = fs.statSync(real).size; const type = MIME[path.extname(real)] || 'application/octet-stream';
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    const start = range?.[1] ? Number(range[1]) : Math.max(0, size - Number(range?.[2]));
    const end = range?.[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    const stream = fs.createReadStream(real, { start, end });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(real).pipe(res);
}

// Optional private remote access (for example `tailscale serve` or `tailscale funnel` in front of this server).
// STUDIO_ALLOWED_ORIGINS=https://mac.tailnet.ts.net  lets that exact page call the API.
// STUDIO_TOKEN=...  the owner's token. storage/studio-users.json lists relatives: {"users":[{"name":"Mum","token":"...","dailyRenders":3}]}.
// With either set, every request needs the cookie that opening /?token=... sets; relatives only see their own videos.
const EXTRA_ORIGINS = (process.env.STUDIO_ALLOWED_ORIGINS || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
const TOKEN = process.env.STUDIO_TOKEN || '';
const USERS_FILE = process.env.STUDIO_USERS_FILE || path.join(ROOT, 'storage', 'studio-users.json');
const CREATOR_MAX_SECONDS = 20, CREATOR_DAILY_DRAFTS = 12;
function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function readUsers() { try { return (JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users || []).filter((u) => u.name && u.token); } catch { return []; } }
const authOn = () => Boolean(TOKEN) || readUsers().length > 0;
function userFor(candidate) {
  if (TOKEN && sameToken(candidate, TOKEN)) return { name: 'owner', role: 'owner' };
  for (const u of readUsers()) {
    const name = String(u.name).slice(0, 40);
    if (name.trim().toLowerCase() !== 'owner' && sameToken(candidate, u.token)) {
      return { name, role: 'creator', dailyRenders: Number(u.dailyRenders) || 3 };
    }
  }
  return null;
}
// A relative can use only files that belong to their own sessions. Every file of a video shares the plan's id.
const keyOf = (scenario) => scenario ? path.basename(String(scenario)).replace(/\.local-scenario\.json$/, '').replace(/\.json$/, '') : null;
function ownKeys(user) { return [...sessions.values()].filter((x) => x.user === user.name && x.scenario).map((x) => keyOf(x.scenario)).filter(Boolean); }
function mayUse(user, value) {
  if (user.role === 'owner') return true;
  const file = String(value);
  if (path.isAbsolute(file) || path.normalize(file) !== file) return false;
  const keys = ownKeys(user);
  if (file.startsWith('drafts/generated/')) return keys.includes(keyOf(file));
  if (file.startsWith('storage/any-local/')) return keys.includes(file.split('/')[2]);
  const output = file.startsWith('outputs/') ? file.slice('outputs/'.length) : file;
  return !output.includes('/') && keys.some((key) => output.startsWith(key + '-'));
}
function today(user, kind) {
  const day = new Date().toDateString();
  return readLedger().filter((r) => r.type === 'run' && r.user === user.name && r.kind === kind && new Date(r.ts).toDateString() === day).length;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Block cross-site requests: only same-origin pages on this host may call the API.
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) && !EXTRA_ORIGINS.includes(origin)) return json(res, 403, { error: 'Bad origin' });
  req.user = { name: 'owner', role: 'owner' };
  if (authOn()) {
    const cookie = /(?:^|;\s*)studio_token=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const given = url.searchParams.get('token');
    if (given && userFor(given)) {
      res.writeHead(302, { 'Set-Cookie': `studio_token=${encodeURIComponent(given)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, Location: url.pathname });
      return res.end();
    }
    let decoded = '';
    try { decoded = decodeURIComponent(cookie || ''); } catch { /* malformed cookie is unauthorized */ }
    const who = userFor(decoded);
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      return res.end('Studio is locked. Open it once with the private link you were given.');
    }
    req.user = who;
  }
  const me = req.user, isOwner = me.role === 'owner';
  if (url.pathname === '/api/me') {
    const owner = me.role === 'owner';
    return json(res, 200, { name: me.name, role: me.role, maxSeconds: owner ? 60 : CREATOR_MAX_SECONDS,
      rendersLeft: owner ? null : Math.max(0, me.dailyRenders - today(me, 'render')), draftsLeft: owner ? null : Math.max(0, CREATOR_DAILY_DRAFTS - today(me, 'draft')),
      canCompare: owner, canSeeLog: owner, canRunUnattended: owner });
  }
  if (url.pathname === '/api/readiness') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Use GET to run the local readiness check.' });
    try { return json(res, 200, await runReadinessCheck()); }
    catch (error) { return json(res, 503, { error: `Could not run the local readiness check: ${error.message}` }); }
  }
  if (url.pathname === '/api/idea' && req.method === 'POST') {
    const input = await body(req);
    if (!['food', 'cartoon', 'night', 'custom'].includes(input.look)) return json(res, 400, { error: 'Choose a film look.' });
    const seconds = Math.min(isOwner ? 60 : CREATOR_MAX_SECONDS, Math.max(10, Number(input.seconds) || 10));
    const history = readLedger().filter((item) => item.type === 'idea' && item.user === me.name && item.look === input.look).slice(-16).map((item) => item.prompt);
    const projects = [...sessions.values()].filter((item) => canSee(me, item) && item.options?.look === input.look).slice(-8).map((item) => item.prompt);
    if (localIdeaBusy) return json(res, 409, { error: 'The local idea helper is busy. Try again in a moment.' });
    const isBusy = Boolean(busyReason());
    if (!isBusy) localIdeaBusy = true;
    try {
      const result = await ideaService.suggest({ look: input.look, seconds,
        exclude: [...(Array.isArray(input.exclude) ? input.exclude.slice(-8) : []), ...projects, ...history],
        learningEvidence: buildLearningContext(readLedger(), { user: me, look: input.look }),
        busy: isBusy });
      if (!ledger({ type: 'idea', user: me.name, look: input.look, ...result })) return json(res, 500, { error: 'Could not save idea history. Try again.' });
      return json(res, 200, result);
    } catch (error) {
      return json(res, 503, { error: error.message });
    } finally { if (!isBusy) localIdeaBusy = false; }
  }
  if (url.pathname === '/api/refine-idea' && req.method === 'POST') {
    const input = await body(req);
    if (typeof input.prompt !== 'string' || input.prompt.trim().length < 4) return json(res, 400, { error: 'Write a little about your idea first.' });
    if (busyReason()) return json(res, 409, { error: 'Your Mac is making a video. Refine the idea after the current job finishes.' });
    if (localIdeaBusy || ideaRefiner.active) return json(res, 409, { error: 'The local idea helper is busy. Try again in a moment.' });
    localIdeaBusy = true;
    try {
      const learningEvidence = buildLearningContext(readLedger(), { user: me, look: input.look });
      const result = await ideaRefiner.refine({ ...input, learningEvidence });
      return json(res, 200, result);
    } catch (error) {
      const status = /Write a little|incomplete refinement|unreadable refinement/.test(error.message) ? 422 : 503;
      return json(res, status, { error: error.message || 'Could not refine this idea. Your original sentence is unchanged.' });
    } finally { localIdeaBusy = false; }
  }
  if (url.pathname === '/api/state') return json(res, 200, view(me));
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(view(me))}\n\n`);
    res.user = me; clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/draft' && req.method === 'POST') {
    const b = await body(req);
    const requestId = String(b.requestId || '').trim();
    if (requestId && !/^[\w.:-]{1,128}$/.test(requestId)) return json(res, 400, { error: 'Invalid request ID.' });
    if (requestId) {
      const previous = [...sessions.values()].find((item) => item.requestIds?.includes(requestId));
      if (previous) return canSee(me, previous) ? json(res, 200, snap(previous)) : json(res, 409, { error: 'This request has already been processed.' });
    }
    const submittedPrompt = String(b.prompt || '').trim().slice(0, 600);
    const originalPrompt = String(b.originalPrompt || submittedPrompt).trim().slice(0, 600);
    if (!submittedPrompt) return json(res, 400, { error: 'Write a prompt first.' });
    let retrySession = null;
    let retryBrief = null;
    const repairing = b.repair === true;
    if (b.retrySessionId !== undefined) {
      const retryId = String(b.retrySessionId || '');
      retrySession = ID_RE.test(retryId) ? sessions.get(retryId) : null;
      if (!retrySession || !canSee(me, retrySession)) return json(res, 404, { error: 'Unknown project to retry.' });
      const canRetryPlan = retrySession.kind === 'draft'
        || (repairing && retrySession.kind === 'render' && retrySession.status === 'done' && Boolean(retrySession.video));
      if (!canRetryPlan || ['running', 'stopping'].includes(retrySession.status)) return json(res, 409, { error: 'Only a completed story plan or rendered project can be revised.' });
      const savedPrompt = String(retrySession.options?.originalPrompt || retrySession.prompt || '');
      if (normalizeSessionPrompt(originalPrompt) !== normalizeSessionPrompt(savedPrompt)) return json(res, 409, { error: 'The idea changed. Start a separate project to keep the previous attempt.' });
      retryBrief = retrySession.options?.brief || legacyBrief(retrySession);
      if (!retryBrief) return json(res, 409, { error: 'The original story brief is unavailable. Start a separate project to preserve this history.' });
      if (repairing && retrySession.kind !== 'render') return json(res, 409, { error: 'A review repair must start from a rendered project.' });
    }
    if (repairing && !retrySession) return json(res, 400, { error: 'A plan repair must be linked to its existing project.' });
    const requestPrompts = new Set([submittedPrompt, originalPrompt].map(normalizeSessionPrompt).filter(Boolean));
    const duplicate = !retrySession && !b.allowDuplicate && [...sessions.values()].find((item) =>
      item.user === me.name && [item.prompt, item.options?.originalPrompt, item.options?.storyPrompt]
        .some((candidate) => requestPrompts.has(normalizeSessionPrompt(candidate))));
    if (duplicate) return json(res, 409, { error: 'A project with this exact idea already exists.', sessionId: duplicate.id });
    const why = busyReason();
    if (why) return json(res, 409, { error: why });
    if (!isOwner && !retrySession && today(me, 'draft') >= CREATOR_DAILY_DRAFTS) return json(res, 429, { error: `That is today's limit of ${CREATOR_DAILY_DRAFTS} new ideas. Try again tomorrow.` });
    let prompt = submittedPrompt;
    const look = retrySession?.options?.look || (['food', 'cartoon', 'night', 'custom'].includes(b.look) ? b.look : 'food');
    const learningEvidence = buildLearningContext(readLedger(), { user: me, look });
    if (b.unattended && !isOwner) return json(res, 403, { error: 'Only the owner can run unattended.' });
    let refined = null;
    if (!retrySession && b.refine === true) {
      if (localIdeaBusy || ideaRefiner.active) return json(res, 409, { error: 'The local idea helper is busy. Try again in a moment.' });
      localIdeaBusy = true;
      try {
        refined = await ideaRefiner.refine({ prompt, look, seconds: b.seconds, orientation: b.orientation, setting: b.setting, ending: b.ending, learningEvidence });
      } catch (error) {
        const status = /Write a little|incomplete refinement|unreadable refinement/.test(error.message) ? 422 : 503;
        return json(res, status, { error: error.message || 'The local story model could not refine this idea. Your original sentence is unchanged.' });
      } finally { localIdeaBusy = false; }
      if (refined.decision === 'needs_choices') return json(res, 200, { decision: 'needs_choices', refinement: refined });
      prompt = refined.refinedPrompt;
    }
    // Split "A, then B" into first action (hook) and last action (ending) so the story audit can match both.
    const parts = prompt.split(/\s*(?:,\s*(?:and\s+)?then|\bthen\b|[,;.])\s*/i).map((x) => x.trim()).filter((x) => x.length > 3);
    if (!parts.length) parts.push(prompt);
    const LOOKS = {
      food: { style: 'luxury cinematic food film', set: 'dark luxury kitchen' },
      cartoon: { style: 'hand-drawn 2D cartoon animation, bold outlines, flat vibrant colors, expressive characters', set: 'a colourful storybook world that fits the story' },
      night: { style: 'hand-drawn 2D cartoon animation at night, deep navy blue sky and shadows with warm creamy ivory highlights, glowing cream lights, limited navy and cream palette, bold outlines', set: 'a moonlit navy-blue night scene with cream-coloured lights' },
      custom: { style: 'cinematic short film matching the idea', set: 'a setting that fits the idea' },
    };
    const setting = retrySession?.options?.setting || String(b.setting || '').trim().slice(0, 200);
    let answers = retryBrief || { topic: prompt, style: LOOKS[look].style, set: setting || LOOKS[look].set,
      hook: String(refined?.hook || b.hook || parts[0]).trim().slice(0, 300),
      mustShow: String(refined?.mustShow || b.mustShow || originalPrompt).trim().slice(0, 600),
      obstacle: String(refined?.obstacle || b.obstacle || '').trim().slice(0, 300),
      turn: String(refined?.turn || b.turn || '').trim().slice(0, 300),
      ending: String(refined?.ending || b.ending || '').trim().slice(0, 300) || (parts.length > 1 ? parts[parts.length - 1] : prompt), audio: ['asmr', 'voiced', 'auto'].includes(b.audio) ? b.audio : 'asmr',
      seconds: Math.min(isOwner ? 60 : CREATOR_MAX_SECONDS, Math.max(10, Number(b.seconds) || 10)), orientation: b.orientation === 'wide' ? 'wide' : 'vertical' };
    if (repairing) {
      const requiredText = (key, max) => typeof b[key] === 'string' && b[key].trim().length > 0 && b[key].trim().length <= max;
      if (!['hook', 'mustShow', 'obstacle', 'turn', 'ending'].every((key) => requiredText(key, key === 'mustShow' ? 600 : 300))
        || typeof b.repairGuidance !== 'string' || !b.repairGuidance.trim() || b.repairGuidance.length > 600) {
        return json(res, 400, { error: 'The revised brief is incomplete. Review the local AI proposal and try again.' });
      }
      const nextSeconds = Number(b.seconds) || Number(retryBrief.seconds) || 10;
      const allowedSeconds = isOwner ? 60 : CREATOR_MAX_SECONDS;
      if (nextSeconds < 10 || nextSeconds > 60 || (nextSeconds !== Number(retryBrief.seconds) && nextSeconds > allowedSeconds)) {
        return json(res, 400, { error: `Choose a video length from 10 to ${allowedSeconds} seconds for this account.` });
      }
      answers = {
        ...retryBrief,
        topic: originalPrompt,
        hook: b.hook.trim(),
        mustShow: b.mustShow.trim(),
        obstacle: b.obstacle.trim(),
        turn: b.turn.trim(),
        ending: b.ending.trim(),
        seconds: nextSeconds,
        orientation: b.orientation === 'wide' ? 'wide' : 'vertical',
        audio: ['asmr', 'voiced', 'auto'].includes(b.audio) ? b.audio : retryBrief.audio,
      };
    }
    const f = path.join(ROOT, 'storage', `studio-answers-${Date.now()}-${crypto.randomUUID()}.json`);
    fs.writeFileSync(f, JSON.stringify(answers, null, 1));
    const options = { ...(retrySession?.options || {}), look, setting, quality: b.quality === 'high' || (b.quality === undefined && retrySession?.options?.quality === 'high') ? 'high' : 'standard', seconds: answers.seconds, orientation: answers.orientation, audio: answers.audio, ending: answers.ending,
      continuityAnchor: retrySession?.options?.continuityAnchor || (b.continuityAnchor === 'previous-end' ? 'previous-end' : 'identity'), originalPrompt, storyPrompt: repairing ? prompt : retrySession?.options?.storyPrompt || prompt, brief: answers, ...(repairing ? { repairGuidance: b.repairGuidance.trim() } : {}), ideaModel: retrySession?.options?.ideaModel || refined?.model || null, learningGuidanceCount: learningEvidence.guidanceCount, allowRepeat: retrySession ? Boolean(retrySession.options?.allowRepeat) : Boolean(b.allowRepeat), chain: retrySession ? Boolean(retrySession.options?.chain) : look !== 'food', unattended: !repairing && isOwner && b.unattended === true };
    const x = start('draft', ['--answers', path.relative(ROOT, f), ...(options.allowRepeat ? ['--allow-repeat'] : [])], {
      cmd: ['python3', 'scripts/studio-draft.py'], user: me.name, prompt: originalPrompt, learningEvidence,
      unattended: !repairing && isOwner && b.unattended === true, options, requestId,
      ...(retrySession ? { session: retrySession, archiveAttempt: true } : {}),
    });
    return json(res, 202, snap(x));
  }
  if (url.pathname === '/api/character-references' && ['GET', 'POST'].includes(req.method)) {
    if (!isOwner) return json(res, 403, { error: 'The character library belongs to the owner.' });
    try {
      if (req.method === 'GET') {
        return json(res, 200, { characters: characterCatalog().map(({ id, name, sha256 }) => ({ id, name, sha256 })) });
      }
      const input = await body(req);
      const owner = sessions.get(String(input.sessionId));
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!owner || !canSee(me, owner) || !name || name.length > 60) {
        return json(res, 400, { error: 'Choose an approved frame and a character name up to 60 characters.' });
      }
      if (characterCatalog().some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        return json(res, 409, { error: 'That character name already exists.' });
      }
      const frame = owner.sequence?.approvedFrames?.find((item) => item.shot === input.shot);
      if (!frame) return json(res, 409, { error: 'Approve this first frame before saving it as a character.' });
      const work = path.resolve(ROOT, 'storage', 'any-local', path.basename(owner.scenario, '.json'));
      const source = fs.realpathSync(path.resolve(work, frame.file));
      if (!source.startsWith(work + path.sep)) throw new Error('The approved image is outside the session.');
      const buffer = fs.readFileSync(source);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      if (sha256 !== frame.sha256) throw new Error('The approved image changed.');
      const mime = path.extname(source).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      const image = uploadedImage(`data:${mime};base64,${buffer.toString('base64')}`);
      const id = crypto.randomUUID().replaceAll('-', '');
      fs.mkdirSync(CHARACTER_DIR, { recursive: true });
      fs.writeFileSync(path.join(CHARACTER_DIR, id + '.' + image.ext), buffer, { flag: 'wx' });
      fs.writeFileSync(path.join(CHARACTER_DIR, id + '.json'), JSON.stringify({ id, name, sha256, ext: image.ext }), { flag: 'wx' });
      return json(res, 201, { character: { id, name, sha256 } });
    } catch (error) {
      return json(res, 409, { error: error.message || 'Could not read or save the character reference.' });
    }
  }
  if (url.pathname === '/api/reference-frame' && req.method === 'POST') {
    const parsed = await boundedJsonBody(req, 12 * 1024 * 1024);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const b = parsed.value;
    const sc = String(b.scenario || '');
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) ||
        !owner || !canSee(me, owner) || !mayUse(me, sc) || owner.scenario !== sc) {
      return json(res, 403, { error: 'That image reference does not belong to this session.' });
    }
    if (!['draft', 'stills'].includes(owner.kind) || !['done', 'failed'].includes(owner.status) ||
        owner.unattendedRun === true || (owner.unattendedRun !== false && owner.options?.unattended === true)) {
      return json(res, 409, { error: 'Reference images can only be added to a completed attended plan before rendering.' });
    }
    if (owner.sequence?.active) return json(res, 409, { error: 'Reference images are locked while sequential shot review is in progress.' });
    const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const story = path.join(ROOT, sc);
    if (!fs.existsSync(story)) return json(res, 404, { error: 'Unknown plan.' });
    let shotCount;
    try { shotCount = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length; }
    catch { return json(res, 400, { error: 'The story plan is invalid.' }); }
    const shot = Number(b.shot);
    const characterId = typeof b.characterId === 'string' ? b.characterId : '';
    if (characterId && !isOwner) return json(res, 403, { error: 'The character library belongs to the owner.' });
    if (!characterId && (!Number.isInteger(shot) || shot < 1 || shot > shotCount)) {
      return json(res, 400, { error: 'Choose a shot in this plan.' });
    }
    let image;
    try { image = characterId ? characterImage(characterId) : uploadedImage(b.dataUrl); }
    catch (error) { return json(res, 400, { error: error.message }); }

    let previous;
    try { previous = readReferenceManifest(sc); }
    catch (error) { return json(res, 409, { error: error.message || 'The reference-image manifest is invalid.' }); }
    const workRoot = path.join(ROOT, 'storage', 'any-local', path.basename(sc, '.json'));
    let rows;
    try {
      if (characterId) {
        const custom = previous.rows.filter((row) => !row.characterId);
        const customizedShots = new Set(custom.map((row) => row.shot));
        const remaining = Array.from({ length: shotCount }, (_, index) => index + 1)
          .filter((number) => !customizedShots.has(number));
        if (!remaining.length) return json(res, 409, { error: 'Every shot already has a custom reference.' });
        rows = [...custom, ...remaining.map((number) => ({ ...writeReferenceImage(workRoot, number, image), characterId }))];
      } else {
        rows = [...previous.rows.filter((row) => row.shot !== shot), writeReferenceImage(workRoot, shot, image)];
      }
      rows.sort((a, b) => a.shot - b.shot);
    } catch (error) {
      return json(res, 409, { error: error.message });
    }
    const referenceManifest = {
      schemaVersion: 1,
      scenarioSha256: crypto.createHash('sha256').update(fs.readFileSync(story)).digest('hex'),
      references: rows,
    };
    const manifestFile = path.join(workRoot, 'references.json');
    const temporaryManifest = `${manifestFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryManifest, JSON.stringify(referenceManifest, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporaryManifest, manifestFile);
    owner.referenceFrames = readReferenceManifest(sc).references;
    persist(owner);
    emit();
    return json(res, 201, { ok: true, references: owner.referenceFrames,
      ...(!characterId ? { reference: owner.referenceFrames.find((item) => item.shot === shot) } : {}) });
  }
  if ((url.pathname === '/api/stills' || url.pathname === '/api/regen') && req.method === 'POST') {
    // first-frame step: make only the stills (about 25 s each) so a bad frame is caught before 4.5 min of motion
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!isOwner && (!owner || !canSee(me, owner) || !mayUse(me, sc))) return json(res, 403, { error: 'That video belongs to someone else.' });
    if (url.pathname === '/api/regen') {
      const shot = Number(b.shot);
      if (!Number.isInteger(shot) || shot < 1 || shot > 60) return json(res, 400, { error: 'Unknown shot.' });
      if (owner?.sequence?.active &&
          (owner.sequence.stage !== 'review' || shot !== owner.sequence.currentShot)) {
        return json(res, 409, { error: `Only current sequential shot ${owner.sequence.currentShot} can be regenerated.` });
      }
      if (owner?.sequence?.stage === 'ready') {
        const sequence = owner.sequence;
        if (shot > sequence.shotCount) return json(res, 400, { error: 'Unknown shot.' });
        if (shot > 1) {
          const previous = sequence.endFrames.find((frame) => frame.shot === shot - 1);
          const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(sc, '.json'));
          const priorFrame = previous && path.resolve(workRoot, previous.endFrame);
          if (!priorFrame || !priorFrame.startsWith(workRoot + path.sep) || !fs.existsSync(priorFrame) ||
              crypto.createHash('sha256').update(fs.readFileSync(priorFrame)).digest('hex') !== previous.endFrameSha256) {
            return json(res, 409, { error: 'The preceding motion final frame is missing or changed; restart from shot 1.' });
          }
        }
        sequence.active = true;
        sequence.stage = 'review';
        sequence.currentShot = shot;
        sequence.approvedFrames = sequence.approvedFrames.filter((frame) => frame.shot < shot);
        sequence.endFrames = sequence.endFrames.filter((frame) => frame.shot < shot);
      }
      const refs = path.join(ROOT, 'storage', 'any-local', path.basename(sc, '.json'), 'refs'); fs.mkdirSync(refs, { recursive: true });
      const f = path.join(refs, 'seed-bumps.json'); let bumps = {}; try { bumps = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* none yet */ }
      bumps[String(shot - 1)] = (Number(bumps[String(shot - 1)]) || 0) + 1; fs.writeFileSync(f, JSON.stringify(bumps));
      ledger({ type: 'regenerate', user: me.name, session: b.sessionId, shot, scenario: sc });
    }
    const retryingFailedSession = owner?.status === 'failed';
    const unattendedRun = Boolean(isOwner && b.resumeUnattended === true && owner?.options?.unattended === true);
    let sequence = null;
    const stillArgs = ['--scenario', sc, '--stills-only', '--best-of-3-stills',
      ...(!unattendedRun ? ['--allow-pending-visual-review'] : []),
      ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : [])];
    if (!unattendedRun) {
      try {
        const story = JSON.parse(fs.readFileSync(path.join(ROOT, sc), 'utf8'));
        const shotCount = story.plan.shots.length;
        const existing = owner?.sequence;
        if (existing?.active && existing.stage === 'motion') {
          return json(res, 409, { error: 'The current shot motion must finish before the next still can be prepared.' });
        }
        sequence = existing?.active && existing.stage === 'review'
          ? existing
          : { active: true, stage: 'review', currentShot: 1, shotCount,
            approvedFrames: [], endFrames: [], referenceFramesSha256: referenceIdentity(sc) };
        sequence.active = true;
        sequence.shotCount = shotCount;
        const currentShot = sequence.currentShot || 1;
        stillArgs.push('--shot-only', String(currentShot));
        if (currentShot > 1) {
          const previousEnd = sequence.endFrames.find((frame) => frame.shot === currentShot - 1);
          if (!previousEnd) return json(res, 409, { error: 'The preceding motion final frame is missing. Restart sequential review from shot 1.' });
          const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(sc, '.json'));
          const endFrame = path.resolve(workRoot, previousEnd.endFrame);
          if (!endFrame.startsWith(workRoot + path.sep) || !fs.existsSync(endFrame) ||
              crypto.createHash('sha256').update(fs.readFileSync(endFrame)).digest('hex') !== previousEnd.endFrameSha256) {
            return json(res, 409, { error: 'The preceding motion final frame changed. Restart sequential review from shot 1.' });
          }
          stillArgs.push('--chain-source', path.relative(ROOT, endFrame),
            '--chain-source-sha256', previousEnd.endFrameSha256);
          stillArgs.push(...(owner.options?.continuityAnchor === 'previous-end'
            ? ['--chain-images'] : ['--anchor-image', sequenceIdentityReference(sc, sequence)]));
        }
        const firstFrames = path.join(ROOT, 'storage', 'any-local', path.basename(sc, '.json'), 'first-frames.json');
        try { fs.unlinkSync(firstFrames); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      } catch (error) {
        return json(res, 400, { error: error.message || 'The story plan is invalid.' });
      }
    }
    const x = start('stills', stillArgs, owner
      ? { session: owner, scenario: sc, archiveAttempt: retryingFailedSession, unattended: unattendedRun, ...(sequence ? { sequence } : {}) }
      : { scenario: sc, user: me.name, prompt: 'First frames ' + sc.split('/').pop(), ...(sequence ? { sequence } : {}) });
    return json(res, 202, snap(x));
  }
  if (url.pathname === '/api/approve-frames' && req.method === 'POST') {
    const b = await body(req);
    const sc = String(b.scenario || '');
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) ||
        !owner || !canSee(me, owner) || !mayUse(me, sc) || owner.scenario !== sc) {
      return json(res, 403, { error: 'That frame review does not belong to this session.' });
    }
    if (owner.kind !== 'stills' || owner.status !== 'done' || owner.unattendedRun === true ||
        (owner.unattendedRun !== false && owner.options?.unattended === true)) {
      return json(res, 409, { error: 'Only a completed attended stills run can be manually approved.' });
    }
    try {
      const pending = pendingFrameManifest(sc);
      const { work, workRoot, data, count } = pending;
      if (owner.sequence?.active) {
        const sequence = owner.sequence;
        const shot = sequence.currentShot;
        if (sequence.stage !== 'review' || !Array.isArray(b.selections) ||
            b.selections.length !== 1 || b.selections[0].shot !== shot) {
          return json(res, 400, { error: `Choose one candidate for current shot ${shot}.` });
        }
        if (sequence.referenceFramesSha256 !== referenceIdentity(sc)) {
          return json(res, 409, { error: 'Reference images changed during sequential review. Restart frame review.' });
        }
        const predecessor = sequence.endFrames.find((frame) => frame.shot === shot - 1);
        if (sequence.chainSourceHashes?.[shot] && sequence.chainSourceHashes[shot] !== predecessor?.endFrameSha256) {
          return json(res, 409, { error: 'The preceding take changed. Regenerate this frame before approval.' });
        }
        const entry = data.frames.find((item) => item.shot === shot);
        const candidate = entry?.candidates.find((item) =>
          item.candidate === b.selections[0].candidate);
        if (!candidate) return json(res, 409, { error: `No selected candidate is available for shot ${shot}.` });
        const file = fs.realpathSync(path.resolve(workRoot, candidate.file));
        if (!file.startsWith(workRoot + path.sep) ||
            crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== candidate.sha256) {
          return json(res, 409, { error: `The selected candidate for shot ${shot} changed.` });
        }
        sequence.approvedFrames = sequence.approvedFrames.filter((frame) => frame.shot !== shot);
        sequence.approvedFrames.push({
          shot,
          file: path.relative(workRoot, file),
          sha256: candidate.sha256,
          scenarioSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, sc))).digest('hex'),
          reviewedAt: new Date().toISOString(),
          reviewedBy: me.name,
        });
        sequence.approvedFrames.sort((a, b) => a.shot - b.shot);
        sequence.stage = 'motion';
        if (sequence.approvedFrames.length === sequence.shotCount) {
          saveSequenceFrameManifest(sc, sequence, me.name);
        }
        const x = start('sequence-motion', [
          '--scenario', sc, '--scenario-sha256', sequence.approvedFrames.find((frame) => frame.shot === shot).scenarioSha256,
          '--shot', String(shot), '--reference', path.relative(ROOT, file),
          '--reference-sha256', candidate.sha256,
          '--editor', studioMotionEditor(),
        ], { session: owner, scenario: sc,
          cmd: ['python3', 'scripts/render-studio-shot.py'] });
        return json(res, 200, { ok: true, sequential: true, shot, job: snap(x) });
      }
      if (!Array.isArray(b.selections) || b.selections.length !== count) {
        return json(res, 400, { error: 'Choose one candidate for every shot.' });
      }
      const selections = new Map();
      for (const selection of b.selections) {
        if (!Number.isInteger(selection.shot) || selection.shot < 1 || selection.shot > count ||
            !Number.isInteger(selection.candidate) || selection.candidate < 1 || selections.has(selection.shot)) {
          return json(res, 400, { error: 'Frame selections are invalid.' });
        }
        selections.set(selection.shot, selection.candidate);
      }
      const frames = [];
      for (let shot = 1; shot <= count; shot += 1) {
        const predecessor = sequence.endFrames.find((frame) => frame.shot === shot - 1);
        if (sequence.chainSourceHashes?.[shot] && sequence.chainSourceHashes[shot] !== predecessor?.endFrameSha256) {
          return json(res, 409, { error: 'The preceding take changed. Regenerate this frame before approval.' });
        }
        const entry = data.frames.find((item) => item.shot === shot);
        const candidate = entry?.candidates.find((item) => item.candidate === selections.get(shot));
        if (!candidate) return json(res, 409, { error: `No selected candidate is available for shot ${shot}.` });
        const file = fs.realpathSync(path.resolve(workRoot, candidate.file));
        if (!file.startsWith(workRoot + path.sep) ||
            crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== candidate.sha256) {
          return json(res, 409, { error: `The selected candidate for shot ${shot} changed.` });
        }
        frames.push({ shot, file: path.relative(workRoot, file), sha256: candidate.sha256 });
      }
      const story = path.join(ROOT, sc);
      const scenarioSha256 = crypto.createHash('sha256').update(fs.readFileSync(story)).digest('hex');
      const reviewed = { schemaVersion: 1, scenarioSha256,
        referenceManifestSha256: readReferenceManifest(sc).sha256,
        reviewMethod: 'human',
        reviewedBy: me.name, reviewedAt: new Date().toISOString(), frames };
      const target = path.join(ROOT, work, 'first-frames.json');
      const temporary = target + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(reviewed, null, 2) + '\n');
      fs.renameSync(temporary, target);
      ledger({ type: 'frame-approval', user: me.name, session: owner.id, scenario: sc,
        frames: frames.map((frame) => ({ shot: frame.shot, sha256: frame.sha256 })) });
      return json(res, 200, { ok: true, ...frameManifest(sc) });
    } catch (error) {
      return json(res, 409, { error: error.message || 'Could not approve these frames.' });
    }
  }
  if (url.pathname === '/api/sequence/motion-review' && ['GET', 'POST'].includes(req.method)) {
    const input = req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams);
    const owner = sessions.get(String(input.sessionId));
    if (!owner || !canSee(me, owner)) return json(res, 404, { error: 'Unknown session.' });
    if (owner.kind !== 'sequence-motion' || owner.status !== 'done' || owner.sequence?.stage !== 'motion') {
      return json(res, 409, { error: 'There is no current motion take to review.' });
    }
    const shot = owner.sequence.currentShot;
    try {
      const result = sequenceMotionResult(owner.scenario, owner.sequence, shot, true, owner.options);
      const work = path.join('storage', 'any-local', path.basename(owner.scenario, '.json'));
      const segments = (result.segments?.length ? result.segments :
        [{ part: result.parts ?? null, clip: result.clip, sha256: result.clipSha256 }])
        .map((segment) => ({ ...segment, clip: path.join(work, segment.clip) }));
      if (req.method === 'GET') {
        const context = takeContext(owner, shot);
        const state = availableTakes(context.work, shot, context.expected);
        const takeScreen = summarizeTakeScreens(state.completed);
        return json(res, 200, { take: result.take, parts: result.parts, segments, takeScreen });
      }
      const reviewed = segments.find((segment) => segment.part === input.part && segment.sha256 === input.sha256);
      if (!reviewed) return json(res, 409, { error: 'The take changed. Reload it before saving.' });
      const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
      const seconds = input.seconds;
      const ratings = input.ratings;
      const dimensions = ['identity', 'action', 'realism'];
      if (!ratings || !dimensions.every((key) => Number.isInteger(ratings[key]) &&
          ratings[key] >= 1 && ratings[key] <= 5) ||
          !['identity-drift', 'missed-action', 'unnatural-motion', 'holds-up'].includes(input.outcome) ||
          !Number.isFinite(seconds) || seconds < 0 || seconds > 60 || notes.length > 1000) {
        return json(res, 400, { error: 'Choose a finding and rate identity, action, and realism from 1 to 5.' });
      }
      if (!ledger({ type: 'motion-take-review', user: me.name, reviewerRole: authOn() ? me.role : null,
        session: owner.id, scenario: owner.scenario, look: owner.options?.look,
        shot, take: result.take, part: reviewed.part, clip: reviewed.clip, clipSha256: reviewed.sha256,
        seconds, outcome: input.outcome, notes, ratings: Object.fromEntries(dimensions.map((key) => [key, ratings[key]])) })) {
        return json(res, 500, { error: 'Could not save the motion review.' });
      }
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 409, { error: error.message }); }
  }
  if ((url.pathname === '/api/sequence/next' || url.pathname === '/api/sequence/retry') && req.method === 'POST') {
    const b = await body(req);
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    const sc = String(b.scenario || '');
    if (!owner || !canSee(me, owner) || !mayUse(me, sc) || owner.scenario !== sc ||
        !/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc)) {
      return json(res, 403, { error: 'That sequential render does not belong to this session.' });
    }
    const sequence = owner.sequence;
    if (!sequence?.active || sequence.stage !== 'motion' || owner.kind !== 'sequence-motion') {
      return json(res, 409, { error: 'There is no completed sequential shot to continue.' });
    }
    const why = busyReason();
    if (why) return json(res, 409, { error: why });
    if (url.pathname === '/api/sequence/retry') {
      const selectingTake = owner.status === 'done' && b.motionTake === true && !owner.options?.unattended;
      if (!['failed', 'cancelled', 'interrupted'].includes(owner.status) &&
          !(owner.status === 'done' && sequence.continuationError) && !selectingTake) {
        return json(res, 409, { error: 'Only a failed or stopped shot motion can be retried.' });
      }
      const shot = sequence.currentShot;
      const approved = sequence.approvedFrames.find((frame) => frame.shot === shot);
      if (!approved) return json(res, 409, { error: `The approved first frame for shot ${shot} is missing.` });
      const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(sc, '.json'));
      const reference = path.resolve(workRoot, approved.file);
      if (!reference.startsWith(workRoot + path.sep) || !fs.existsSync(reference) ||
          crypto.createHash('sha256').update(fs.readFileSync(reference)).digest('hex') !== approved.sha256) {
        return json(res, 409, { error: `The approved first frame for shot ${shot} changed.` });
      }
      const batchTakes = selectingTake && b.batchTakes === true && b.take === undefined;
      let request;
      try {
        if (selectingTake) {
          const { work, expected } = takeContext(owner, shot);
          const state = availableTakes(work, shot, expected);
          request = { ...reserveTake(state, b.take), shot, select: !batchTakes || !state.completed[state.current] };
        }
      } catch (error) { return json(res, 409, { error: error.message }); }
      delete sequence.continuationError;
      delete sequence.takeError;
      const args = [
        '--scenario', sc, '--scenario-sha256', approved.scenarioSha256,
        '--shot', String(shot), '--reference', path.relative(ROOT, reference),
        '--reference-sha256', approved.sha256,
        '--editor', studioMotionEditor(),
        ...(request?.cacheOnly ? ['--cache-only'] : []),
        ...(batchTakes ? ['--technical-screen'] : []),
      ];
      const retried = start('sequence-motion', args, { session: owner, scenario: sc,
        takeRequest: request, ...(batchTakes ? { batchArgs: args } : {}),
        cmd: ['python3', 'scripts/render-studio-shot.py'] });
      return json(res, 202, snap(retried));
    }
    if (owner.status !== 'done') return json(res, 409, { error: 'Wait for the current shot motion to finish.' });
    try {
      if (sequence.referenceFramesSha256 !== referenceIdentity(sc)) {
        return json(res, 409, { error: 'Reference images changed during sequential review. Restart frame review.' });
      }
      const shot = sequence.currentShot;
      const result = sequenceMotionResult(sc, sequence, shot, false, owner.options);
      delete sequence.continuationError;
      sequence.endFrames = sequence.endFrames.filter((frame) => frame.shot !== shot);
      sequence.endFrames.push(result);
      sequence.endFrames.sort((a, b) => a.shot - b.shot);
      if (shot >= sequence.shotCount) {
        sequence.stage = 'ready';
        sequence.active = false;
        persist(owner);
        emit();
        return json(res, 200, { ok: true, ready: true, job: snap(owner) });
      }
      const nextShot = shot + 1;
      sequence.chainSourceHashes = { ...sequence.chainSourceHashes, [nextShot]: result.endFrameSha256 };
      const workRoot = path.resolve(ROOT, 'storage', 'any-local', path.basename(sc, '.json'));
      const endFrame = path.resolve(workRoot, result.endFrame);
      const args = ['--scenario', sc, '--stills-only', '--best-of-3-stills',
        '--allow-pending-visual-review', '--shot-only', String(nextShot),
        '--chain-source', path.relative(ROOT, endFrame),
        '--chain-source-sha256', result.endFrameSha256];
      args.push(...(owner.options?.continuityAnchor === 'previous-end'
        ? ['--chain-images'] : ['--anchor-image', sequenceIdentityReference(sc, sequence)]));
      if (owner.options?.allowRepeat) args.push('--allow-repeat');
      sequence.currentShot = nextShot;
      sequence.stage = 'review';
      const next = start('stills', args, { session: owner, scenario: sc, sequence });
      return json(res, 202, snap(next));
    } catch (error) {
      sequence.continuationError = error.message || 'Could not verify the shot motion final frame.';
      persist(owner);
      emit();
      return json(res, 409, { error: sequence.continuationError });
    }
  }
  if (url.pathname === '/api/render' && req.method === 'POST') {
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!isOwner && (!owner || !canSee(me, owner) || !mayUse(me, sc))) return json(res, 403, { error: 'That video belongs to someone else.' });
    if (!isOwner && today(me, 'render') >= me.dailyRenders) return json(res, 429, { error: `That is today's limit of ${me.dailyRenders} videos. Try again tomorrow.` });
    if (owner?.sequence && owner.sequence.stage !== 'ready') {
      return json(res, 409, { error: 'Approve and render every shot in the sequential review before assembling the final video.' });
    }
    try { frameManifest(sc); } catch (error) { return json(res, 409, { error: error.message }); }
    let motionTake = null;
    if (b.retakeMotion !== undefined) { // "Another take": same approved first frame, new motion seed; other shots' cached clips are reused
      const shot = Number(b.retakeMotion);
      let shotCount = 0;
      try { shotCount = JSON.parse(fs.readFileSync(path.join(ROOT, sc), 'utf8').replace(/^\uFEFF/, '')).plan.shots.length; } catch { /* reported below */ }
      if (!owner || !Number.isInteger(shot) || shot < 1 || shot > shotCount) return json(res, 400, { error: 'Choose a shot from this video to retake.' });
      if ((owner.options?.chain || owner.sequence?.stage === 'ready') && shot < shotCount) {
        return json(res, 409, { error: `This video builds each shot from the end of the one before it, so a new take of shot ${shot} would redo every later shot. Retake the last shot, or re-render the video.` });
      }
      if (owner.scenario !== sc) return json(res, 409, { error: 'That take belongs to a different scenario.' });
      try {
        const { work, expected } = takeContext(owner, shot);
        motionTake = { ...reserveTake(availableTakes(work, shot, expected), b.take), shot, select: true };
      } catch (error) { return json(res, 409, { error: error.message }); }

    }
    const x = start('render', ['--scenario', sc, ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : []),
      ...(owner?.options?.chain || owner?.sequence?.stage === 'ready' ? ['--chain-images'] : []),
      ...(motionTake?.cacheOnly ? ['--cache-only'] : [])],
    owner ? { session: owner, scenario: sc, pinFrames: true, takeRequest: motionTake } : { scenario: sc, pinFrames: true, user: me.name, prompt: 'Render ' + sc.split('/').pop() });
    return json(res, 202, motionTake ? { ...snap(x), motionTake } : snap(x));
  }
  if (url.pathname === '/api/cancel' && req.method === 'POST') {
    if (job && job.status === 'running' && canSee(me, job)) {
      const stopping = job;
      const pid = stopping.proc?.pid;
      stopping.status = 'stopping';
      if (pid) {
        try { process.kill(-pid, 'SIGTERM'); } catch { /* already exited */ }
        stopping.stopTimeout = setTimeout(() => {
          if (stopping.status !== 'stopping') return;
          try { process.kill(-pid, 'SIGKILL'); } catch { /* already exited */ }
        }, 5000).unref();
      }
      persist(stopping);
      emit();
    }
    return json(res, 200, view(me));
  }
  if (url.pathname === '/api/sessions' && req.method === 'GET') {
    return json(res, 200, [...sessions.values()].filter((x) => canSee(me, x)).map(summary).sort((p, q) => q.updatedAt - p.updatedAt));
  }
  const one = url.pathname.match(/^\/api\/sessions\/(\d{10,16})$/);
  if (one && req.method === 'GET') { const x = sessions.get(one[1]); return x && canSee(me, x) ? json(res, 200, snap(x)) : json(res, 404, { error: 'Unknown session' }); }
  if (url.pathname === '/api/artifacts' && req.method === 'GET') {
    const session = sessions.get(String(url.searchParams.get('sessionId') || ''));
    if (!session || !canSee(me, session)) return json(res, 404, { error: 'Unknown export.' });
    return json(res, 200, { artifacts: exportArtifacts(session) });
  }
  if (url.pathname === '/api/sessions/rename' && req.method === 'POST') {
    const b = await body(req); const x = sessions.get(String(b.id)); const name = String(b.name || '').trim().slice(0, 80);
    if (!x || !name || !canSee(me, x)) return json(res, 400, { error: 'Need an existing session and a name.' });
    x.name = name; persist(x, false); return json(res, 200, summary(x));
  }
  if (url.pathname === '/api/sessions/delete' && req.method === 'POST') {
    const b = await body(req); const id = String(b.id); const x = sessions.get(id);
    if (!x || !ID_RE.test(id) || !canSee(me, x)) return json(res, 404, { error: 'Unknown session' });
    if (['running', 'stopping'].includes(x.status)) return json(res, 409, { error: 'Stop this job before deleting it.' });
    sessions.delete(id); if (job === x) job = null;
    try { fs.unlinkSync(path.join(SESS_DIR, id + '.json')); } catch { /* already gone */ } // media and drafts are never touched
    emit(); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/live-files') { // stills and clips made so far for the scenario being rendered
    const sc = String(url.searchParams.get('scenario') || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc)) return json(res, 400, { error: 'Unknown plan.' });
    if (!isOwner && !mayUse(me, sc)) return json(res, 403, { error: 'Not yours.' });
    const work = path.join('storage', 'any-local', path.basename(sc, '.json'));
    const list = (sub, re) => { try { return fs.readdirSync(path.join(ROOT, work, sub)).filter((n) => re.test(n)).map((n) => ({ n, shot: Number(n.match(re)[1]) + 1, p: path.join(work, sub, n), t: fs.statSync(path.join(ROOT, work, sub, n)).mtimeMs })).sort((x, y) => x.shot - y.shot || x.t - y.t); } catch { return []; } };
    let approved = null;
    try { approved = frameManifest(sc); } catch { /* first frames still pending or changed */ }
    let referenceFrames = [];
    try { referenceFrames = readReferenceManifest(sc).references; } catch { /* stale or invalid references are reported by frame review */ }
    const latestPreviewRun = [...sessions.values()]
      .filter((session) => session.scenario === sc && session.kind === 'stills')
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
    let pendingFrames = [];
    let pendingFramesError = null;
    try {
      const pending = pendingFrameManifest(sc);
      pendingFrames = pending.data.frames.map((frame) => ({
        shot: frame.shot,
        selectedCandidate: frame.candidates.find((candidate) =>
          path.relative(pending.workRoot, path.resolve(pending.workRoot, candidate.file)) === frame.selectedFile)?.candidate,
        candidates: frame.candidates.map((candidate) => {
          const file = fs.realpathSync(path.resolve(pending.workRoot, candidate.file));
          return { candidate: candidate.candidate, p: path.relative(ROOT, file),
            t: fs.statSync(file).mtimeMs, status: candidate.status, reason: candidate.reason || '' };
        }),
      }));
    } catch (error) {
      if (error.code !== 'ENOENT') pendingFramesError = error.message;
    }
    const projectId = url.searchParams.get('sessionId');
    const project = projectId ? sessions.get(projectId) :
      [...sessions.values()].filter((item) => item.scenario === sc && canSee(me, item))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (projectId && (!project || project.scenario !== sc || !canSee(me, project))) {
      return json(res, 404, { error: 'Unknown project for this motion preview.' });
    }
    const takes = {}, selectedClips = [];
    if (project) {
      try {
        const context = takeContext(project);
        const stored = motionState(context.work);
        for (let shot = 1; shot <= context.shotCount; shot += 1) {
          let state;
          try { state = availableTakes(context.work, shot, takeContext(project, shot).expected, stored); }
          catch { continue; }
          takes[shot - 1] = { current: state.current, completed: Object.keys(state.completed).map(Number).sort((a, b) => a - b) };
          const selected = state.completed[state.current];
          if (!selected) continue;
          for (const [index, segment] of selected.segments.entries()) {
            selectedClips.push({ shot, take: state.current, part: index + 1, p: path.join(work, segment.clip), sha256: segment.sha256 });
          }
        }
      } catch { /* legacy or incomplete project has no verified previews yet */ }
    }
    return json(res, 200, {
      stills: approved?.stills || previewFrames(sc, latestPreviewRun?.startedAt || 0),
      referenceFrames,
      pendingFrames, pendingFramesError,
      needsHumanReview: !approved && pendingFrames.length > 0,
      progressClips: list('motion', /^shot-(\d+)-part-\d+-[0-9a-f]+\.mp4$/).map(({ n, shot, t }) => ({ n, shot, t })),
      takes, selectedClips,
    });
  }
  if (url.pathname === '/api/learning') { const l = learning(me); if (!isOwner) l.recentNotes = []; return json(res, 200, l); }
  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    const b = await body(req); const sess = ID_RE.test(String(b.id)) ? sessions.get(String(b.id)) : null;
    if (!sess || !canSee(me, sess) || !['up', 'down'].includes(b.rating)) return json(res, 400, { error: 'Unknown chat or rating.' });
    if (!sess.video || (b.video && b.video !== sess.video)) return json(res, 409, { error: 'Reload the export before rating.' });
    const videoFile = path.resolve(ROOT, sess.video);
    if (!videoFile.startsWith(path.resolve(ROOT, 'outputs') + path.sep) || !fs.existsSync(videoFile)) return json(res, 409, { error: 'The export is no longer available for review.' });
    const videoSha256 = await fileHash(videoFile);
    if (!ledger({ type: 'feedback', user: me.name, session: sess.id, rating: b.rating, note: String(b.note || '').slice(0, 400), look: sess.options?.look, prompt: sess.prompt, scenario: sess.scenario, video: sess.video, videoSha256, evidenceType: 'creator-feedback' })) return json(res, 500, { error: 'Could not save feedback.' });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/checkpoint-review') {
    if (req.method === 'GET') {
      const session = sessions.get(String(url.searchParams.get('sessionId') || ''));
      if (!session || !canSee(me, session)) return json(res, 404, { error: 'Unknown export.' });
      try { return json(res, 200, await checkpointReviewState(session, me, null)); }
      catch (error) { return json(res, 200, { available: false, reason: error.message }); }
    }
    if (req.method === 'POST') {
      const b = await body(req);
      const session = ID_RE.test(String(b.sessionId || '')) ? sessions.get(String(b.sessionId)) : null;
      if (!session || !canSee(me, session)) return json(res, 404, { error: 'Unknown export.' });
      try { return json(res, 200, await checkpointReviewState(session, me, b)); }
      catch (error) {
        const status = /stale|older export|Run a fresh checkpoint|storyboard is unavailable/i.test(error.message) ? 409 : 400;
        return json(res, status, { error: error.message || 'Could not save this checkpoint review.' });
      }
    }
  }
  if (url.pathname === '/api/comparison-feedback' && req.method === 'POST') {
    if (!isOwner) return json(res, 403, { error: 'Only the owner can save comparison feedback.' });
    const b = await body(req);
    if (!b.baseline || !b.candidate || b.baseline === b.candidate) return json(res, 400, { error: 'Choose two different videos.' });
    try {
      const entry = await saveComparisonFeedback({ baseline: b.baseline, candidate: b.candidate,
        reviewer: me.name, notes: b.notes });
      return json(res, 200, { ok: true, outcome: entry.outcome, recordId: entry.id,
        message: 'Saved to Creative Learning as human feedback. It will not change production defaults.' });
    } catch (error) { return json(res, 422, { error: error.message || 'Could not save comparison feedback.' }); }
  }
  if (url.pathname === '/api/prereview') { // advisory checks on the finished video; shots that barely move can be retaken
    const x = sessions.get(String(url.searchParams.get('id') || ''));
    if (!x || !x.scenario || !canSee(me, x)) return json(res, 404, {});
    const expected = url.searchParams.get('video');
    if (expected && expected !== x.video) return json(res, 409, { status: 'stale', weak: [] });
    if (!x.video) return json(res, 200, { status: x.status === 'running' ? 'pending' : 'unavailable', weak: [] });
    try {
      const report = await inspectExport(ROOT, x.video, { running: x.status === 'running' });
      if (expected && expected !== x.video) return json(res, 409, { status: 'stale', weak: [] });
      return json(res, 200, report);
    } catch {
      return json(res, 200, { video: x.video, status: 'unavailable', weak: [] });
    }
  }
  if (url.pathname === '/api/videos') { // finished videos for the compare view, newest first
    let out = [];
    try { out = fs.readdirSync(path.join(ROOT, 'outputs')).filter((n) => n.endsWith('.mp4')).map((n) => ({ n, p: 'outputs/' + n, t: fs.statSync(path.join(ROOT, 'outputs', n)).mtimeMs })).sort((x, y) => y.t - x.t).filter((v) => isOwner || mayUse(me, v.n)).slice(0, 60); } catch { /* no outputs yet */ }
    return json(res, 200, out);
  }
  if (url.pathname === '/media' && !isOwner && !mayUse(me, url.searchParams.get('p') || '')) return json(res, 403, { error: 'Not yours.' });
  if (url.pathname === '/media') return serveFile(req, res, path.join(ROOT, url.searchParams.get('p') || ''), MEDIA_ROOTS);
  // Static React build
  if (fs.existsSync(DIST)) {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(DIST, rel);
    return serveFile(req, res, fs.existsSync(file) ? file : path.join(DIST, 'index.html'), [DIST]);
  }
  json(res, 200, { message: 'API is up. Build the UI: cd studio && npm install && npm run build' });
}).listen(PORT, '127.0.0.1', () => console.log(`Studio API on http://127.0.0.1:${PORT}`));
