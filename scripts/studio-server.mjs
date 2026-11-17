#!/usr/bin/env node
// Local web studio backend. Dependency-free. Binds 127.0.0.1 only.
// POST /api/draft  {prompt, seconds, orientation, audio}  -> story plan (no media generated)
// POST /api/render {scenario}                              -> full local render
// GET  /api/events (SSE) | /api/state | POST /api/cancel | GET /media?p=outputs/x.mp4
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.STUDIO_PORT || 8787);
const DIST = path.join(ROOT, 'studio', 'dist');
const MEDIA_ROOTS = ['outputs', 'storage/any-local', 'storage/benchmarks', 'drafts/generated'].map((d) => path.join(ROOT, d));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

const SESS_DIR = path.join(ROOT, 'storage', 'studio-sessions');
fs.mkdirSync(SESS_DIR, { recursive: true });
const ID_RE = /^\d{10,16}$/;
const sessions = new Map(); // id -> session (see snap())
for (const f of fs.readdirSync(SESS_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const x = JSON.parse(fs.readFileSync(path.join(SESS_DIR, f), 'utf8'));
    if (!ID_RE.test(String(x.id))) continue;
    if (['running', 'stopping'].includes(x.status)) { x.status = 'interrupted'; x.error = 'The studio was restarted while this was running. Check the log, then run it again.'; }
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

const snap = (x = job) => x && { id: x.id, user: x.user, name: x.name, prompt: x.prompt, options: x.options, createdAt: x.createdAt, updatedAt: x.updatedAt, kind: x.kind, status: x.status, startedAt: x.startedAt, steps: x.steps, lines: x.lines.slice(-200), scenario: x.scenario, plan: x.plan, video: x.video, previousVideo: x.previousVideo, technicalQa: x.technicalQa, error: x.error };
const persist = (x, touch = true) => { if (touch) x.updatedAt = Date.now(); x.lastSave = Date.now(); try { fs.writeFileSync(path.join(SESS_DIR, x.id + '.json'), JSON.stringify(snap(x))); } catch { /* disk issue: keep running */ } };
const summary = (x) => ({ id: x.id, name: x.name, prompt: x.prompt, createdAt: x.createdAt, updatedAt: x.updatedAt, status: x.status, kind: x.kind, hasVideo: Boolean(x.video || x.previousVideo) });
const canSee = (user, x) => !x || !user || user.role === 'owner' || x.user === user.name;
const view = (user, x = job) => !x ? { status: 'idle' } : canSee(user, x) ? snap(x)
  : { id: 'other', name: 'Another video', prompt: '', options: {}, status: x.status, kind: x.kind, startedAt: x.startedAt, steps: [], lines: [], busyElsewhere: true };
const emit = () => { for (const c of clients) c.write(`data: ${JSON.stringify(view(c.user))}\n\n`); };

function busyReason() {
  if (job && ['running', 'stopping'].includes(job.status)) return 'A studio job is already running.';
  try {
    const out = execFileSync('pgrep', ['-fl', 'run-food-motion-baseline|ltx-2-mlx|create-flux-image|make-local-video'], { encoding: 'utf8' });
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


function frameManifest(scenario) {
  const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, work, 'first-frames.json'), 'utf8'));
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const story = path.join(ROOT, scenario);
  const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
  if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) || data.frames?.length !== count) throw new Error('Review fresh first frames for this story.');
  const stills = data.frames.map((frame, index) => {
    const file = path.resolve(ROOT, work, frame.file);
    if (frame.shot !== index + 1 || !file.startsWith(path.resolve(ROOT, work) + path.sep) || hash(file) !== frame.sha256) throw new Error('A first frame changed. Make first frames again.');
    return { shot: frame.shot, p: path.relative(ROOT, file), t: fs.statSync(file).mtimeMs, n: path.basename(file) };
  });
  return { stills };
}

