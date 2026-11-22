import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LearnedCard, RenderTimer, IdeaHelper, Player, ComparePanel, FramesBlock, clipsOf, planEstimate, fmt, LookChips, DirectorsChair, guessResult, BlockedCard, StepTrack, UpNext, readQueue, writeQueue, StageBar, ShotPlan, ExportReview, jobState, FailureCard } from './extras.jsx';
import { failureHelp } from './failure-help.js';
import { filterSessions, findMatchingSession, sessionDisplayName } from './session-label.js';
import { readComposerDraft, readPreflightApproval, writeComposerDraft, writePreflightApproval } from './draft-storage.js';
import { planPromptChanges, repairPreviewChanges } from './review-recommendations.js';
import { notesOf, isBlocked, choiceOf, nowLine, progressOf as progressOfLines } from './pipeline-lines.js';
import { watchdogLabel } from './watchdog-status.js';

const BabyBall3DPreview = lazy(() => import('./BabyBall3DPreview.jsx'));

function supportsBabyBallPreview(job) {
  const text = [
    job.prompt,
    job.options?.storyPrompt,
    job.plan?.creativeBrief?.mustShow,
    job.plan?.plan?.title,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\bbaby\b/.test(text) && /\bball\b/.test(text) && /\bpark\b/.test(text);
}

function BabyBallPreviewCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card three-preview">
      <div className="three-preview-head">
        <div>
          <h3>Interactive 3D story preview</h3>
          <p className="muted small">A procedural Three.js interpretation of the same baby, ball, and park story.</p>
        </div>
        <button type="button" className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide preview' : 'Open 3D preview'}
        </button>
      </div>
      {open && <>
        <p className="muted small">Experimental preview only. It does not change or render into your video export.</p>
        <Suspense fallback={<p className="muted small" role="status">Loading 3D scene…</p>}>
          <BabyBall3DPreview />
        </Suspense>
      </>}
    </section>
  );
}

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

const progressOf = (job) => progressOfLines(job.lines);

