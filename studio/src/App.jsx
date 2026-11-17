import { useEffect, useRef, useState } from 'react';
import { LearnedCard, RenderTimer, IdeaHelper, Player, ComparePanel, FramesBlock, clipsOf, planEstimate, fmt, LookChips, DirectorsChair, guessResult, BlockedCard, StepTrack, UpNext, readQueue, writeQueue, StageBar, ShotPlan, ExportReview, jobState } from './extras.jsx';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  });

function useJob() {
  const [job, setJob] = useState({ status: 'idle' });
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => setJob(JSON.parse(e.data));
    return () => es.close();
  }, []);
  return job;
}

function useElapsed(job) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!job.startedAt) return '';
  const sec = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function progressOf(job) {
  const lines = job.lines || [];
  let best = null;
  for (const l of lines) {
    const m = l.match(/(?:beat|clip|shot|still)s?\s+(\d+)\s*\/\s*(\d+)/i) || l.match(/(\d+)\s*\/\s*(\d+)\b/);
    if (m && +m[2] > 0 && +m[1] <= +m[2]) best = { n: +m[1], of: +m[2], label: l.slice(0, 70) };
  }
  return best;
}

const dayLabel = (t) => {
  const d = new Date(t); const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

const THEMES = [['studio', 'Studio'], ['night', 'Night'], ['white', 'White']];

function Sidebar({ sessions, selectedId, liveId, onSelect, onNew, onRename, onDelete, open }) {
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const groups = [];
  for (const x of sessions) {
    const label = dayLabel(x.updatedAt);
    const g = groups.find((y) => y.label === label);
    if (g) g.items.push(x); else groups.push({ label, items: [x] });
  }
  const commit = (id) => { const n = draftName.trim(); if (n) onRename(id, n); setEditing(null); };
  return (
    <aside id="projects" className={open ? "side projects-open" : "side"} aria-label="Projects">
      <button className="primary newchat" onClick={onNew}>+ New project</button>
      <div className="sessions">
        {groups.length === 0 && <p className="muted pad">No projects yet. Your plans and videos will be listed here.</p>}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="day">{g.label}</div>
            {g.items.map((x) => (
              <div key={x.id} className={'sess' + (x.id === selectedId ? ' sel' : '')}>
                <span className={'dot ' + x.status} title={x.status} />
                {editing === x.id ? (
                  <input autoFocus onFocus={(e) => e.target.select()} value={draftName} onChange={(e) => setDraftName(e.target.value)} onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(x.id); if (e.key === 'Escape') setEditing(null); }} onBlur={() => commit(x.id)} />
                ) : (
                  <button className="name" aria-current={x.id === selectedId ? "true" : undefined} onClick={() => onSelect(x.id)}>{x.name}{x.hasVideo ? ' 🎬' : ''}</button>
                )}
                {editing !== x.id && (
                  <span className="acts" onClick={(e) => e.stopPropagation()}>
                    <button title="Rename" onClick={() => { setEditing(x.id); setDraftName(x.name); }}>✎</button>
                    {confirm === x.id ? (
                      <button className="danger" onClick={() => { setConfirm(null); onDelete(x.id); }} onMouseLeave={() => setConfirm(null)}>Delete?</button>
                    ) : (
                      <button title="Delete chat (keeps videos)" disabled={x.id === liveId && x.status === 'running'} onClick={() => setConfirm(x.id)}>🗑</button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function PlanCard({ job, idea, onStills, disabled, notes }) {
  const plan = job.plan?.plan || job.plan || {};
  const shots = plan.shots || [];
  const total = shots.reduce((n, s) => n + (s.seconds || 0), 0);
  return (
    <div className="card">
      <p className="muted">Your idea</p>
      <p>{idea || job.plan?.topic}</p>
      <h3>{plan.title || 'Story plan'}</h3>
      {plan.hook && <p><b>Hook:</b> {plan.hook}</p>}
      {plan.payoff && <p><b>Payoff:</b> {plan.payoff}</p>}
      <p className="muted">{shots.length} shots · {total}s · render estimate about {fmt(planEstimate(clipsOf(shots)).mid)} ({fmt(planEstimate(clipsOf(shots)).low)} to {fmt(planEstimate(clipsOf(shots)).high)}) if nothing is retried</p>
      <ShotPlan shots={shots} notes={notes} />
      {job.kind === 'draft' && job.status === 'done' && <button className="primary" onClick={onStills} disabled={disabled}>Make first frames</button>}
    </div>
  );
}

const TIPS = [
  'Tip: name who does what, then the ending. "A fox chases a paper boat, then sails away" plans far better than a mood.',
  'Tip: Look sets the style. Cartoon and Night cartoon skip the food-kitchen defaults.',
  'Tip: the first still decides the whole clip. If it looks wrong, Stop and re-plan; it saves minutes.',
  'Tip: 10 seconds is two or three shots. Keep one clear action per shot.',
  'Tip: the Setting box overrides the scene, e.g. "a rainy rooftop garden".',
];

function nowLine(lines) {
  const p = [...(lines || [])].reverse().find((l) => String(l).includes('[progress]'));
  if (!p) return 'Getting ready...';
  const m = String(p).split('[progress]')[1] || '';
  const parts = m.split('|').map((x) => x.trim());
  const clips = parts.find((x) => /motion clips/.test(x)) || '';
  const what = parts.find((x) => /rendering|still|FLUX|voice|sound|finish/i.test(x)) || parts[3] || '';
  const left = parts.find((x) => /remaining/.test(x)) || '';
  return [what, clips && 'done: ' + clips.replace(' motion clips', ' clips'), left].filter(Boolean).join(' · ');
}

function RenderLive({ job, plan, sessions }) {
  const [files, setFiles] = useState({ stills: [], clips: [] });
  const [tip, setTip] = useState(0);
  const sc = job.scenario;
  const running = job.status === 'running';
  useEffect(() => {
    if (!sc) return undefined;
    let stop = false;
    const load = () => fetch('/api/live-files?scenario=' + encodeURIComponent(sc)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !stop) setFiles(j); }).catch(() => {});
    load();
    if (!running) return () => { stop = true; };
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [sc, running]);
  useEffect(() => { if (!running) return undefined; const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 9000); return () => clearInterval(t); }, [running]);
  const shots = plan.shots || [];
  if ((job.kind !== 'render' && job.kind !== 'stills') || !shots.length) return null;
  const still = (n) => [...files.stills].reverse().find((f) => f.shot === n);
  const clip = (n) => [...files.clips].reverse().find((f) => f.shot === n);
  const url = (f) => '/media?p=' + encodeURIComponent(f.p) + '&v=' + Math.round(f.t);
  return (
    <div className="card live">
      <h3>{running ? 'Behind the scenes' : 'What was made'}</h3>
      {running && <p className="nowline">{nowLine(job.lines)}</p>}
      <div className="tiles">
        {shots.map((sh, i) => (
          <div className="tile" key={i}>
            {clip(i + 1) ? <video src={url(clip(i + 1))} autoPlay muted loop playsInline />
              : still(i + 1) ? <img className="develop" src={url(still(i + 1))} alt={'Shot ' + (i + 1)} />
              : <div className="ph">{running ? 'waiting...' : 'no file'}</div>}
            <div className="cap"><b>Shot {i + 1}</b> · {sh.seconds}s · {clip(i + 1) ? 'clip ready' : still(i + 1) ? 'first frame ready' : 'queued'}</div>
            {sh.sound && <div className="muted small">Sound: {sh.sound}</div>}
          </div>
        ))}
      </div>
      {running && <p className="muted tip">{TIPS[tip]}</p>}
      {running && <DirectorsChair job={job} plan={plan} stills={shots.map((_, i) => still(i + 1)).filter(Boolean)} clipsDone={files.clips.length} sessions={sessions} />}
      {!running && guessResult(job) && <p className="guessres">{guessResult(job)}</p>}
    </div>
  );
}

export default function App() {
  const live = useJob();
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('project'));
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [me, setMe] = useState(null);
  const submitting = useRef(false);
  const [sending, setSending] = useState(false);
  const restoreId = useRef(selectedId);
  const projectRequest = useRef(0);
  const pickProject = (id) => {
    setSelectedId(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set('project', id);
    else url.searchParams.delete('project');
    history.replaceState(null, '', url);
  };
  const [stored, setStored] = useState(null);
  const [sessions, setSessions] = useState([]);
  const job = selectedId == null ? { status: 'idle' } : selectedId === live.id ? live : stored?.id === selectedId ? stored : { status: 'idle' };
  const anyRunning = ['running', 'stopping'].includes(live.status);
  const maxSeconds = me?.maxSeconds ?? 60;
  const loadSessions = () => fetch('/api/sessions').then((r) => r.json()).then(setSessions).catch(() => {});
  useEffect(() => {
    loadSessions();
    fetch('/api/me').then((r) => r.ok ? r.json() : null).then(setMe).catch(() => {});
  }, [live.id, live.status]);
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState(10);
  const planDisabled = me?.draftsLeft === 0 || seconds > maxSeconds;
  const [orientation, setOrientation] = useState('vertical');
  const [audio, setAudio] = useState('asmr');
  const [ending, setEnding] = useState('');
  const [look, setLook] = useState('food');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('studio-theme') || 'studio'; } catch { return 'studio'; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('studio-theme', theme); } catch {} }, [theme]);
  const [setting, setSetting] = useState('');
  const [exampleContext, setExampleContext] = useState(false);
  const [exampleBusy, setExampleBusy] = useState(false);
  const [exampleInfo, setExampleInfo] = useState(null);
  const exampleRequest = useRef(0);
  const seenExamples = useRef([]);
  const briefRef = useRef(prompt);
  const lookRef = useRef(look);
  briefRef.current = prompt;
  lookRef.current = look;
  const suggestExample = async (selected) => {
    if (exampleBusy) return;
    const request = ++exampleRequest.current;
    const before = briefRef.current;
    setExampleBusy(true);
    setExampleInfo(null);
    try {
      const idea = await post('/api/idea', { look: selected.id, seconds, exclude: seenExamples.current });
      if (request !== exampleRequest.current || lookRef.current !== selected.id || briefRef.current !== before) return;
      seenExamples.current = [...seenExamples.current, idea.prompt].slice(-8);
      setPrompt(idea.prompt);
      setEnding(idea.ending);
      setSetting('');
      setExampleContext(true);
      setExampleInfo(idea);
    } catch (error) {
      if (request === exampleRequest.current) setErr(error.message);
    } finally {
      if (request === exampleRequest.current) setExampleBusy(false);
    }
  };
  const [unattended, setUnattended] = useState(false);
  const [auto, setAuto] = useState(false);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('studio-mode') || 'simple'; } catch { return 'simple'; } });
  useEffect(() => { try { localStorage.setItem('studio-mode', mode); } catch {} }, [mode]);
  const simple = mode === 'simple';
  const empty = job.status === 'idle' || !job.status;
  // Simple mode always runs the guided path: story, first frames, then it waits for your OK before the long render.
  const [autoNext, setAutoNext] = useState(false);
  const [pauseFrames, setPauseFrames] = useState(true);
  const autoOn = simple || auto; const pauseOn = simple || pauseFrames;
  const autoRef = useRef(false);
  const autoSeen = useRef('');
  const retake = useRef(false); // a retake of one weak shot re-renders by itself, even when Auto mode pauses at first frames
  const [review, setReview] = useState({ status: 'pending' });
  const weak = review.video === job.video ? review.weak || [] : [];
  const [compare, setCompare] = useState(false);
  const [err, setErr] = useState('');
  const [showLog, setShowLog] = useState(false);
  const endRef = useRef(null);
  const running = job.status === 'running' && job.id === live.id;
  const elapsed = useElapsed(job);
  const prog = progressOf(job);
  const prevStatus = useRef('idle');
  useEffect(() => {
    const icon = { running: '⏳', done: '✅', failed: '⚠️', cancelled: '⏹' }[job.status] || '';
    document.title = `${icon} iShorts`;
    if (prevStatus.current === 'running' && job.status === 'done') { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6); o.start(); o.stop(c.currentTime + 0.6); } catch { /* sound blocked */ } }
    if (prevStatus.current === 'running' && job.status !== 'running' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('iShorts', { body: job.status === 'done' ? (job.kind === 'render' ? 'Your video is ready.' : 'Your plan is ready to review.') : 'Job ' + job.status });
    }
    prevStatus.current = job.status;
  }, [job.status]);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job.lines?.length, showLog]);
  // A provisional QA score only means a human rating is pending; it is not a block.
  const notes = (job.lines || []).filter((l) => /^(BLOCKED|REVIEW|WARNING|Fixed automatically)/.test(l)).map((l) => (/^BLOCKED:.*provisional score/.test(l) ? 'REVIEW: waiting for your rating (thumbs up or down below)' : l));
  const blocked = notes.some((l) => l.startsWith('BLOCKED'));
  const busy = anyRunning || sending;
  const phase = jobState(job, blocked, live.busyElsewhere);
  const choice = ((job.lines || []).find((l) => l.startsWith('NEEDS-CHOICE: ')) || '').slice(14);

  // Auto mode: plan -> first frames -> (optional pause) -> render. Stops on any BLOCKED note or failure.
  useEffect(() => {
    if ((job.options?.unattended && !retake.current) || !autoRef.current || !['done', 'failed', 'cancelled'].includes(job.status)) return;
    const key = job.id + ':' + job.kind + ':' + job.status; if (autoSeen.current === key) return; autoSeen.current = key;
    if (job.status !== 'done' || blocked || !job.scenario) { autoRef.current = false; return; }
    const go = (url) => post(url, { scenario: job.scenario, sessionId: job.id }).then((r) => pickProject(r.id)).catch((e) => { autoRef.current = false; setErr(e.message); });
    if (job.kind === 'draft') go('/api/stills');
    else if (job.kind === 'stills') { if (pauseOn && !retake.current) autoRef.current = false; else { retake.current = false; go('/api/render'); } }
    else autoRef.current = false;
  }, [job.status, job.kind, job.id]);
  // Up next: when a job ends and Auto mode is not still chaining it, start the first queued idea.
  const nextSeen = useRef('');
  useEffect(() => {
    if (!autoNext || anyRunning || !job.status || job.status === 'idle') return;
    const key = job.id + ':' + job.kind + ':' + job.status; if (nextSeen.current === key) return; nextSeen.current = key;
    if (autoRef.current && job.status === 'done') return; // Auto mode will continue this video first
    const q = readQueue(); if (!q.length) return;
    const t = setTimeout(() => { writeQueue(q.slice(1)); setPrompt(q[0]); draftWith({ prompt: q[0] }); }, 1500);
    return () => clearTimeout(t);
  }, [job.status, job.kind, job.id, autoNext, anyRunning]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [job.steps?.length, job.status, job.video]);

  const run2 = (fn) => async (...a) => { setErr(''); try { await fn(...a); } catch (e) { setErr(e.message); } };
  const run = (fn) => async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSending(true);
    setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    finally { submitting.current = false; setSending(false); }
  };
  const draftWith = (extra = {}) => run(async () => {
    if (planDisabled) return;
    const runUnattended = me?.canRunUnattended && unattended;
    const r = await post('/api/draft', { prompt, seconds, orientation, audio, ending, look, setting, unattended: runUnattended, ...extra });
    autoRef.current = autoOn && !runUnattended; autoSeen.current = ''; pickProject(r.id); })();
  const draft = () => draftWith();
  const render = run(async () => { const r = await post('/api/render', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const stills = run(async () => { const r = await post('/api/stills', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const regen = (shot) => run(async () => { const r = await post('/api/regen', { scenario: job.scenario, sessionId: job.id, shot }); pickProject(r.id); })();
  const retakeShot = (shot) => run(async () => { retake.current = true; autoRef.current = true; autoSeen.current = ''; const r = await post('/api/regen', { scenario: job.scenario, sessionId: job.id, shot }); pickProject(r.id); })();
  useEffect(() => {
    let current = true;
    setReview({ video: job.video, status: 'pending' });
    if (!job.video || !job.id) return () => { current = false; };
    const params = new URLSearchParams({ id: job.id, video: job.video });
    fetch('/api/prereview?' + params).then(async (response) => {
      if (!response.ok) throw new Error('Review unavailable');
      return response.json();
    }).then((data) => {
      if (current) setReview({ ...data, video: job.video });
    }).catch(() => {
      if (current) setReview({ video: job.video, status: 'unavailable' });
    });
    return () => { current = false; };
  }, [job.id, job.status, job.video]);
  const cancel = run(async () => { await post('/api/cancel'); });
  const select = async (id) => {
    const request = ++projectRequest.current;
    setErr(''); pickProject(id); setProjectsOpen(false);
    const j = id === live.id ? live : await fetch('/api/sessions/' + id).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (request !== projectRequest.current) return;
    if (!j) { setErr('Could not load that project.'); return; }
    if (id !== live.id) setStored(j);
    setPrompt(j.prompt || ''); setSeconds(j.options?.seconds || 10); setOrientation(j.options?.orientation || 'vertical');
    setExampleContext(Boolean(j.options?.ending));
    setAudio(j.options?.audio || 'asmr'); setEnding(j.options?.ending || ''); setLook(j.options?.look || 'food'); setSetting(j.options?.setting || ''); setShowLog(false);
  };
  useEffect(() => { if (restoreId.current) select(restoreId.current); }, []);
  const newChat = () => { exampleRequest.current++; setExampleBusy(false); setExampleInfo(null); projectRequest.current++; pickProject(null); setProjectsOpen(false); setStored(null); setExampleContext(false); setPrompt(''); setEnding(''); setSetting(''); setErr(''); };
  const rename = run2(async (id, name) => { await post('/api/sessions/rename', { id, name }); await loadSessions(); });
  const remove = run2(async (id) => { await post('/api/sessions/delete', { id }); if (id === selectedId) newChat(); await loadSessions(); });
  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim() && !busy && !planDisabled) { e.preventDefault(); draft(); } };

  return (
    <div className="shell">
    <Sidebar open={projectsOpen} sessions={sessions} selectedId={selectedId} liveId={live.id} onSelect={select} onNew={newChat} onRename={rename} onDelete={remove} />
    <div className={empty ? "app create-home" : "app"}>
      <header>
        <button className="projects-toggle" aria-controls="projects" aria-expanded={projectsOpen} onClick={() => setProjectsOpen(!projectsOpen)}>Projects</button>
        <span className="logo"><img src="/logo.svg" alt="" className="logo-mark"/><span className="logo-word">i<b>Shorts</b></span></span>
        {me && <span className="muted account">{me.name === me.role ? me.role : `${me.name} · ${me.role}`}</span>}
        <details className="appearance">
          <summary>Appearance</summary>
          <div className="themes">{THEMES.map(([k, n]) => <button key={k} aria-pressed={theme === k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{n}</button>)}</div>
        </details>
      </header>
      <main>
        {compare && <ComparePanel onClose={() => setCompare(false)} />}
        {(job.status === 'idle' || !job.status) && (
          <div className="empty"><h1>What should we film?</h1><p className="muted">Describe what happens and how it ends. Review the first frames before rendering.</p>{!simple && <LearnedCard />}</div>
        )}
        {job.status && job.status !== 'idle' && (
          <>
            <div className="bubble user">{job.prompt || 'New video idea'}{job.kind === 'render' && <div className="muted">Rendering the approved plan</div>}</div>
            <div className="bubble bot">
              <StageBar job={job} />
              <p className={phase.k === 'blocked' || phase.k === 'failed' ? 'bad' : 'muted'} role="status">{phase.t}</p>
              <ul className="steps">
                {(job.steps || []).map((s, i) => (
                  <li key={s} className={i === job.steps.length - 1 && running ? 'now' : 'ok'}>{s}</li>
                ))}
                {running && !(job.steps || []).length && <li className="now">Starting</li>}
              </ul>
              {running && <p className="muted">Elapsed {elapsed}{prog ? ` · ${prog.n} of ${prog.of}` : ''}</p>}
              <StepTrack job={job} />
              {running && <div className="bar"><div className={prog ? 'fill' : 'fill indet'} style={prog ? { width: `${Math.round((prog.n / prog.of) * 100)}%` } : {}} /></div>}
              {running && job.lines?.length > 0 && <p className="muted">{job.lines[job.lines.length - 1]}</p>}
              {running && <button className="ghost" onClick={cancel}>Stop</button>}
              {job.status === 'failed' && !blocked && <p className="bad">{job.technicalQa?.status === 'failed' ? 'The final file failed technical QA.' : job.error}</p>}
              {notes.length > 0 && <ul className="notes">{notes.filter((n) => !(choice && n.startsWith('BLOCKED'))).map((n, i) => <li key={i} className={n.startsWith('BLOCKED') ? 'bad' : n.startsWith('Fixed') ? 'good' : 'muted'}>{n.startsWith('Fixed') ? '✓ ' + n : n}</li>)}</ul>}
              {choice && job.status !== 'running' && <BlockedCard lines={job.lines || []} choice={choice} busy={anyRunning} onRetry={() => draftWith()} onAnyway={() => draftWith({ allowRepeat: true })} onEdit={() => document.querySelector('.composer textarea')?.focus()} />}
              {job.status === 'cancelled' && <p className="muted">Stopped.</p>}
              {job.status === 'interrupted' && <p className="bad">{job.error}</p>}
              {job.plan && <PlanCard job={job} idea={job.prompt} onStills={stills} disabled={busy || blocked} notes={notes} />}
              {job.plan && <FramesBlock job={job} plan={job.plan?.plan || job.plan} onStills={stills} onRegen={regen} onRender={render} busy={busy || me?.rendersLeft === 0} blocked={blocked} />}
              {job.plan && <RenderTimer job={job} plan={job.plan?.plan || job.plan} />}
              {job.plan && <RenderLive job={job} plan={job.plan?.plan || job.plan} sessions={sessions} />}
              {job.status === 'done' && job.kind === 'draft' && !job.plan && <p className="muted">Plan saved: {job.scenario}</p>}
              {!job.video && job.previousVideo && <details className="card"><summary>Previous verified export</summary><Player src={'/media?p=' + encodeURIComponent(job.previousVideo)} /></details>}
              {job.video && <ExportReview key={job.video} job={job} review={review.video === job.video ? review : { status: 'pending' }} weak={weak} notes={notes} busy={busy || me?.rendersLeft === 0} onRetake={retakeShot} onCompare={me?.canCompare && sessions.filter((p) => p.hasVideo).length > 1 ? () => setCompare(true) : undefined} />}
              <UpNext show={running} autoNext={autoNext} setAutoNext={setAutoNext} />
              {me?.canSeeLog && <button className="ghost" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} log</button>}
              {showLog && <pre className="log" ref={logRef}>{(job.lines || []).join('\n')}</pre>}
            </div>
          </>
        )}
        <div ref={endRef} />
      </main>
      <footer>
        {err && <div className="bad" role="alert">{err}</div>}
        <LookChips look={look} setLook={(value) => {
          setLook(value);
          setExampleInfo(null);
          if (exampleContext) { setEnding(''); setSetting(''); setExampleContext(false); }
        }} exampleBusy={exampleBusy} onExample={suggestExample} />
        {exampleInfo && <p className="muted" role="status">{exampleInfo.title} · {exampleInfo.note} {exampleInfo.trend?.sourceUrl && <a href={exampleInfo.trend.sourceUrl} target="_blank" rel="noreferrer">Search source</a>}</p>}
        <IdeaHelper text={prompt} look={look} quiet={simple} />
        {anyRunning && <div className="hint tip">Your Mac is making another video right now{live.prompt ? ` ("${live.prompt.slice(0, 40)}...")` : ''}. Up next is saved in this browser. Leave Studio open for automatic start.</div>}
        <label htmlFor="video-brief" className="brief-label">Video idea</label>
        <div className="composer">
          <textarea id="video-brief" dir="auto" value={prompt} onChange={(e) => {
            setPrompt(e.target.value);
            setExampleInfo(null);
            if (exampleContext) { setEnding(''); setSetting(''); setExampleContext(false); }
          }} onKeyDown={onKey} rows={2}
            placeholder="A baker cracks a chocolate shell to reveal pistachio cream." />
          {anyRunning
            ? <button className="primary" disabled={!prompt.trim()} title="Your Mac is busy with another video. This adds your idea to Up next." onClick={() => { writeQueue([...readQueue(), prompt.trim()].slice(0, 10)); setAutoNext(true); setPrompt(''); }}>Add to Up next</button>
            : <button className="primary" onClick={draft} disabled={!prompt.trim() || sending || planDisabled}>{unattended && me?.canRunUnattended ? 'Create video automatically' : 'Plan video'}</button>}
        </div>
        {me?.canRunUnattended && <div className="opts">
          <label><input type="checkbox" checked={unattended} onChange={(e) => setUnattended(e.target.checked)} /> Run unattended</label>
          {unattended && <span>Studio checks the plan and first frames, then renders and runs QA. You can close this tab. Leave the Mac and Studio server running.</span>}
        </div>}
        {simple ? (
          <div className="opts simpleopts">
            <span className="lenchips">{[10, 20, 30].filter((n) => n <= maxSeconds).map((n) => <button key={n} aria-pressed={seconds === n} className={seconds === n ? 'on' : ''} onClick={() => setSeconds(n)}>{n}s</button>)}</span>
            <span className="muted small">{seconds}s · {orientation === 'vertical' ? 'Vertical' : 'Wide'} · {audio === 'asmr' ? 'ASMR' : audio === 'voiced' ? 'Voice' : 'Automatic audio'}</span>
            <button className="link" onClick={() => setMode('advanced')}>Advanced settings</button>
          </div>
        ) : (
        <div className="opts">
          <button className="link" onClick={() => setMode('simple')}>Close advanced settings</button>
          <label>Length <select value={seconds} onChange={(e) => setSeconds(+e.target.value)}>{[10, 20, 30, 45, 60].filter((n) => n <= maxSeconds).map((n) => <option key={n} value={n}>{n}s</option>)}</select></label>
          <label>Shape <select value={orientation} onChange={(e) => setOrientation(e.target.value)}><option value="vertical">Vertical 9:16</option><option value="wide">Wide 16:9</option></select></label>
          <label>Sound <select value={audio} onChange={(e) => setAudio(e.target.value)}><option value="asmr">ASMR (no voice)</option><option value="voiced">Voiced</option><option value="auto">Auto</option></select></label>
          <label title="Runs plan, first frames and the automatic checks by itself, and stops if any check fails."><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto mode</label>
          {auto && <label title="Recommended: you see the first frames before the long motion render."><input type="checkbox" checked={pauseFrames} onChange={(e) => setPauseFrames(e.target.checked)} /> pause at first frames</label>}
          <label className="brief-setting">Setting (optional)<input className="ending" dir="auto" value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="Setting (hint, optional), e.g. a rainy rooftop garden" title="A hint: shapes the prompts, and the audit only notes shots that leave it out." /></label>
          <label className="brief-setting">Required ending (optional)<input className="ending" dir="auto" value={ending} onChange={(e) => { setEnding(e.target.value); setExampleContext(false); }} placeholder="Ending (checked, optional), e.g. onions glistening in the copper pan" title="Checked: the plan is blocked unless the payoff and final shot match this ending. Auto-filled from your last 'then...' part." /></label>
        </div>
        )}
        {me?.role === 'creator' && <p className="muted">{me.draftsLeft} plans and {me.rendersLeft} renders left today · Up to {maxSeconds}s</p>}
      </footer>
    </div>
    </div>
  );
}