function start(kind, args, extra = {}) {
  const startedAt = Date.now();
  let x = extra.session;
  if (!x) {
    x = { id: String(startedAt), user: extra.user, name: (extra.prompt || 'New video').slice(0, 48), prompt: extra.prompt || '', options: extra.options || {}, createdAt: startedAt, plan: null, scenario: null, video: null };
    sessions.set(x.id, x);
  }
  Object.assign(x, { kind, status: 'running', startedAt, steps: [], lines: [], error: null, timedOut: false });
  if (kind === 'render' || kind === 'stills') { if (kind === 'render') {
      if (x.video && x.technicalQa?.status === 'passed') x.previousVideo = x.video;
      x.video = null;
      x.technicalQa = { status: 'pending' };
    } x.scenario = extra.scenario || x.scenario; } else { x.plan = null; x.scenario = null; }
  job = x;
  const proc = spawn(extra.cmd ? extra.cmd[0] : 'bash', extra.cmd ? [...extra.cmd.slice(1), ...args] : ['scripts/make-local-video.sh', ...args], { cwd: ROOT, detached: true, env: { ...process.env, PYTHONUNBUFFERED: '1', // the prompt gate scores food close-ups and a luxury-kitchen look; it does not apply to cartoon/custom looks
    ...(kind === 'render' && extra.pinFrames ? { SHORTS_STUDIO_PIN_FRAMES: '1' } : {}),
    ...(x.options && x.options.look && x.options.look !== 'food' ? { SHORTS_MIN_PROMPT_SCORE: '0' } : {}) } });
  x.proc = proc; // not serialised: snap() copies named fields only
  let lastActivityAt = Date.now();
  const draftTimeout = Number(process.env.STUDIO_DRAFT_TIMEOUT_MS || 900000);
  const draftIdleTimeout = Number(process.env.STUDIO_DRAFT_IDLE_TIMEOUT_MS || 300000);
  const watchdog = kind === 'draft' ? setInterval(() => {
    if (x.status !== 'running') return;
    if (Date.now() - startedAt < draftTimeout && Date.now() - lastActivityAt < draftIdleTimeout) return;
    x.timedOut = true;
    x.error = 'Planning timed out. Your idea is saved. Try a shorter, concrete action and ending.';
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
    buf += chunk.toString();
    const parts = buf.split(/\r|\n/); buf = parts.pop();
    for (const raw of parts) {
      const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      if (!line) continue;
      x.lines.push(line);
      const verified = /^Studio verified export: (outputs\/[^/\\]+\.mp4)$/.exec(line);
      if (verified) verifiedExport = verified[1];
      if (line.startsWith('Technical QA failed:')) failedQa = true;
      for (const [re, label] of STEP_RULES) if (!(kind === 'draft' && ['Finishing and exporting', 'Mixing sound', 'Recording narration', 'Generating stills', 'Generating motion clips'].includes(label)) && re.test(line)) { if (x.steps[x.steps.length - 1] !== label) x.steps.push(label); break; }
      const sc = line.match(/(drafts\/generated\/[^\s'"]+\.local-scenario\.json)/);
      if (sc) x.scenario = sc[1];
    }
    if (Date.now() - (x.lastSave || 0) > 5000) persist(x);
    if (job === x) emit();
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', (error) => { x.error = error.message; });
  proc.on('close', (code) => {
    clearInterval(watchdog);
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
    persist(x);
    logRun(x, code);
    if (job === x && extra.unattended && x.status === 'done' && ['draft', 'stills'].includes(kind)) {
      const blocked = x.lines.some((line) => /^(BLOCKED|NEEDS-CHOICE):/.test(line));
      if (!blocked && x.plan && x.scenario) {
        const args = ['--scenario', x.scenario];
        if (kind === 'draft') args.push('--stills-only');
        if (x.options.allowRepeat) args.push('--allow-repeat');
        if (x.options.chain) args.push('--chain-images');
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
function logRun(x, code) {
  const plan = x.plan?.plan || x.plan || {};
  const shots = plan.shots || [];
  const lines = x.lines || [];
  ledger({ type: 'run', user: x.user || 'owner', session: x.id, kind: x.kind, status: x.status, exitCode: code, prompt: x.prompt, look: x.options?.look, setting: x.options?.setting, ending: x.options?.ending, audio: x.options?.audio, seconds: x.options?.seconds,
    shots: shots.length, shotSeconds: shots.map((s) => s.seconds), title: plan.title, scenario: x.scenario, video: x.video,
    durationSec: Math.round((Date.now() - x.startedAt) / 1000),
    blocked: lines.filter((l) => /^BLOCKED/.test(l)).map((l) => l.slice(0, 160)), fixed: lines.filter((l) => /^Fixed automatically/.test(l)).map((l) => l.slice(21, 160)), tries: lines.filter((l) => /^Attempt \d+\/\d+/.test(l)).length || undefined, reviews: lines.filter((l) => /^REVIEW/.test(l)).length });
}
function learning() {
  const rows = readLedger();
  const runs = rows.filter((r) => r.type === 'run'); const fb = rows.filter((r) => r.type === 'feedback');
  const renders = runs.filter((r) => r.kind === 'render' && r.status === 'done' && r.shots > 0 && r.durationSec > 0);
  const per = renders.map((r) => (r.durationSec - 80) / r.shots).filter((v) => v > 120 && v < 600).sort((p, q) => p - q);
  const cycle = per.length >= 2 ? Math.round(per[Math.floor(per.length / 2)]) : null; // median seconds per shot from this Mac's own renders
  const blockers = {}; runs.forEach((r) => (r.blocked || []).filter((b) => !/provisional score/.test(b)).forEach((b) => { const k = b.replace(/^BLOCKED:\s*/, '').replace(/shot \d+: /, ''); blockers[k] = (blockers[k] || 0) + 1; }));
  const byLook = {}; fb.forEach((f) => { const k = f.look || 'unknown'; byLook[k] ||= { up: 0, down: 0 }; byLook[k][f.rating === 'up' ? 'up' : 'down']++; });
  return { drafts: runs.filter((r) => r.kind === 'draft').length, renders: renders.length, failed: runs.filter((r) => r.status === 'failed').length,
    calibration: { cycleSec: cycle, samples: per.length }, topBlockers: Object.entries(blockers).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
    ratings: byLook, recentNotes: fb.filter((f) => f.note).slice(-5).map((f) => ({ look: f.look, rating: f.rating, note: f.note })) };
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });

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
  for (const u of readUsers()) if (sameToken(candidate, u.token)) return { name: String(u.name).slice(0, 40), role: 'creator', dailyRenders: Number(u.dailyRenders) || 3 };
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
  if (url.pathname === '/api/state') return json(res, 200, view(me));
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(view(me))}\n\n`);
    res.user = me; clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/draft' && req.method === 'POST') {
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    if (!isOwner && today(me, 'draft') >= CREATOR_DAILY_DRAFTS) return json(res, 429, { error: `That is today's limit of ${CREATOR_DAILY_DRAFTS} new ideas. Try again tomorrow.` });
    const prompt = String(b.prompt || '').trim().slice(0, 600);
    if (b.unattended && !isOwner) return json(res, 403, { error: 'Only the owner can run unattended.' });
    if (!prompt) return json(res, 400, { error: 'Write a prompt first.' });
    // Split "A, then B" into first action (hook) and last action (ending) so the story audit can match both.
    const parts = prompt.split(/\s*(?:,\s*(?:and\s+)?then|\bthen\b|[,;.])\s*/i).map((x) => x.trim()).filter((x) => x.length > 3);
    if (!parts.length) parts.push(prompt);
    const LOOKS = {
      food: { style: 'luxury cinematic food film', set: 'dark luxury kitchen' },
      cartoon: { style: 'hand-drawn 2D cartoon animation, bold outlines, flat vibrant colors, expressive characters', set: 'a colourful storybook world that fits the story' },
      night: { style: 'hand-drawn 2D cartoon animation at night, deep navy blue sky and shadows with warm creamy ivory highlights, glowing cream lights, limited navy and cream palette, bold outlines', set: 'a moonlit navy-blue night scene with cream-coloured lights' },
      custom: { style: 'cinematic short film matching the idea', set: 'a setting that fits the idea' },
    };
    const look = LOOKS[b.look] ? b.look : 'food';
    const setting = String(b.setting || '').trim().slice(0, 200);
    const answers = { topic: prompt, style: LOOKS[look].style, set: setting || LOOKS[look].set, hook: parts[0], mustShow: prompt,
      ending: String(b.ending || '').trim().slice(0, 300) || (parts.length > 1 ? parts[parts.length - 1] : prompt), audio: ['asmr', 'voiced', 'auto'].includes(b.audio) ? b.audio : 'asmr',
      seconds: Math.min(isOwner ? 60 : CREATOR_MAX_SECONDS, Math.max(10, Number(b.seconds) || 10)), orientation: b.orientation === 'wide' ? 'wide' : 'vertical' };
    const f = path.join(ROOT, 'storage', 'studio-answers-' + Date.now() + '.json');
    fs.writeFileSync(f, JSON.stringify(answers, null, 1));
    const x = start('draft', ['--answers', path.relative(ROOT, f), ...(b.allowRepeat ? ['--allow-repeat'] : [])], { cmd: ['python3', 'scripts/studio-draft.py'], user: me.name, prompt, unattended: isOwner && b.unattended === true, options: { look, setting, seconds: answers.seconds, orientation: answers.orientation, audio: answers.audio, ending: String(b.ending || '').trim().slice(0, 300), allowRepeat: Boolean(b.allowRepeat), chain: look !== 'food', unattended: isOwner && b.unattended === true } });
    return json(res, 202, snap(x));
  }
  if ((url.pathname === '/api/stills' || url.pathname === '/api/regen') && req.method === 'POST') {
    // first-frame step: make only the stills (about 25 s each) so a bad frame is caught before 4.5 min of motion
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    if (!isOwner) { const o = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null; if (!o || !canSee(me, o) || !mayUse(me, sc)) return json(res, 403, { error: 'That video belongs to someone else.' }); }
    if (url.pathname === '/api/regen') {
      const shot = Number(b.shot);
      if (!Number.isInteger(shot) || shot < 1 || shot > 60) return json(res, 400, { error: 'Unknown shot.' });
      const refs = path.join(ROOT, 'storage', 'any-local', path.basename(sc, '.json'), 'refs'); fs.mkdirSync(refs, { recursive: true });
      const f = path.join(refs, 'seed-bumps.json'); let bumps = {}; try { bumps = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* none yet */ }
      bumps[String(shot - 1)] = (Number(bumps[String(shot - 1)]) || 0) + 1; fs.writeFileSync(f, JSON.stringify(bumps));
      ledger({ type: 'regenerate', user: me.name, session: b.sessionId, shot, scenario: sc });
    }
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!isOwner && (!owner || !canSee(me, owner) || !mayUse(me, sc))) return json(res, 403, { error: 'That video belongs to someone else.' });
    const x = start('stills', ['--scenario', sc, '--stills-only', ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : []), ...(owner?.options?.chain ? ['--chain-images'] : [])], owner ? { session: owner, scenario: sc } : { scenario: sc, user: me.name, prompt: 'First frames ' + sc.split('/').pop() });
    return json(res, 202, snap(x));
  }
  if (url.pathname === '/api/render' && req.method === 'POST') {
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    if (!isOwner && (!owner || !canSee(me, owner) || !mayUse(me, sc))) return json(res, 403, { error: 'That video belongs to someone else.' });
    if (!isOwner && today(me, 'render') >= me.dailyRenders) return json(res, 429, { error: `That is today's limit of ${me.dailyRenders} videos. Try again tomorrow.` });
    try { frameManifest(sc); } catch (error) { return json(res, 409, { error: error.message }); }
    const x = start('render', ['--scenario', sc, ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : []), ...(owner?.options?.chain ? ['--chain-images'] : [])], owner ? { session: owner, scenario: sc, pinFrames: true } : { scenario: sc, pinFrames: true, user: me.name, prompt: 'Render ' + sc.split('/').pop() });
    return json(res, 202, snap(x));
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
    return json(res, 200, { stills: approved?.stills || [], clips: list('motion', /^shot-(\d+)-part-\d+-[0-9a-f]+\.mp4$/) });
  }
  if (url.pathname === '/api/learning') { const l = learning(); if (!isOwner) l.recentNotes = []; return json(res, 200, l); }
  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    const b = await body(req); const sess = ID_RE.test(String(b.id)) ? sessions.get(String(b.id)) : null;
    if (!sess || !canSee(me, sess) || !['up', 'down'].includes(b.rating)) return json(res, 400, { error: 'Unknown chat or rating.' });
    if (!sess.video || (b.video && b.video !== sess.video)) return json(res, 409, { error: 'Reload the export before rating.' });
    if (!ledger({ type: 'feedback', user: me.name, session: sess.id, rating: b.rating, note: String(b.note || '').slice(0, 400), look: sess.options?.look, prompt: sess.prompt, video: sess.video, evidenceType: 'creator-feedback' })) return json(res, 500, { error: 'Could not save feedback.' });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/prereview') { // advisory checks on the finished video; shots that barely move can be retaken
    const x = sessions.get(String(url.searchParams.get('id') || ''));
    if (!x || !x.scenario || !canSee(me, x)) return json(res, 404, {});
    const key = keyOf(x.scenario); let best = null;
    try { for (const n of fs.readdirSync(path.join(ROOT, 'outputs'))) if (n.includes(key) && n.endsWith('.prereview.json')) { const t = fs.statSync(path.join(ROOT, 'outputs', n)).mtimeMs; if (!best || t > best.t) best = { n, t }; } } catch { /* none yet */ }
    if (!best) return json(res, 200, { weak: [] });
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs', best.n), 'utf8'));
      const MIN_MOTION = 2.0; // same threshold as scripts/prereview-local-video.py
      return json(res, 200, { shotMotion: r.shotMotion || [], weak: (r.shotMotion || []).map((v, i) => (v != null && v < MIN_MOTION ? i + 1 : 0)).filter(Boolean), flags: r.flags || {} });
    } catch { return json(res, 200, { weak: [] }); }
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
