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
    if (x.status === 'running') { x.status = 'interrupted'; x.error = 'The studio was restarted while this was running. Check the log, then run it again.'; }
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

const snap = (x = job) => x && { id: x.id, name: x.name, prompt: x.prompt, options: x.options, createdAt: x.createdAt, updatedAt: x.updatedAt, kind: x.kind, status: x.status, startedAt: x.startedAt, steps: x.steps, lines: x.lines.slice(-200), scenario: x.scenario, plan: x.plan, video: x.video, error: x.error };
const persist = (x, touch = true) => { if (touch) x.updatedAt = Date.now(); x.lastSave = Date.now(); try { fs.writeFileSync(path.join(SESS_DIR, x.id + '.json'), JSON.stringify(snap(x))); } catch { /* disk issue: keep running */ } };
const summary = (x) => ({ id: x.id, name: x.name, prompt: x.prompt, createdAt: x.createdAt, updatedAt: x.updatedAt, status: x.status, kind: x.kind, hasVideo: Boolean(x.video) });
const emit = () => { const d = `data: ${JSON.stringify(snap() || { status: 'idle' })}\n\n`; for (const c of clients) c.write(d); };

function busyReason() {
  if (job && job.status === 'running') return 'A studio job is already running.';
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

function start(kind, args, extra = {}) {
  const startedAt = Date.now();
  let x = extra.session;
  if (!x) {
    x = { id: String(startedAt), name: (extra.prompt || 'New video').slice(0, 48), prompt: extra.prompt || '', options: extra.options || {}, createdAt: startedAt, plan: null, scenario: null, video: null };
    sessions.set(x.id, x);
  }
  Object.assign(x, { kind, status: 'running', startedAt, steps: [], lines: [], error: null });
  if (kind === 'render' || kind === 'stills') { if (kind === 'render') x.video = null; x.scenario = extra.scenario || x.scenario; } else { x.plan = null; x.scenario = null; }
  job = x;
  const proc = spawn(extra.cmd ? extra.cmd[0] : 'bash', extra.cmd ? [...extra.cmd.slice(1), ...args] : ['scripts/make-local-video.sh', ...args], { cwd: ROOT, detached: true, env: { ...process.env, PYTHONUNBUFFERED: '1', // the prompt gate scores food close-ups and a luxury-kitchen look; it does not apply to cartoon/custom looks
    ...(x.options && x.options.look && x.options.look !== 'food' ? { SHORTS_MIN_PROMPT_SCORE: '0' } : {}) } });
  x.proc = proc; // not serialised: snap() copies named fields only
  let buf = '';
  const onData = (chunk) => {
    buf += chunk.toString();
    const parts = buf.split(/\r|\n/); buf = parts.pop();
    for (const raw of parts) {
      const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      if (!line) continue;
      x.lines.push(line);
      for (const [re, label] of STEP_RULES) if (re.test(line)) { if (x.steps[x.steps.length - 1] !== label) x.steps.push(label); break; }
      const sc = line.match(/(drafts\/generated\/[^\s'"]+\.local-scenario\.json)/);
      if (sc) x.scenario = sc[1];
    }
    if (Date.now() - (x.lastSave || 0) > 5000) persist(x);
    if (job === x) emit();
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('close', (code) => {
    if (x.status !== 'cancelled') {
      x.status = code === 0 ? 'done' : 'failed';
      if (code !== 0) x.error = `Exited with code ${code}. See the log below.`;
    }
    if (x.status !== 'cancelled' && kind === 'draft') {
      x.scenario ||= newest('drafts/generated', '.local-scenario.json', startedAt);
      if (x.scenario) { try { x.plan = JSON.parse(fs.readFileSync(path.join(ROOT, x.scenario), 'utf8')); } catch { /* keep raw log */ } }
    } else if (x.status !== 'cancelled' && kind === 'render') {
      x.video = newest('outputs', '.mp4', startedAt);
    }
    persist(x);
    logRun(x, code);
    if (job === x) emit();
  });
  persist(x);
  return x;
}

// ---- learning ledger: every run and every rating is appended to storage/studio-learning/runs.jsonl ----
const LEARN_DIR = path.join(ROOT, 'storage', 'studio-learning');
const LEDGER = path.join(LEARN_DIR, 'runs.jsonl');
function ledger(rec) { try { fs.mkdirSync(LEARN_DIR, { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n'); } catch { /* learning is best effort */ } }
function readLedger() { try { return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
function logRun(x, code) {
  const plan = x.plan?.plan || x.plan || {};
  const shots = plan.shots || [];
  const lines = x.lines || [];
  ledger({ type: 'run', session: x.id, kind: x.kind, status: x.status, exitCode: code, prompt: x.prompt, look: x.options?.look, setting: x.options?.setting, ending: x.options?.ending, audio: x.options?.audio, seconds: x.options?.seconds,
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
  const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const s = range[1] ? Number(range[1]) : 0; const e = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(real, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(real).pipe(res);
}

// Optional private remote access (for example `tailscale serve` in front of this server).
// STUDIO_ALLOWED_ORIGINS=https://mac.tailnet.ts.net  lets that exact page call the API.
// STUDIO_TOKEN=long-random-string  requires a cookie (set by opening /?token=...) on every request.
const EXTRA_ORIGINS = (process.env.STUDIO_ALLOWED_ORIGINS || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
const TOKEN = process.env.STUDIO_TOKEN || '';
function tokenOk(candidate) {
  const a = Buffer.from(String(candidate || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Block cross-site requests: only same-origin pages on this host may call the API.
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) && !EXTRA_ORIGINS.includes(origin)) return json(res, 403, { error: 'Bad origin' });
  if (TOKEN) {
    const cookie = /(?:^|;\s*)studio_token=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const given = url.searchParams.get('token');
    if (given && tokenOk(given)) {
      res.writeHead(302, { 'Set-Cookie': `studio_token=${encodeURIComponent(given)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, Location: url.pathname });
      return res.end();
    }
    let decoded = '';
    try { decoded = decodeURIComponent(cookie || ''); } catch { /* malformed cookie is unauthorized */ }
    if (!tokenOk(decoded)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      return res.end('Studio is locked. Open it once with ?token=YOUR_TOKEN.');
    }
  }
  if (url.pathname === '/api/state') return json(res, 200, snap() || { status: 'idle' });
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(snap() || { status: 'idle' })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/draft' && req.method === 'POST') {
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const prompt = String(b.prompt || '').trim().slice(0, 600);
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
      seconds: Math.min(60, Math.max(10, Number(b.seconds) || 10)), orientation: b.orientation === 'wide' ? 'wide' : 'vertical' };
    const f = path.join(ROOT, 'storage', 'studio-answers-' + Date.now() + '.json');
    fs.writeFileSync(f, JSON.stringify(answers, null, 1));
    const x = start('draft', ['--answers', path.relative(ROOT, f), ...(b.allowRepeat ? ['--allow-repeat'] : [])], { cmd: ['python3', 'scripts/studio-draft.py'], prompt, options: { look, setting, seconds: answers.seconds, orientation: answers.orientation, audio: answers.audio, ending: String(b.ending || '').trim().slice(0, 300), allowRepeat: Boolean(b.allowRepeat) } });
    return json(res, 202, snap(x));
  }
  if ((url.pathname === '/api/stills' || url.pathname === '/api/regen') && req.method === 'POST') {
    // first-frame step: make only the stills (about 25 s each) so a bad frame is caught before 4.5 min of motion
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    if (url.pathname === '/api/regen') {
      const shot = Number(b.shot);
      if (!Number.isInteger(shot) || shot < 1 || shot > 60) return json(res, 400, { error: 'Unknown shot.' });
      const refs = path.join(ROOT, 'storage', 'any-local', path.basename(sc, '.json'), 'refs'); fs.mkdirSync(refs, { recursive: true });
      const f = path.join(refs, 'seed-bumps.json'); let bumps = {}; try { bumps = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* none yet */ }
      bumps[String(shot - 1)] = (Number(bumps[String(shot - 1)]) || 0) + 1; fs.writeFileSync(f, JSON.stringify(bumps));
      ledger({ type: 'regenerate', session: b.sessionId, shot, scenario: sc });
    }
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    const x = start('stills', ['--scenario', sc, '--stills-only', ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : [])], owner ? { session: owner, scenario: sc } : { scenario: sc, prompt: 'First frames ' + sc.split('/').pop() });
    return json(res, 202, snap(x));
  }
  if (url.pathname === '/api/render' && req.method === 'POST') {
    const b = await body(req); const why = busyReason();
    if (why) return json(res, 409, { error: why });
    const sc = String(b.scenario || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc) || !fs.existsSync(path.join(ROOT, sc))) return json(res, 400, { error: 'Unknown plan.' });
    const owner = ID_RE.test(String(b.sessionId)) ? sessions.get(String(b.sessionId)) : null;
    const x = start('render', ['--scenario', sc, ...(owner?.options?.allowRepeat ? ['--allow-repeat'] : [])], owner ? { session: owner, scenario: sc } : { scenario: sc, prompt: 'Render ' + sc.split('/').pop() });
    return json(res, 202, snap(x));
  }
  if (url.pathname === '/api/cancel' && req.method === 'POST') {
    if (job && job.status === 'running') { job.status = 'cancelled'; try { process.kill(-job.proc.pid, 'SIGTERM'); } catch { /* gone */ } persist(job); emit(); }
    return json(res, 200, snap() || { status: 'idle' });
  }
  if (url.pathname === '/api/sessions' && req.method === 'GET') {
    return json(res, 200, [...sessions.values()].map(summary).sort((p, q) => q.updatedAt - p.updatedAt));
  }
  const one = url.pathname.match(/^\/api\/sessions\/(\d{10,16})$/);
  if (one && req.method === 'GET') { const x = sessions.get(one[1]); return x ? json(res, 200, snap(x)) : json(res, 404, { error: 'Unknown session' }); }
  if (url.pathname === '/api/sessions/rename' && req.method === 'POST') {
    const b = await body(req); const x = sessions.get(String(b.id)); const name = String(b.name || '').trim().slice(0, 80);
    if (!x || !name) return json(res, 400, { error: 'Need an existing session and a name.' });
    x.name = name; persist(x, false); return json(res, 200, summary(x));
  }
  if (url.pathname === '/api/sessions/delete' && req.method === 'POST') {
    const b = await body(req); const id = String(b.id); const x = sessions.get(id);
    if (!x || !ID_RE.test(id)) return json(res, 404, { error: 'Unknown session' });
    if (x.status === 'running') return json(res, 409, { error: 'Stop this job before deleting it.' });
    sessions.delete(id); if (job === x) job = null;
    try { fs.unlinkSync(path.join(SESS_DIR, id + '.json')); } catch { /* already gone */ } // media and drafts are never touched
    emit(); return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/live-files') { // stills and clips made so far for the scenario being rendered
    const sc = String(url.searchParams.get('scenario') || '');
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(sc)) return json(res, 400, { error: 'Unknown plan.' });
    const work = path.join('storage', 'any-local', path.basename(sc, '.json'));
    const list = (sub, re) => { try { return fs.readdirSync(path.join(ROOT, work, sub)).filter((n) => re.test(n)).map((n) => ({ n, shot: Number(n.match(re)[1]) + 1, p: path.join(work, sub, n), t: fs.statSync(path.join(ROOT, work, sub, n)).mtimeMs })).sort((x, y) => x.shot - y.shot || x.t - y.t); } catch { return []; } };
    return json(res, 200, { stills: list('refs', /^shot-(\d+)-[0-9a-f]+\.png$/), clips: list('motion', /^shot-(\d+)-part-\d+-[0-9a-f]+\.mp4$/) });
  }
  if (url.pathname === '/api/learning') return json(res, 200, learning());
  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    const b = await body(req); const sess = ID_RE.test(String(b.id)) ? sessions.get(String(b.id)) : null;
    if (!sess || !['up', 'down'].includes(b.rating)) return json(res, 400, { error: 'Unknown chat or rating.' });
    ledger({ type: 'feedback', session: sess.id, rating: b.rating, note: String(b.note || '').slice(0, 400), look: sess.options?.look, prompt: sess.prompt, video: sess.video });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/videos') { // finished videos for the compare view, newest first
    let out = [];
    try { out = fs.readdirSync(path.join(ROOT, 'outputs')).filter((n) => n.endsWith('.mp4')).map((n) => ({ n, p: 'outputs/' + n, t: fs.statSync(path.join(ROOT, 'outputs', n)).mtimeMs })).sort((x, y) => y.t - x.t).slice(0, 60); } catch { /* no outputs yet */ }
    return json(res, 200, out);
  }
  if (url.pathname === '/media') return serveFile(req, res, path.join(ROOT, url.searchParams.get('p') || ''), MEDIA_ROOTS);
  // Static React build
  if (fs.existsSync(DIST)) {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(DIST, rel);
    return serveFile(req, res, fs.existsSync(file) ? file : path.join(DIST, 'index.html'), [DIST]);
  }
  json(res, 200, { message: 'API is up. Build the UI: cd studio && npm install && npm run build' });
}).listen(PORT, '127.0.0.1', () => console.log(`Studio API on http://127.0.0.1:${PORT}`));
