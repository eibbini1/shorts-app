import { useEffect, useRef, useState } from 'react';
import {
  BabyBallPreviewCard,
  Elapsed,
  Sidebar,
  THEMES,
  supportsBabyBallPreview,
} from './components/StudioChrome.jsx';
import {
  BlockedCard,
  ComparePanel,
  ExportReview,
  FailureCard,
  FramesBlock,
  IdeaHelper,
  IdeaRefinement,
  LearnedCard,
  LookChips,
  PlanCard,
  Player,
  ReadinessCheck,
  RenderLive,
  RenderTimer,
  ShotPlan,
  StageBar,
  StepTrack,
  UpNext,
  jobState,
  readQueue,
  writeQueue,
} from './extras.jsx';
import { readComposerDraft, writeComposerDraft } from './draft-storage.js';
import { failureHelp } from './failure-help.js';
import { FeedbackPanel } from './FeedbackPanel.jsx';
import { NotificationBell, useNotifications } from './NotificationBell.jsx';
import { COALESCE_MS, flushNow } from './notifications.js';
import { choiceOf, displayPipelineLine, isBlocked, notesOf, progressOf as progressOfLines } from './pipeline-lines.js';
import { findMatchingSession, sessionDisplayName } from './session-label.js';
import { watchdogLabel } from './watchdog-status.js';

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
    let shown = null;
    let latest = null;
    let timer = null;
    const flush = () => {
      timer = null;
      if (latest) {
        shown = latest;
        latest = null;
        setJob(shown);
      }
    };
    es.onmessage = (e) => {
      try { latest = JSON.parse(e.data); } catch { return; }
      if (flushNow(shown, latest)) { clearTimeout(timer); flush(); }
      else if (!timer) timer = setTimeout(flush, COALESCE_MS);
    };
    return () => { clearTimeout(timer); es.close(); };
  }, []);
  return job;
}