const dayLabel = (t) => {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return 'Earlier'; const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

const THEMES = [['studio', 'Studio'], ['night', 'Night'], ['white', 'White'], ['codex', 'Codex dark']];

function Sidebar({ sessions, selectedId, liveId, onSelect, onNew, onRename, onDelete, open }) {
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const groups = [];
  const visibleSessions = filterSessions(sessions, search);
  for (const x of visibleSessions) {
    const label = dayLabel(x.updatedAt);
    const g = groups.find((y) => y.label === label);
    if (g) g.items.push(x); else groups.push({ label, items: [x] });
  }
  const commit = (id) => { const n = draftName.trim(); if (n) onRename(id, n); setEditing(null); };
  return (
    <aside id="projects" className={open ? "side projects-open" : "side"} aria-label="Projects">
      <button className="primary newchat" onClick={onNew}>+ New project</button>
      <div className="sessions">
        <input className="project-search" type="search" aria-label="Search projects" placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} />
        {groups.length === 0 && <p className="muted pad">{search.trim() ? 'No projects match that search.' : 'No projects yet. Your plans and videos will be listed here.'}</p>}
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
                  <button className="name" aria-current={x.id === selectedId ? "true" : undefined} title={`${x.status} · ${x.prompt || x.name}`} onClick={() => onSelect(x.id)}>{sessionDisplayName(x, sessions)}{x.hasVideo ? ' 🎬' : ''}</button>
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

function PlanCard({ job, idea, onStills, onReference, disabled, notes }) {
  const plan = job.plan?.plan || job.plan || {};
  const shots = plan.shots || [];
  const total = shots.reduce((n, s) => n + (s.seconds || 0), 0);
  const [uploadingShot, setUploadingShot] = useState(null);
  const [referenceError, setReferenceError] = useState('');
  const [localReferences, setLocalReferences] = useState([]);
  const approvalKey = `${job.id || ''}:${job.scenario || ''}`;
  const [preflightApproval, setPreflightApproval] = useState(() => ({
    key: approvalKey,
    approved: readPreflightApproval(job.id, job.scenario),
  }));
  const approvedPreflightFixes = preflightApproval.key === approvalKey && preflightApproval.approved;
  const qualityChecks = job.plan?.qualityChecks || plan.qualityChecks || {};
  const preflightFixes = Array.isArray(qualityChecks.preflightPromptFixes) ? qualityChecks.preflightPromptFixes : [];
  const previousAttempt = job.attempts?.at(-1);
  const previousPlan = previousAttempt?.plan?.plan || previousAttempt?.plan;
  const repairPromptChanges = job.options?.repairGuidance && Array.isArray(previousPlan?.shots)
    ? planPromptChanges(previousPlan.shots, shots)
    : [];
  const needsPromptChangeApproval = preflightFixes.length > 0 || repairPromptChanges.length > 0;
  useEffect(() => { setLocalReferences([]); }, [job.id]);
  useEffect(() => {
    setPreflightApproval({ key: approvalKey, approved: readPreflightApproval(job.id, job.scenario) });
  }, [approvalKey, job.id, job.scenario]);
  const approvePromptChanges = (approved) => {
    setPreflightApproval({ key: approvalKey, approved });
    writePreflightApproval(job.id, job.scenario, approved);
  };
  const unattended = job.unattendedRun === true || (job.unattendedRun !== false && job.options?.unattended === true);
  const canAttachReferences = !unattended && ['draft', 'stills'].includes(job.kind) && ['done', 'failed'].includes(job.status) && Boolean(job.scenario);
  const uploadReference = (shot, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setReferenceError('Choose a PNG or JPEG image up to 8 MB.');
      return;
    }
    setReferenceError('');
    setUploadingShot(shot);
    const reader = new FileReader();
    reader.onerror = () => { setReferenceError('Could not read that image.'); setUploadingShot(null); };
    reader.onload = async () => {
      try {
        const saved = await onReference(shot, reader.result);
        setLocalReferences((current) => [...current.filter((item) => item.shot !== shot), saved.reference]);
      }
      catch (error) { setReferenceError(error.message); }
      finally { setUploadingShot(null); }
    };
    reader.readAsDataURL(file);
  };
  const referenceFrames = [...(job.referenceFrames || []).filter((item) => !localReferences.some((local) => local.shot === item.shot)), ...localReferences];
  return (
    <div className="card">
      <p className="muted">Your idea</p>
      <p>{job.options?.originalPrompt || idea || job.plan?.topic}</p>
      {job.options?.storyPrompt && job.options.storyPrompt !== (job.options.originalPrompt || idea) &&
        <p className="muted"><b>Director’s version:</b> {job.options.storyPrompt}</p>}
      <h3>{plan.title || 'Story plan'}</h3>
      {plan.hook && <p><b>Hook:</b> {plan.hook}</p>}
      {plan.payoff && <p><b>Payoff:</b> {plan.payoff}</p>}
      <p className="muted">{shots.length} shots · {total}s · render estimate about {fmt(planEstimate(clipsOf(shots)).mid)} ({fmt(planEstimate(clipsOf(shots)).low)} to {fmt(planEstimate(clipsOf(shots)).high)}) if nothing is retried</p>
      <ShotPlan shots={shots} notes={notes} events={job.events} />
      {needsPromptChangeApproval && <section className="preflight-fixes" aria-label="Prompt changes to approve">
        <h4>Prompt changes to review</h4>
        {repairPromptChanges.length > 0 && <>
          <p className="muted small">Proposed changes from the previous attempt:</p>
          <ul>{repairPromptChanges.map((change, index) => (
            <li key={`repair-${change.shot}-${change.field}-${index}`}>
              <b>{change.shot ? `Shot ${change.shot} · ` : ''}{change.field}</b><br />
              <del>{change.before}</del><br />
              <ins>{change.after}</ins>
            </li>
          ))}</ul>
        </>}
        {preflightFixes.length > 0 && <>
          <p className="muted small">Deterministic checks adjusted prompts to preserve requested actions, endings, and distinct beats:</p>
          <ul>{preflightFixes.flatMap((fix) => (Array.isArray(fix.changes) ? fix.changes : []).map((change) => (
            <li key={`preflight-${fix.shot}-${change.field}-${fix.reason}`}>
              <b>Shot {fix.shot} · {fix.reason} · {change.field === 'imagePrompt' ? 'first-frame prompt' : 'motion prompt'}</b><br />
              <del>{change.before}</del><br />
              <ins>{change.after}</ins>
            </li>
          )))}</ul>
        </>}
        <label className="preflight-approval"><input type="checkbox" checked={approvedPreflightFixes} onChange={(event) => approvePromptChanges(event.target.checked)} />
          I reviewed and approve these prompt changes before first-frame generation.</label>
      </section>}
      {canAttachReferences && <section className="shot-references">
        <h4>Optional per-shot reference images</h4>
        <p className="muted">A per-shot reference overrides the shared Shot 1 identity reference for that scene. Details can still change, so review every generated frame.</p>
        {shots.map((shot, index) => {
          const number = index + 1;
          const reference = referenceFrames.find((item) => item.shot === number);
          return <div className="reference-row" key={number}>
            {reference && <img className="reference-thumb" src={'/media?p=' + encodeURIComponent(reference.p)} alt={`Reference for shot ${number}`} />}
            <label className="ghost reference-upload">{uploadingShot === number ? 'Uploading…' : reference ? `Replace shot ${number} reference` : `Add shot ${number} reference`}
              <input type="file" accept="image/png,image/jpeg" disabled={disabled || uploadingShot !== null} onChange={(event) => uploadReference(number, event)} />
            </label>
          </div>;
        })}
        {referenceError && <p className="bad" role="alert">{referenceError}</p>}
        {job.kind === 'stills' && job.status === 'done' && referenceFrames.length > 0 &&
          <p className="muted">Changing a reference makes the current first-frame approval stale. Regenerate first frames before rendering.</p>}
      </section>}
      {job.kind === 'draft' && job.status === 'done' && <button className="primary" onClick={onStills} disabled={disabled || (needsPromptChangeApproval && !approvedPreflightFixes)}>Make first frames</button>}
      {job.kind === 'stills' && job.status === 'done' && referenceFrames.length > 0 &&
        <button className="primary" onClick={onStills} disabled={disabled || (needsPromptChangeApproval && !approvedPreflightFixes)}>Regenerate first frames</button>}
      {job.kind === 'stills' && job.status === 'failed' && job.scenario &&
        <button className="primary" onClick={onStills} disabled={disabled || (needsPromptChangeApproval && !approvedPreflightFixes)}>Retry first-frame correction in this project</button>}
    </div>
  );
}

function IdeaRefinement({ result, onUse }) {
  if (!result) return null;
  const ready = result.decision === 'ready';
  const changesFor = (proposal) => repairPreviewChanges(result.baseBrief, result.baseStoryPrompt || result.basePrompt, proposal);
  const repairButtonLabel = result.repairSessionId ? 'Start revised plan' : 'Create from this brief';
  return (
    <section className="card idea-refinement" aria-live="polite">
      <h3>{ready ? 'Suggested story' : 'Choose the story direction'}</h3>
      <p className="muted">{result.message}</p>
      {ready ? (
        <div className="refined-copy">
          {(result.basePrompt || result.originalPrompt) && <p><b>Your original idea (kept as a must-show requirement)</b><br />{result.basePrompt || result.originalPrompt}</p>}
          {result.repairGuidance && <p><b>Requested repair</b><br />{result.repairGuidance}</p>}
          {result.repairSessionId && <RepairChangePreview changes={changesFor(result)} />}
          <p><b>Refined idea</b><br />{result.refinedPrompt}</p>
          <ul className="brief-summary">
            <li><b>Hook:</b> {result.hook}</li><li><b>Must show:</b> {result.mustShow}</li>
            <li><b>Obstacle:</b> {result.obstacle}</li><li><b>Turn:</b> {result.turn}</li><li><b>Ending:</b> {result.ending}</li>
          </ul>
          <button className="primary" onClick={() => onUse(result)}>{repairButtonLabel}</button>
        </div>
      ) : (
        <>
          <p><b>{result.question}</b></p>
          <div className="refine-choices">
            {result.choices.map((choice, index) => (
              <article className="refine-choice" key={choice.label + index}>
                <h4>{choice.label}</h4>
                <p>{choice.prompt}</p>
                {result.repairSessionId && <RepairChangePreview changes={changesFor(choice)} />}
                <ul className="brief-summary">
                  <li><b>Hook:</b> {choice.hook}</li><li><b>Must show:</b> {choice.mustShow}</li>
                  <li><b>Obstacle:</b> {choice.obstacle}</li><li><b>Turn:</b> {choice.turn}</li><li><b>Ending:</b> {choice.ending}</li>
                </ul>
                <button className="ghost" onClick={() => onUse({
                  ...choice,
                  prompt: choice.prompt,
                  repairSessionId: result.repairSessionId,
                  basePrompt: result.basePrompt,
                  baseBrief: result.baseBrief,
                  baseStoryPrompt: result.baseStoryPrompt,
                  repairGuidance: result.repairGuidance,
                })}>{result.repairSessionId ? 'Start revised plan' : 'Create this story'}</button>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="muted small">Your original sentence stays in the idea box until you choose a version. Nothing starts rendering from this suggestion.</p>
    </section>
  );
}

function RepairChangePreview({ changes }) {
  return (
    <div className="repair-preview" aria-label="Proposed plan changes">
      <h4>Proposed changes</h4>
      {changes.length ? <ul>
        {changes.map(({ label, before, after }) => <li key={label}>
          <b>{label}</b><br />
          <del>{before}</del><br />
          <ins>{after}</ins>
        </li>)}
      </ul> : <p className="muted small">No saved brief fields changed. Review the refined story direction before starting a new plan.</p>}
      <p className="muted small">Starting this plan does not render frames or motion. The previous export and review stay unchanged.</p>
    </div>
  );
}

function ReadinessCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const check = async () => {
    setChecking(true);
    setError('');
    try {
      const response = await fetch('/api/readiness');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not check this Mac.');
      setResult(data);
    } catch (failure) {
      setResult(null);
      setError(failure.message);
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="readiness">
      <b>Check Mac setup before rendering</b>
      <p className="muted small">Read-only check for local tools, models, GPU access, caption support, and free disk space.</p>
      <button type="button" className="ghost" disabled={checking} onClick={check}>{checking ? 'Checking…' : result ? 'Check again' : 'Run readiness check'}</button>
      {error && <p className="bad small" role="alert">{error}</p>}
      {result && <div aria-live="polite">
        <p className={result.ready ? 'readiness-ok' : 'bad'}>{result.ready ? 'This Mac is ready for local rendering.' : 'Some requirements need attention before rendering.'}</p>
        <ul className="readiness-checks">{result.checks.map((item, index) => (
          <li className={`readiness-${item.status}`} key={`${item.name}-${index}`}>
            <b>{item.status.toUpperCase()}</b> {item.name}{item.fix && <span className="muted"> · Fix: {item.fix}</span>}
          </li>
        ))}</ul>
        {result.error && <p className="muted small">{result.error}</p>}
      </div>}
    </section>
  );
}

const TIPS = [
  'Tip: name who does what, then the ending. "A fox chases a paper boat, then sails away" plans far better than a mood.',
  'Tip: Look sets the style. Cartoon and Night cartoon skip the food-kitchen defaults.',
  'Tip: the first still decides the whole clip. If it looks wrong, Stop and re-plan; it saves minutes.',
  'Tip: 10 seconds is two or three shots. Keep one clear action per shot.',
  'Tip: the Setting box overrides the scene, e.g. "a rainy rooftop garden".',
];

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
            <div className="cap"><b>Shot {i + 1}</b> · {sh.seconds}s · {clip(i + 1) ? 'clip ready' : still(i + 1)?.verified === false ? 'review required; not approved' : still(i + 1) ? 'first frame ready' : 'queued'}</div>
            {still(i + 1)?.reviewReason && <div className="muted small">{still(i + 1).reviewReason}</div>}
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
  const [duplicateSession, setDuplicateSession] = useState(null);
  const job = selectedId == null ? { status: 'idle' } : selectedId === live.id ? live : stored?.id === selectedId ? stored : { status: 'idle' };
  const anyRunning = ['running', 'stopping'].includes(live.status);
  const maxSeconds = me?.maxSeconds ?? 60;
  const loadSessions = () => fetch('/api/sessions').then((r) => r.json()).then(setSessions).catch(() => {});
  useEffect(() => {
    loadSessions();
    fetch('/api/me').then((r) => r.ok ? r.json() : null).then(setMe).catch(() => {});
  }, [live.id, live.status]);
  const [composerDraft] = useState(readComposerDraft);
  const [prompt, setPrompt] = useState(() => composerDraft?.prompt || '');
  const [seconds, setSeconds] = useState(() => composerDraft?.seconds || 10);
  const planDisabled = me?.draftsLeft === 0 || seconds > maxSeconds;
  const [orientation, setOrientation] = useState(() => composerDraft?.orientation || 'vertical');
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
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('studio-theme', theme); } catch {} }, [theme]);
  const [setting, setSetting] = useState(() => composerDraft?.setting || '');
  useEffect(() => {
    writeComposerDraft({ prompt, seconds, orientation, audio, ending, look, setting });
  }, [prompt, seconds, orientation, audio, ending, look, setting]);
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
  const sequenceSeen = useRef('');
  useEffect(() => {
    const icon = { running: '⏳', done: '✅', failed: '⚠️', cancelled: '⏹' }[job.status] || '';
    document.title = `${icon} iShorts`;
    if (prevStatus.current === 'running' && job.status === 'done') { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6); o.start(); o.stop(c.currentTime + 0.6); } catch { /* sound blocked */ } }
    if (prevStatus.current === 'running' && job.status !== 'running' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('iShorts', { body: job.status === 'done'
        ? (job.kind === 'render' ? 'Your video is ready.' : job.kind === 'sequence-motion' ? 'The approved shot motion is ready.' : 'Your plan is ready to review.')
        : 'Job ' + job.status });
    }
    prevStatus.current = job.status;
  }, [job.status]);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job.lines?.length, showLog]);
  // A provisional QA score only means a human rating is pending; it is not a block.
  const notes = notesOf(job.lines);
  const blocked = isBlocked(notes);
  const busy = anyRunning || sending;
  // When a plan is waiting for first frames, the one primary action is on the plan; the composer becomes secondary.
  const planAwaiting = Boolean(job.plan) && job.status === 'done' && job.kind === 'draft' && !blocked;
  const phase = jobState(job, blocked, live.busyElsewhere);
  const choice = choiceOf(job.lines);

  // Auto mode can prepare a plan, but attended sequencing pauses for every explicit shot-frame approval.
  useEffect(() => {
    if ((job.options?.unattended && !retake.current) || !autoRef.current || !['done', 'failed', 'cancelled'].includes(job.status)) return;
    const key = job.id + ':' + job.kind + ':' + job.status; if (autoSeen.current === key) return; autoSeen.current = key;
    if (job.status !== 'done' || blocked || !job.scenario) { autoRef.current = false; return; }
    const go = (url) => post(url, { scenario: job.scenario, sessionId: job.id }).then((r) => pickProject(r.id)).catch((e) => { autoRef.current = false; setErr(e.message); });
    if (job.kind === 'draft') go('/api/stills');
    else if (job.kind === 'stills') {
      if (job.sequence?.active) { autoRef.current = false; retake.current = false; }
      else if (pauseOn && !retake.current) autoRef.current = false;
      else { retake.current = false; go('/api/render'); }
    }
    else autoRef.current = false;
  }, [job.status, job.kind, job.id]);
  useEffect(() => {
    if (job.kind !== 'sequence-motion' || job.status !== 'done' || job.sequence?.stage !== 'motion') return;
    const key = `${job.id}:${job.sequence.currentShot}:${job.sequence.stage}`;
    if (sequenceSeen.current === key) return;
    sequenceSeen.current = key;
    post('/api/sequence/next', { scenario: job.scenario, sessionId: job.id })
      .then((result) => { if (result.id) pickProject(result.id); })
      .catch((error) => setErr(error.message));
  }, [job.status, job.kind, job.id, job.scenario, job.sequence?.currentShot, job.sequence?.stage]);
  // Up next: when a job ends and Auto mode is not still chaining it, start the first queued idea.
  const nextSeen = useRef('');
  useEffect(() => {
    if (!autoNext || anyRunning || !job.status || job.status === 'idle') return;
    const key = job.id + ':' + job.kind + ':' + job.status; if (nextSeen.current === key) return; nextSeen.current = key;
    if (autoRef.current && job.status === 'done') return; // Auto mode will continue this video first
    if (!readQueue().length) return;
    const t = setTimeout(() => {
      const q = readQueue(); if (!q.length) return;
      writeQueue(q.slice(1)); setPrompt(q[0]); draftWith({ prompt: q[0] }, { ignoreDuplicate: true });
    }, 1500);
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
  const draftWith = (extra = {}, { ignoreDuplicate = false, approved = false } = {}) => {
    if (planDisabled && !extra.repair && !extra.retrySessionId) return;
    if (!ignoreDuplicate) {
      const duplicate = findMatchingSession(extra.prompt || prompt, sessions, selectedId);
      if (duplicate) { setDuplicateSession(duplicate); return; }
    }
    setDuplicateSession(null);
    return run(async () => {
      const runUnattended = !extra.repair && me?.canRunUnattended && unattended;
      const r = await post('/api/draft', { prompt, seconds, orientation, audio, ending, look, setting, unattended: runUnattended, refine: !approved, requestId: globalThis.crypto.randomUUID(), ...extra });
      if (r.decision === 'needs_choices') { setRefinement(r.refinement); return; }
      if (r.options?.storyPrompt) setPrompt(r.options.storyPrompt);
      if (r.options?.ending) setEnding(r.options.ending);
      setRefinement(null);
      autoRef.current = !extra.repair && autoOn && !runUnattended; autoSeen.current = ''; pickProject(r.id);
    })();
  };
  // The normal Create action proposes a complete story brief first. The user
  // confirms the brief (or chooses a direction) before the local director runs.
  const draft = () => refineIdea();
  const render = run(async () => { const r = await post('/api/render', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const stills = run(async () => { const r = await post('/api/stills', { scenario: job.scenario, sessionId: job.id }); pickProject(r.id); });
  const resumeUnattended = run(async () => { const r = await post('/api/stills', { scenario: job.scenario, sessionId: job.id, resumeUnattended: true }); pickProject(r.id); });
  const approveFrames = async (selections) => {
    try { return await post('/api/approve-frames', { scenario: job.scenario, sessionId: job.id, selections }); }
    catch (error) { setErr(error.message); return null; }
  };
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
    setDuplicateSession(null);
    exampleRequest.current++; setExampleBusy(false); setExampleInfo(null);
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
  const newChat = () => { invalidateRefinement(); setDuplicateSession(null); exampleRequest.current++; setExampleBusy(false); setExampleInfo(null); projectRequest.current++; pickProject(null); setProjectsOpen(false); setStored(null); setExampleContext(false); setPrompt(''); setEnding(''); setSetting(''); setErr(''); };
  const rename = run2(async (id, name) => { await post('/api/sessions/rename', { id, name }); await loadSessions(); });
  const remove = run2(async (id) => { await post('/api/sessions/delete', { id }); if (id === selectedId) newChat(); await loadSessions(); });
  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim() && !busy && !planDisabled) { e.preventDefault(); draft(); } };
  const attachReference = (shot, dataUrl) => post('/api/reference-frame', {
    scenario: job.scenario, sessionId: job.id, shot, dataUrl,
  });

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
              {(() => { const w = watchdogLabel(job.watchdog, job.status); return w && <p className={`hint ${w.tone}`}>{w.text}</p>; })()}
              {running && <button className="ghost" onClick={cancel}>Stop</button>}
              {(() => { const help = job.kind === 'render' && !blocked ? failureHelp({ status: job.status, kind: job.kind, error: job.error, watchdog: job.watchdog, technicalQa: job.technicalQa, hasScenario: Boolean(job.scenario) }) : null; return help ? <FailureCard help={help} busy={busy} onRetry={render} /> : null; })()}
              {job.status === 'failed' && !blocked && job.kind !== 'render' && <p className="bad">{job.technicalQa?.status === 'failed' ? 'The final file failed technical QA.' : job.error}</p>}
              {notes.length > 0 && <ul className="notes">{notes.filter((n) => !(choice && n.startsWith('BLOCKED'))).map((n, i) => <li key={i} className={n.startsWith('BLOCKED') ? 'bad' : n.startsWith('Fixed') ? 'good' : 'muted'}>{n.startsWith('Fixed') ? '✓ ' + n : n}</li>)}</ul>}
              {['failed', 'cancelled', 'interrupted'].includes(job.status) && job.kind === 'draft' && !choice && <button className="primary" disabled={busy} onClick={retryPlanning}>Retry planning in this project</button>}
              {choice && job.status !== 'running' && <BlockedCard lines={job.lines || []} events={job.events} choice={choice} busy={anyRunning} onRetry={() => draftWith({ retrySessionId: job.id, prompt: job.options?.storyPrompt || job.prompt, originalPrompt: job.options?.originalPrompt || job.prompt }, { ignoreDuplicate: true })} onAnyway={() => draftWith({ allowRepeat: true, allowDuplicate: true }, { ignoreDuplicate: true })} onEdit={() => document.querySelector('.composer textarea')?.focus()} />}
              {job.status === 'cancelled' && <p className="muted">Stopped.</p>}
              {job.status === 'interrupted' && job.kind !== 'render' && <p className="bad">{job.error}</p>}
              {job.sequence?.continuationError && <p className="bad">{job.sequence.continuationError}</p>}
              {job.kind === 'stills' && job.status === 'failed' && job.sequence?.active &&
                <button className="primary" disabled={busy} onClick={stills}>Retry shot {job.sequence.currentShot} frame preparation</button>}
              {job.kind === 'sequence-motion' && (['failed', 'cancelled'].includes(job.status) || job.sequence?.continuationError) && job.sequence?.stage === 'motion' &&
                <button className="primary" disabled={busy} onClick={retrySequence}>Retry approved shot motion</button>}
              {['failed', 'interrupted'].includes(job.status) && me?.canRunUnattended && job.options?.unattended && job.scenario && job.plan && <button className="primary" disabled={busy} onClick={resumeUnattended}>Resume automatically</button>}
              {job.plan && <PlanCard job={job} idea={job.prompt} onStills={stills} onReference={attachReference} disabled={busy || blocked} notes={notes} />}
              {job.plan && supportsBabyBallPreview(job) && <BabyBallPreviewCard />}
              {job.plan && <FramesBlock job={job} plan={job.plan?.plan || job.plan} onStills={stills} onRegen={regen} onRender={render} onApproveFrames={approveFrames} busy={busy || me?.rendersLeft === 0} blocked={blocked} anyRunning={anyRunning} rendersLeft={me?.rendersLeft ?? null} />}
              {job.plan && <RenderTimer job={job} plan={job.plan?.plan || job.plan} />}
              {(job.attempts || []).length > 0 && <details className="card"><summary>Previous planning attempts ({job.attempts.length})</summary>{job.attempts.map((attempt, index) => {
                const previousPlan = attempt.plan?.plan || attempt.plan;
                return <section key={`${attempt.startedAt}-${index}`}><p><b>Attempt {index + 1}</b> · {attempt.status}{attempt.error ? ` · ${attempt.error}` : ''}</p>
                  {previousPlan?.shots && <><p><b>{previousPlan.title || 'Saved story plan'}</b> · {attempt.options?.seconds || previousPlan.shots.reduce((sum, shot) => sum + (Number(shot.seconds) || 0), 0)}s</p><ShotPlan shots={previousPlan.shots} notes={[]} /></>}
                  {attempt.video && <><Player src={'/media?p=' + encodeURIComponent(attempt.video)} /><p><a href={'/media?p=' + encodeURIComponent(attempt.video)} download>Download this attempt's export</a></p></>}
                  {attempt.scenario && <p className="muted small">Saved scenario: {attempt.scenario}</p>}
                  {attempt.lines?.length > 0 && <pre className="log">{attempt.lines.join('\n')}</pre>}
                </section>;
              })}</details>}
              {job.plan && <RenderLive job={job} plan={job.plan?.plan || job.plan} sessions={sessions} />}
              {job.status === 'done' && job.kind === 'draft' && !job.plan && <p className="muted">Plan saved: {job.scenario}</p>}
              {job.previousVideo && job.previousVideo !== job.video && <details className="card"><summary>Previous export</summary><Player src={'/media?p=' + encodeURIComponent(job.previousVideo)} /></details>}
              {job.video && <ExportReview key={job.video} job={job} review={review.video === job.video ? review : { status: 'pending' }} weak={weak} notes={notes} busy={busy || refining} renderDisabled={me?.rendersLeft === 0} onRetake={retakeShot} onRepair={prepareRepair} onCompare={me?.canCompare && sessions.filter((p) => p.hasVideo).length > 1 ? () => setCompare(true) : undefined} />}
              <UpNext show={running} autoNext={autoNext} setAutoNext={setAutoNext} />
              {me?.canSeeLog && <button className="ghost" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} log</button>}
              {showLog && <pre className="log" ref={logRef}>{(job.lines || []).join('\n')}</pre>}
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
        {anyRunning && <div className="hint tip">Your Mac is making another video right now{live.prompt ? ` ("${live.prompt.slice(0, 40)}...")` : ''}. Up next is saved in this browser. Leave Studio open for automatic start.</div>}
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
            ? <button className="primary" disabled={!prompt.trim()} title="Your Mac is busy with another video. This adds your idea to Up next." onClick={() => { writeQueue([...readQueue(), prompt.trim()].slice(0, 10)); setAutoNext(true); setPrompt(''); }}>Add to Up next</button>
            : <button className={planAwaiting ? 'ghost composer-secondary' : 'primary'} onClick={draft} disabled={!prompt.trim() || sending || refining || planDisabled} title={planAwaiting ? 'Starts a new story from this idea. Your current plan is kept.' : undefined}>{refining ? 'Refining your story…' : unattended && me?.canRunUnattended ? 'Prepare video plan' : 'Review story'}</button>}
        </div>
        <p className="muted small">Your idea and settings are saved locally in this browser.</p>
        <p className="stage-help" id="stage-help">{simple || auto
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