const progressOf = (job) => progressOfLines(job.lines);

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
  const [duplicateSession, setDuplicateSession] = useState(null);
  const notifier = useNotifications({ live, sessions });
  const job = selectedId == null ? { status: 'idle' } : selectedId === live.id ? live : stored?.id === selectedId ? stored : { status: 'idle' };
  const anyRunning = ['running', 'stopping'].includes(live.status);
  const maxSeconds = me?.maxSeconds ?? 60;
  const loadSessions = () => fetch('/api/sessions').then((r) => r.json()).then(setSessions).catch(() => {});
  useEffect(() => {
    loadSessions();
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, [live.id, live.status]);
  const [composerDraft] = useState(readComposerDraft);
  const [prompt, setPrompt] = useState(() => composerDraft?.prompt || '');
  const [seconds, setSeconds] = useState(() => composerDraft?.seconds || 10);
  const planDisabled = me?.draftsLeft === 0 || seconds > maxSeconds;
  const [orientation, setOrientation] = useState(() => composerDraft?.orientation || 'vertical');
  const [continuityAnchor, setContinuityAnchor] = useState(() => composerDraft?.continuityAnchor || 'identity');
  const [quality, setQuality] = useState(() => (composerDraft?.quality === 'high' ? 'high' : 'standard'));
  const [audio, setAudio] = useState(() => composerDraft?.audio || 'asmr');
  const [ending, setEnding] = useState(() => composerDraft?.ending || '');
  const [refining, setRefining] = useState(false);
  const [refinement, setRefinement] = useState(null);
  const refinementRequest = useRef(0);
  const [look, setLook] = useState(() => composerDraft?.look || 'food');
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('studio-theme');
      const migrated = localStorage.getItem('studio-theme-codex-default-v1') === '1';
      if (!migrated) {
        localStorage.setItem('studio-theme-codex-default-v1', '1');
        if (!saved || saved === 'studio') return 'codex';
      }
      return saved || 'codex';
    } catch { return 'codex'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('studio-theme', theme); } catch {}
  }, [theme]);
  const [setting, setSetting] = useState(() => composerDraft?.setting || '');
  useEffect(() => {
    writeComposerDraft({ prompt, seconds, orientation, quality, continuityAnchor, audio, ending, look, setting });
  }, [prompt, seconds, orientation, quality, continuityAnchor, audio, ending, look, setting]);
  const refinementInputs = useRef({});
  refinementInputs.current = { prompt, look, seconds, orientation, setting, ending };
  const [exampleContext, setExampleContext] = useState(false);
  const [exampleBusy, setExampleBusy] = useState(false);
  const [exampleInfo, setExampleInfo] = useState(null);
  const exampleRequest = useRef(0);
  const seenExamples = useRef([]);
  const briefRef = useRef(prompt);
  const lookRef = useRef(look);
  briefRef.current = prompt;
  lookRef.current = look;
  const invalidateRefinement = () => { refinementRequest.current++; setRefinement(null); };
  const suggestExample = async (selected) => {
    if (exampleBusy) return;
    invalidateRefinement();
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
  const refineIdea = async () => {
    if (refining || !prompt.trim() || anyRunning) return;
    const request = ++refinementRequest.current;
    const original = JSON.stringify(refinementInputs.current);
    setRefining(true); setRefinement(null); setErr('');
    try {
      const result = await post('/api/refine-idea', refinementInputs.current);
      if (request === refinementRequest.current && JSON.stringify(refinementInputs.current) === original) setRefinement(result);
    } catch (error) { if (request === refinementRequest.current) setErr(error.message); }
    finally { setRefining(false); }
  };
  const prepareRepair = async (guidance) => {
    if (refining || anyRunning || !guidance.trim()) return;
    const basePrompt = String(job.options?.originalPrompt || job.prompt || '').trim();
    if (!basePrompt) { setErr('The original idea is unavailable, so this plan cannot be revised safely.'); return; }
    const request = ++refinementRequest.current;
    setRefining(true); setRefinement(null); setErr('');
    try {
      const result = await post('/api/refine-idea', {
        prompt: basePrompt,
        repairGuidance: guidance.trim(),
        look: job.options?.look || look,
        seconds: job.options?.seconds || seconds,
        orientation: job.options?.orientation || orientation,
        setting: job.options?.setting || setting,
        ending: job.options?.ending || ending,
      });
      if (request === refinementRequest.current && job.id === selectedId) {
        setRefinement({
          ...result,
          repairSessionId: job.id,
          basePrompt,
          baseBrief: job.options?.brief || {},
          baseStoryPrompt: job.options?.storyPrompt || basePrompt,
          repairGuidance: guidance.trim(),
        });
      }
    } catch (error) {
      if (request === refinementRequest.current) setErr(error.message);
    } finally { setRefining(false); }
  };
  useEffect(() => {
    if (refinement?.repairSessionId) document.querySelector('.idea-refinement')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [refinement]);
  const useRefinedIdea = (story) => {
    const originalPrompt = story.basePrompt || prompt;
    const nextPrompt = story.refinedPrompt || story.prompt;
    setPrompt(nextPrompt); setEnding(story.ending); setExampleContext(false); setRefinement(null); setExampleInfo(null);
    draftWith({
      prompt: nextPrompt, originalPrompt, ending: story.ending, hook: story.hook,
      mustShow: story.mustShow, obstacle: story.obstacle, turn: story.turn,
      allowDuplicate: true,
      ...(story.repairSessionId ? { retrySessionId: story.repairSessionId, repair: true, repairGuidance: story.repairGuidance } : {}),
    }, { ignoreDuplicate: true, approved: true });
  };
  const [unattended, setUnattended] = useState(false);
  const [auto, setAuto] = useState(false);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('studio-mode') || 'simple'; } catch { return 'simple'; } });
  useEffect(() => { try { localStorage.setItem('studio-mode', mode); } catch {} }, [mode]);
  const simple = mode === 'simple';
  const empty = job.status === 'idle' || !job.status;
  const [autoNext, setAutoNext] = useState(false);
  const [pauseFrames, setPauseFrames] = useState(true);
  const autoOn = simple || auto;
  const pauseOn = simple || pauseFrames;
  const autoRef = useRef(false);
  const autoSeen = useRef('');
  const retake = useRef(false);
  const [review, setReview] = useState({ status: 'pending' });
  const weak = review.video === job.video ? review.weak || [] : [];
  const [compare, setCompare] = useState(false);
  const [err, setErr] = useState('');
  const [showLog, setShowLog] = useState(false);
  const endRef = useRef(null);
  const running = job.status === 'running' && job.id === live.id;
  const prog = progressOf(job);
  const prevStatus = useRef('idle');
  const sequenceSeen = useRef('');
  useEffect(() => {
    const icon = { running: '⏳', done: '✅', failed: '⚠️', cancelled: '⏹' }[job.status] || '';
    document.title = `${icon} iShorts`;
    prevStatus.current = job.status;
  }, [job.status]);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job.lines?.length, showLog]);
  const notes = notesOf(job.lines);
  const blocked = isBlocked(notes);
  const busy = anyRunning || sending;
  const planAwaiting = Boolean(job.plan) && job.status === 'done' && job.kind === 'draft' && !blocked;
  const phase = jobState(job, blocked, live.busyElsewhere);
  const choice = choiceOf(job.lines);

  useEffect(() => {
    if ((job.options?.unattended && !retake.current) || !autoRef.current || !['done', 'failed', 'cancelled'].includes(job.status)) return;
    const key = job.id + ':' + job.kind + ':' + job.status;
    if (autoSeen.current === key) return;
    autoSeen.current = key;
    if (job.status !== 'done' || blocked || !job.scenario) { autoRef.current = false; return; }
    const go = (url) => post(url, { scenario: job.scenario, sessionId: job.id }).then((r) => pickProject(r.id)).catch((e) => { autoRef.current = false; setErr(e.message); });
    if (job.kind === 'draft') go('/api/stills');
    else if (job.kind === 'stills') {
      if (job.sequence?.active) { autoRef.current = false; retake.current = false; }
      else if (pauseOn && !retake.current) autoRef.current = false;
      else { retake.current = false; go('/api/render'); }
    } else autoRef.current = false;
  }, [job.status, job.kind, job.id]);
  useEffect(() => {
    if (!job.options?.unattended || job.kind !== 'sequence-motion' || job.status !== 'done' || job.sequence?.stage !== 'motion') return;
    const key = `${job.id}:${job.sequence.currentShot}:${job.sequence.stage}`;
    if (sequenceSeen.current === key) return;
    sequenceSeen.current = key;
    post('/api/sequence/next', { scenario: job.scenario, sessionId: job.id })
      .then((result) => { if (result.id) pickProject(result.id); })
      .catch((error) => setErr(error.message));
  }, [job.status, job.kind, job.id, job.scenario, job.sequence?.currentShot, job.sequence?.stage]);
  const useServerQueue = Boolean(me?.canRunUnattended && (unattended || live.unattendedQueue?.items?.length));
  const serverQueue = useServerQueue ? (live.unattendedQueue || { autoNext: true, items: [] }) : null;
  const nextSeen = useRef('');
  useEffect(() => {
    if (useServerQueue || !autoNext || anyRunning || !job.status || job.status === 'idle') return;
    const key = job.id + ':' + job.kind + ':' + job.status;
    if (nextSeen.current === key) return;
    nextSeen.current = key;
    if (autoRef.current && job.status === 'done') return;
    if (!readQueue().length) return;
    const t = setTimeout(() => {
      const q = readQueue();
      if (!q.length) return;
      writeQueue(q.slice(1));
      setPrompt(q[0]);
      draftWith({ prompt: q[0] }, { ignoreDuplicate: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [job.status, job.kind, job.id, autoNext, anyRunning, useServerQueue]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [job.steps?.length, job.status, job.video]);

  const run2 = (fn) => async (...a) => { setErr(''); try { await fn(...a); } catch (e) { setErr(e.message); } };
  const enqueueUnattended = run2(async (ideaText) => {
    await post('/api/queue', {
      action: 'add',
      item: { prompt: ideaText, look, seconds, orientation, quality, audio, continuityAnchor, setting, ending },
    });
  });
  const moveServerQueue = run2(async (index, delta) => { await post('/api/queue', { action: 'move', index, delta }); });
  const removeServerQueue = run2(async (id) => { await post('/api/queue', { action: 'remove', id }); });
  const toggleServerQueue = run2(async (enabled) => { await post('/api/queue', { action: 'toggle', autoNext: enabled }); });
  const run = (fn) => async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSending(true);
    setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    finally { submitting.current = false; setSending(false); }
  };
  const draftWith = (extra = {}, { ignoreDuplicate = false, approved = false } = {}) => {
    if (planDisabled && !extra.repair && !extra.retrySessionId) return;
    if (!ignoreDuplicate) {
      const duplicate = findMatchingSession(extra.prompt || prompt, sessions, selectedId);
      if (duplicate) { setDuplicateSession(duplicate); return; }
    }
    setDuplicateSession(null);
    return run(async () => {
      const runUnattended = !extra.repair && me?.canRunUnattended && unattended;
      const r = await post('/api/draft', { prompt, seconds, orientation, quality, continuityAnchor, audio, ending, look, setting, unattended: runUnattended, refine: !approved, requestId: globalThis.crypto.randomUUID(), ...extra });
      if (r.decision === 'needs_choices') { setRefinement(r.refinement); return; }
      if (r.options?.storyPrompt) setPrompt(r.options.storyPrompt);
      if (r.options?.ending) setEnding(r.options.ending);
      setRefinement(null);
      autoRef.current = !extra.repair && autoOn && !runUnattended;
      autoSeen.current = '';
      pickProject(r.id);
    })();
  };
  const draft = () => refineIdea();
  const render = run(async () => { const r = await post('/api/render', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const renderTruffleStory = run(async () => {
    const result = await post('/api/cartoon/truffle', { requestId: globalThis.crypto.randomUUID() });
    await pickProject(result.id);
  });
  const stills = run(async () => { const r = await post('/api/stills', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const resumeUnattended = run(async () => { const r = await post('/api/stills', { scenario: job.scenario, sessionId: job.id, resumeUnattended: true }); pickProject(r.id); });
  const approveFrames = async (selections) => {
    try { return await post('/api/approve-frames', { scenario: job.scenario, sessionId: job.id, selections }); }
    catch (error) { setErr(error.message); return null; }
  };
  const continueSequence = run(async () => {
    const result = await post('/api/sequence/next', { scenario: job.scenario, sessionId: job.id });
    await pickProject(result.id || job.id);
  });
  const sequenceTake = (take, batchTakes = false) => run(async () => {
    const result = await post('/api/sequence/retry', { scenario: job.scenario, sessionId: job.id, motionTake: true, take, batchTakes });
    await pickProject(result.id);
  })();
  const retrySequence = run(async () => {
    const result = await post('/api/sequence/retry', { scenario: job.scenario, sessionId: job.id });
    pickProject(result.id);
  });
  const retryPlanning = () => draftWith({
    prompt: job.options?.storyPrompt || job.prompt,
    originalPrompt: job.options?.originalPrompt || job.prompt,
    retrySessionId: job.id,
    unattended: Boolean(job.options?.unattended),
  }, { ignoreDuplicate: true, approved: true });
  const retakeMotion = (shot, take) => run(async () => {
    const r = await post('/api/render', { scenario: job.scenario, sessionId: job.id, retakeMotion: shot, ...(take === undefined ? {} : { take }) });
    pickProject(r.id);
  })();
  const regen = (shot) => run(async () => { const r = await post('/api/regen', { scenario: job.scenario, sessionId: job.id, shot }); pickProject(r.id); })();
  const retakeShot = (shot) => run(async () => {
    retake.current = true;
    autoRef.current = true;
    autoSeen.current = '';
    const r = await post('/api/regen', { scenario: job.scenario, sessionId: job.id, shot });
    pickProject(r.id);
  })();
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
    setDuplicateSession(null);
    exampleRequest.current++; setExampleBusy(false); setExampleInfo(null);
    const request = ++projectRequest.current;
    setErr(''); pickProject(id); setProjectsOpen(false);
    const j = id === live.id ? live : await fetch('/api/sessions/' + id).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (request !== projectRequest.current) return;
    if (!j) { setErr('Could not load that project.'); return; }
    if (id !== live.id) setStored(j);
    setPrompt(j.prompt || ''); setSeconds(j.options?.seconds || 10); setOrientation(j.options?.orientation || 'vertical'); setQuality(j.options?.quality === 'high' ? 'high' : 'standard');
    setContinuityAnchor(j.options?.continuityAnchor === 'previous-end' ? 'previous-end' : 'identity');
    setExampleContext(Boolean(j.options?.ending));
    setAudio(j.options?.audio || 'asmr'); setEnding(j.options?.ending || ''); setLook(j.options?.look || 'food'); setSetting(j.options?.setting || ''); setShowLog(false);
  };
  useEffect(() => { if (restoreId.current) select(restoreId.current); }, []);
  const newChat = () => {
    invalidateRefinement(); setDuplicateSession(null); exampleRequest.current++; setExampleBusy(false); setExampleInfo(null);
    projectRequest.current++; pickProject(null); setProjectsOpen(false); setStored(null); setExampleContext(false); setPrompt(''); setEnding(''); setSetting(''); setErr('');
  };
  const rename = run2(async (id, name) => { await post('/api/sessions/rename', { id, name }); await loadSessions(); });
  const remove = run2(async (id) => { await post('/api/sessions/delete', { id }); if (id === selectedId) newChat(); await loadSessions(); });
  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim() && !busy && !planDisabled) {
      e.preventDefault();
      draft();
    }
  };
  const attachReference = (shot, dataUrl) => post('/api/reference-frame', {
    scenario: job.scenario, sessionId: job.id, shot, dataUrl,
  });

  return (
    <div className="shell">
      <Sidebar open={projectsOpen} sessions={sessions} selectedId={selectedId} liveId={live.id} onSelect={select} onNew={newChat} onRename={rename} onDelete={remove} />
      <div className={empty ? 'app create-home' : 'app'}>
        <header>
          <button className="projects-toggle" aria-controls="projects" aria-expanded={projectsOpen} onClick={() => setProjectsOpen(!projectsOpen)}>Projects</button>
          <span className="logo"><img src="/logo.svg" alt="" className="logo-mark" /><span className="logo-word">i<b>Shorts</b></span></span>
          {me && <span className="muted account">{me.name === me.role ? me.role : `${me.name} · ${me.role}`}</span>}
          <FeedbackPanel job={job} canManage={Boolean(me?.canManageFeedback)} />
          <NotificationBell notifier={notifier} selectedId={selectedId} onOpen={select} />
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
              <div className="bubble user">{job.prompt || 'New video idea'}{job.kind === 'render' && <div className="muted">{job.options?.preset === 'runaway-truffle' ? 'Unattended 3D preset' : 'Rendering the approved plan'}</div>}</div>
              <div className="bubble bot">
                {job.options?.preset !== 'runaway-truffle' && <StageBar job={job} />}
                <p className={phase.k === 'blocked' || phase.k === 'failed' ? 'bad' : 'muted'} role="status">{phase.t}</p>
                <ul className="steps">
                  {(job.steps || []).map((s, i) => (
                    <li key={s} className={i === job.steps.length - 1 && running ? 'now' : 'ok'}>{s}</li>
                  ))}
                  {running && !(job.steps || []).length && <li className="now">Starting</li>}
                </ul>
                {running && <p className="muted">Elapsed <Elapsed startedAt={job.startedAt} />{prog ? ` · ${prog.n} of ${prog.of}` : ''}</p>}
                {job.options?.preset !== 'runaway-truffle' && <StepTrack job={job} />}
                {running && <div className="bar"><div className={prog ? 'fill' : 'fill indet'} style={prog ? { width: `${Math.round((prog.n / prog.of) * 100)}%` } : {}} /></div>}
                {running && job.lines?.length > 0 && <p className="muted">{displayPipelineLine(job.lines[job.lines.length - 1])}</p>}
                {(() => { const w = watchdogLabel(job.watchdog, job.status); return w && <p className={`hint ${w.tone}`}>{w.text}</p>; })()}
                {running && <button className="ghost" onClick={cancel}>Stop</button>}
                {(() => { const help = job.kind === 'render' && !blocked ? failureHelp({ status: job.status, kind: job.kind, error: job.error, watchdog: job.watchdog, technicalQa: job.technicalQa, hasScenario: Boolean(job.scenario) }) : null; return help ? <FailureCard help={help} busy={busy} onRetry={render} /> : null; })()}
                {job.status === 'failed' && !blocked && job.kind !== 'render' && <p className="bad">{job.technicalQa?.status === 'failed' ? 'The final file failed technical QA.' : job.error}</p>}
                {notes.length > 0 && <ul className="notes">{notes.filter((n) => !(choice && n.startsWith('BLOCKED'))).map((n, i) => <li key={i} className={n.startsWith('BLOCKED') ? 'bad' : n.startsWith('Fixed') ? 'good' : 'muted'}>{n.startsWith('Fixed') ? '✓ ' + n : n}</li>)}</ul>}
                {['failed', 'cancelled', 'interrupted'].includes(job.status) && job.kind === 'draft' && !choice && <button className="primary" disabled={busy} onClick={retryPlanning}>Retry planning in this project</button>}
                {choice && job.status !== 'running' && <BlockedCard lines={job.lines || []} events={job.events} choice={choice} busy={anyRunning} onRetry={() => draftWith({ retrySessionId: job.id, prompt: job.options?.storyPrompt || job.prompt, originalPrompt: job.options?.originalPrompt || job.prompt }, { ignoreDuplicate: true })} onAnyway={() => draftWith({ allowRepeat: true, allowDuplicate: true }, { ignoreDuplicate: true })} onEdit={() => document.querySelector('.composer textarea')?.focus()} />}
                {job.status === 'cancelled' && <p className="muted">Stopped.</p>}
                {job.status === 'interrupted' && job.kind !== 'render' && <p className="bad">{job.error}</p>}
                {job.sequence?.takeError && <p role="status" className="muted">{job.sequence.takeError}</p>}
                {job.sequence?.continuationError && <p className="bad">{job.sequence.continuationError}</p>}
                {job.kind === 'stills' && job.status === 'failed' && job.sequence?.active &&
                  <button className="primary" disabled={busy} onClick={stills}>Retry shot {job.sequence.currentShot} frame preparation</button>}
                {job.kind === 'sequence-motion' && (['failed', 'cancelled', 'interrupted'].includes(job.status) || job.sequence?.continuationError) && job.sequence?.stage === 'motion' &&
                  <button className="primary" disabled={busy} onClick={retrySequence}>Retry approved shot motion</button>}
                {['failed', 'interrupted'].includes(job.status) && me?.canRunUnattended && job.options?.unattended && job.scenario && job.plan && <button className="primary" disabled={busy} onClick={resumeUnattended}>Resume automatically</button>}
                {job.plan && <PlanCard job={job} idea={job.prompt} onStills={stills} onReference={attachReference} onCharacter={me?.role === 'owner' ? (characterId) =>
                  post('/api/reference-frame', { scenario: job.scenario, sessionId: job.id, characterId }) : null} disabled={busy || blocked} notes={notes} />}
                {job.plan && supportsBabyBallPreview(job) && <BabyBallPreviewCard />}
                {job.plan && <FramesBlock job={job} plan={job.plan?.plan || job.plan} onStills={stills} onRegen={regen} onRender={render} onApproveFrames={approveFrames} busy={busy || me?.rendersLeft === 0} blocked={blocked} anyRunning={anyRunning} rendersLeft={me?.rendersLeft ?? null} />}
                {job.plan && <RenderTimer job={job} plan={job.plan?.plan || job.plan} />}
                {(job.attempts || []).length > 0 && <details className="card"><summary>Previous planning attempts ({job.attempts.length})</summary>{job.attempts.map((attempt, index) => {
                  const previousPlan = attempt.plan?.plan || attempt.plan;
                  return <section key={`${attempt.startedAt}-${index}`}><p><b>Attempt {index + 1}</b> · {attempt.status}{attempt.error ? ` · ${attempt.error}` : ''}</p>
                    {previousPlan?.shots && <><p><b>{previousPlan.title || 'Saved story plan'}</b> · {attempt.options?.seconds || previousPlan.shots.reduce((sum, shot) => sum + (Number(shot.seconds) || 0), 0)}s</p><ShotPlan shots={previousPlan.shots} notes={[]} /></>}
                    {attempt.video && <><Player src={'/media?p=' + encodeURIComponent(attempt.video)} /><p><a href={'/media?p=' + encodeURIComponent(attempt.video)} download>Download this attempt&apos;s export</a></p></>}
                    {attempt.scenario && <p className="muted small">Saved scenario: {attempt.scenario}</p>}
                    {attempt.lines?.length > 0 && <pre className="log">{attempt.lines.join('\n')}</pre>}
                  </section>;
                })}</details>}
                {job.plan && <RenderLive canSimulateHostedShot={me?.canSimulateHostedShot} job={job} plan={job.plan?.plan || job.plan} sessions={sessions} onRetakeMotion={retakeMotion} onSequenceTake={sequenceTake} onContinue={continueSequence} busy={busy || me?.rendersLeft === 0} />}
                {job.status === 'done' && job.kind === 'draft' && !job.plan && <p className="muted">Plan saved: {job.scenario}</p>}
                {job.previousVideo && job.previousVideo !== job.video && <details className="card"><summary>Previous export</summary><Player src={'/media?p=' + encodeURIComponent(job.previousVideo)} /></details>}
                {job.video && <ExportReview key={job.video} job={job} review={review.video === job.video ? review : { status: 'pending' }} weak={weak} notes={notes} busy={busy || refining} renderDisabled={me?.rendersLeft === 0} onRetake={retakeShot} onRepair={prepareRepair} onCompare={me?.canCompare && sessions.filter((p) => p.hasVideo).length > 1 ? () => setCompare(true) : undefined} />}
                <UpNext show={running} autoNext={autoNext} setAutoNext={setAutoNext} serverQueue={serverQueue} onAddServer={enqueueUnattended} onMoveServer={moveServerQueue} onRemoveServer={removeServerQueue} onToggleServer={toggleServerQueue} />
                {me?.canSeeLog && <button className="ghost" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} log</button>}
                {showLog && <pre className="log" ref={logRef}>{(job.lines || []).map(displayPipelineLine).join('\n')}</pre>}
              </div>
            </>
          )}
          <div ref={endRef} />
        </main>
        <footer>
          {err && <div className="global-error" role="alert">
            <span className="global-error-icon" aria-hidden="true">!</span>
            <div className="global-error-copy">
              <b>Could not complete that action</b>
              <p>{err}</p>
            </div>
            <button type="button" className="ghost" onClick={() => setErr('')}>Dismiss</button>
          </div>}
          <LookChips look={look} setLook={(value) => {
            invalidateRefinement();
            setLook(value);
            setExampleInfo(null);
            if (exampleContext) { setEnding(''); setSetting(''); setExampleContext(false); }
          }} exampleBusy={exampleBusy} onExample={suggestExample} />
          {exampleInfo && <p className="muted" role="status">{exampleInfo.title} · {exampleInfo.note} {exampleInfo.trend?.sourceUrl && <a href={exampleInfo.trend.sourceUrl} target="_blank" rel="noreferrer">Search source</a>}</p>}
          <IdeaHelper text={prompt} look={look} ending={ending} quiet={simple} />
          <details className="optional-tools">
            <summary>Optional tools <span className="muted small">idea refinement · Mac readiness</span></summary>
            <div className="optional-tools-content">
              <div className="refine-row">
                <button className="link" type="button" onClick={refineIdea} disabled={!prompt.trim() || refining || anyRunning || sending}>
                  {refining ? 'Checking your idea…' : 'Refine idea with local AI'}
                </button>
                <span className="muted small">Review a stronger story brief before planning.</span>
              </div>
              <ReadinessCheck />
            </div>
          </details>
          {anyRunning && <div className="hint tip">Your Mac is making another video right now{live.prompt ? ` ("${live.prompt.slice(0, 40)}...")` : ''}. {useServerQueue
            ? 'Up next is saved on this Mac server — you can close this tab and queued ideas will still run unattended.'
            : 'Up next is saved in this browser. Leave Studio open for automatic start.'}</div>}
          <label htmlFor="video-brief" className="brief-label">Video idea</label>
          <div className="composer">
            <textarea id="video-brief" dir="auto" value={prompt} onChange={(e) => {
              invalidateRefinement();
              setDuplicateSession(null);
              setPrompt(e.target.value);
              setExampleInfo(null);
              if (exampleContext) { setEnding(''); setSetting(''); setExampleContext(false); }
            }} onKeyDown={onKey} rows={2}
              placeholder="A baker cracks a chocolate shell to reveal pistachio cream." />
            {anyRunning
              ? <button className="primary" disabled={!prompt.trim()} title="Your Mac is busy with another video. This adds your idea to Up next." onClick={() => {
                  const nextIdea = prompt.trim();
                  if (useServerQueue) enqueueUnattended(nextIdea);
                  else { writeQueue([...readQueue(), nextIdea].slice(0, 10)); setAutoNext(true); }
                  setPrompt('');
                }}>Add to Up next</button>
              : <button className={planAwaiting ? 'ghost composer-secondary' : 'primary'} onClick={draft} disabled={!prompt.trim() || sending || refining || planDisabled} title={planAwaiting ? 'Starts a new story from this idea. Your current plan is kept.' : undefined}>{refining ? 'Refining your story…' : refinement ? 'Refine story again' : 'Review story'}</button>}
          </div>
          <p className="muted small">Your idea and settings are saved locally in this browser.</p>
          <p className="stage-help" id="stage-help">{unattended && me?.canRunUnattended
            ? <><b>Unattended:</b> after brief approval, Studio runs the plan, first frames, motion and final checks automatically, stopping if a check needs your input.</>
            : simple || auto
            ? <><b>Guided:</b> Studio plans the story and makes first frames, then waits for your OK before the long motion render.</>
            : <><b>Manual:</b> you start each stage yourself: plan, first frames, render.</>}</p>
          {duplicateSession && <div className="hint duplicate-project" role="status">
            <p><b>{duplicateSession.id === selectedId ? 'This project is already open.' : 'You already have a project with this idea.'}</b> “{sessionDisplayName(duplicateSession, sessions)}” · {duplicateSession.status}{duplicateSession.hasVideo ? ' · video available' : ''}</p>
            {duplicateSession.id === selectedId && <p>Continue with the current plan above, or create a separate project.</p>}
            <div className="row wrap">
              {duplicateSession.id !== selectedId && <button className="primary" type="button" onClick={() => { const id = duplicateSession.id; setDuplicateSession(null); select(id); }}>Open existing project</button>}
              <button className="ghost" type="button" onClick={() => draftWith({ allowDuplicate: true }, { ignoreDuplicate: true })}>Create a separate project</button>
            </div>
          </div>}
          <IdeaRefinement result={refinement} onUse={useRefinedIdea} />
          {look === 'cartoon' && me?.canRunUnattended && <div className="opts">
            <button type="button" className="ghost" onClick={renderTruffleStory} disabled={anyRunning || sending}>
              Render The Runaway Truffle · 30s
            </button>
            <span>Renders the fixed 3D story with narration and quiet Foley, unattended.</span>
          </div>}
          {me?.canRunUnattended && <div className="opts">
            <label><input type="checkbox" checked={unattended} onChange={(e) => setUnattended(e.target.checked)} /> Run unattended</label>
            {unattended && <span>Studio checks the plan and first frames, then renders and runs QA. You can close this tab. Leave the Mac and Studio server running.</span>}
          </div>}
          {simple ? (
            <div className="opts simpleopts">
              <span className="lenchips">{[10, 20, 30].filter((n) => n <= maxSeconds).map((n) => <button key={n} aria-pressed={seconds === n} className={seconds === n ? 'on' : ''} onClick={() => { invalidateRefinement(); setSeconds(n); }}>{n}s</button>)}</span>
              <span className="muted small">{seconds}s · {orientation === 'vertical' ? 'Vertical' : 'Wide'} · {audio === 'asmr' ? 'ASMR' : audio === 'voiced' ? 'Voice' : 'Automatic audio'}</span>
              <button className="link" onClick={() => setMode('advanced')}>Advanced settings</button>
            </div>
          ) : (
            <div className="opts">
              <button className="link" onClick={() => setMode('simple')}>Close advanced settings</button>
              <label>Length <select value={seconds} onChange={(e) => { invalidateRefinement(); setSeconds(+e.target.value); }}>{[10, 20, 30, 45, 60].filter((n) => n <= maxSeconds).map((n) => <option key={n} value={n}>{n}s</option>)}</select></label>
              <label>Shape <select value={orientation} onChange={(e) => { invalidateRefinement(); setOrientation(e.target.value); }}><option value="vertical">Vertical 9:16</option><option value="wide">Wide 16:9</option></select></label>
              <label title="Applies to the first frame of each later shot in attended review. Custom shot references take priority.">Shot continuity <select value={continuityAnchor} onChange={(event) => setContinuityAnchor(event.target.value)}>
                <option value="identity">Match the first approved frame</option>
                <option value="previous-end">Continue the previous shot&apos;s pose</option>
              </select></label>
              <label title="Standard is the fast default on this Mac. High renders at 704x1280, like the clips you scored, and takes noticeably longer per clip.">Quality <select value={quality} onChange={(e) => setQuality(e.target.value)}><option value="standard">Standard (fast)</option><option value="high">High (slower)</option></select></label>
              <label>Sound <select value={audio} onChange={(e) => setAudio(e.target.value)}><option value="asmr">ASMR (no voice)</option><option value="voiced">Voiced</option><option value="auto">Auto</option></select></label>
              <label title="Runs plan, first frames and the automatic checks by itself, and stops if any check fails."><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto mode</label>
              {auto && <label title="Recommended: you see the first frames before the long motion render."><input type="checkbox" checked={pauseFrames} onChange={(e) => setPauseFrames(e.target.checked)} /> pause at first frames</label>}
              {auto && <p className="muted small" id="auto-help">Auto mode plans, makes first frames and runs the automatic checks by itself. It stops at the first failed check. {pauseFrames ? 'The long motion render starts only after you approve the first frames.' : 'With pause off, the long motion render starts right after the first frames pass, without waiting for you.'}</p>}
              <label className="brief-setting">Setting (optional)<input className="ending" dir="auto" value={setting} onChange={(e) => { invalidateRefinement(); setSetting(e.target.value); }} placeholder="Setting (hint, optional), e.g. a rainy rooftop garden" title="A hint: shapes the prompts, and the audit only notes shots that leave it out." /></label>
              <label className="brief-setting">Required ending (optional)<input className="ending" dir="auto" value={ending} onChange={(e) => { invalidateRefinement(); setEnding(e.target.value); setExampleContext(false); }} placeholder="Ending (checked, optional), e.g. onions glistening in the copper pan" title="Checked: the plan is blocked unless the payoff and final shot match this ending. Auto-filled from your last 'then...' part." /></label>
            </div>
          )}
          {me?.role === 'creator' && <p className="muted">{me.draftsLeft} plans and {me.rendersLeft} renders left today · Up to {maxSeconds}s</p>}
        </footer>
      </div>
    </div>
  );
}
