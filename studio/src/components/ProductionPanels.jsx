import { useEffect, useRef, useState } from 'react';
import CharacterReferences from '../CharacterReferences.jsx';
import HostedShotSimulation from '../HostedShotSimulation.jsx';
import MotionTakeReview from '../MotionTakeReview.jsx';
import { clipProgress } from '../clip-progress.js';
import { readPreflightApproval, writePreflightApproval } from '../draft-storage.js';
import { takeControls } from '../motion-takes.js';
import { nowLine, shotFixes } from '../pipeline-lines.js';
import { prerenderChecklist } from '../prerender-checklist.js';
import { clipsOf, estFor, fmt, planEstimate } from '../render-estimate.js';
import { planPromptChanges } from '../review-recommendations.js';
import { plainBlock } from './StoryComposer.jsx';

const STAGES = [
  ['Story', /Reading your idea|Drafting the story|Fixing the story|Checking the plan/],
  ['First frames', /Generating stills/],
  ['Motion', /Generating motion clips/],
  ['Sound', /Recording narration|Mixing sound/],
  ['Finishing', /Finishing and exporting|Quality checks/],
];

export const STAGE_NAMES = ['Plan video', 'Review first frames', 'Render video', 'Review export'];

export function stageIndex(job) {
  if (!job.status || job.status === 'idle') return -1;
  if (job.kind === 'draft') return job.status === 'done' && job.plan ? 1 : 0;
  if (job.kind === 'stills') return 1;
  if (job.kind === 'sequence-motion') return job.sequence?.stage === 'ready' ? 1 : 2;
  if (job.kind === 'render') return job.status === 'done' && job.video ? 3 : 2;
  return 0;
}

export function StageBar({ job }) {
  const cur = stageIndex(job);
  if (cur < 0) return null;
  return (
    <ol className="stagebar" aria-label="Progress through the film">
      {STAGE_NAMES.map((n, i) => (
        <li key={n} aria-current={i === cur ? 'step' : undefined} className={i < cur ? 'done' : i === cur ? 'now' : ''}>
          <span className="n">{i < cur ? '✓' : i + 1}</span> {n}
        </li>
      ))}
    </ol>
  );
}

export function StepTrack({ job }) {
  if (job.status !== 'running') return null;
  const want = 5;
  let cur = job.kind === 'draft' ? 0 : 1;
  (job.steps || []).forEach((s) => {
    const i = STAGES.findIndex(([, re]) => re.test(s));
    if (i > cur) cur = i;
  });
  if (job.kind === 'stills') cur = 1;
  else if (job.kind === 'sequence-motion') cur = 2;
  else if (job.kind === 'draft') cur = 0;
  else {
    const MARK = [
      [/^Step 3\/4|Reusing image|First frame ready/, 1],
      [/Generating local LTX motion/, 2],
      [/^Step 4\/4|Effects placed/, 3],
      [/Wrote qa block|Contact sheet:|Timing: checks/, 4],
    ];
    cur = 1;
    (job.lines || []).forEach((l) => MARK.forEach(([re, n]) => { if (re.test(l) && n > cur) cur = n; }));
  }
  const tries = (job.lines || []).filter((l) => /^Attempt \d+\/\d+/.test(l)).length;
  return (
    <ol className="steptrack">
      {STAGES.slice(0, want).map(([name], i) => (
        <li key={name} className={i < cur ? 'done' : i === cur ? 'now' : ''}>
          {i < cur ? '✓ ' : ''}{name}{i === 0 && tries > 1 && i === cur ? ` (try ${tries}/3)` : ''}
        </li>
      ))}
    </ol>
  );
}

export function RenderTimer({ job, plan }) {
  const [now, setNow] = useState(Date.now());
  const [files, setFiles] = useState({ clips: [] });
  const running = job.status === 'running' && job.kind === 'render';
  const n = clipsOf(plan?.shots);
  const [learned, setLearned] = useState(null);
  useEffect(() => { fetch('/api/learning').then((r) => r.json()).then((j) => setLearned(j.calibration?.cycleSec || null)).catch(() => {}); }, []);
  useEffect(() => { if (!running) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => {
    if (!running || !job.scenario) return undefined;
    let stop = false;
    const load = () => fetch('/api/live-files?scenario=' + encodeURIComponent(job.scenario)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !stop) setFiles(j); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [running, job.scenario]);
  if (job.kind !== 'render' || !n || !job.startedAt) return null;
  if (!running) {
    if (job.status !== 'done') return null;
    const est = planEstimate(n, job.options?.quality);
    return <div className="timer done">Finished. The estimate for {n} clip{n > 1 ? 's' : ''} was about {fmt(est.mid)}; the real time is in the log.</div>;
  }
  const done = new Map();
  (files.progressClips || []).filter((c) => c.t >= job.startedAt).forEach((c) => done.set(c.n, c));
  const k = done.size;
  const last = k ? Math.max(...[...done.values()].map((c) => c.t)) : 0;
  const E = estFor(job.options?.quality);
  const prior = (job.options?.quality === 'high' ? null : learned) || E.cycle;
  const cycle = k ? Math.min(E.cycleHigh * 1.5, Math.max(E.cycleLow * 0.7, (last - job.startedAt - E.start * 1000) / 1000 / k)) : prior;
  const endAt = job.startedAt + (E.start + n * cycle + E.finish) * 1000;
  const remaining = (endAt - now) / 1000;
  const stillRendering = remaining <= 5 && k < n;
  const elapsed = (now - job.startedAt) / 1000;
  const spread = k ? 0.06 : 0.12;
  const lo = remaining * (1 - spread);
  const hi = remaining * (1 + spread) + (k ? 0 : 30);
  const pct = Math.min(99, (elapsed / (elapsed + Math.max(remaining, 1))) * 100);
  return (
    <div className="timer" role="status">
      <div className="tnums">
        <span><b>{fmt(elapsed)}</b> elapsed</span>
        <span>{remaining > 5 ? <>about <b>{fmt(remaining)}</b> left <span className="muted">({fmt(lo)} to {fmt(hi)})</span></> :
          <b>{stillRendering ? 'Still rendering, past the estimate' : 'Finishing up'}</b>}</span>
        <span className="muted">{k}/{n} clips{remaining > 5 && ` · est. finish ${new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span>
      </div>
      <div className="bar"><div className="fill" style={{ width: pct + '%' }} /></div>
      {n > 1 && <ol className="clipstrip" aria-label="Clip progress">{clipProgress({ total: n, doneShots: [...done.values()].map((c) => c.shot), startedAt: job.startedAt, lastDoneAt: last, now, cycleSec: cycle, startSec: E.start }).map((c) => (
        <li key={c.shot} className={`${c.state}${c.slow ? ' slow' : ''}`} title={c.state === 'active' ? `Clip ${c.shot} rendering for ${fmt(c.elapsedSec)}${c.slow ? ', longer than usual' : ''}` : `Clip ${c.shot} ${c.state === 'done' ? 'finished' : 'waiting'}`}>
          <span>{c.shot}</span>{c.state === 'active' && <em>{fmt(c.elapsedSec)}</em>}
        </li>))}</ol>}
      <div className="muted small">{k ? `Based on your first ${k} clip${k > 1 ? 's' : ''} (${fmt(cycle)} each).` :
        `Estimate from past runs on this Mac (about ${fmt(prior)} per clip). It updates after the first clip.`} Retries add time.</div>
    </div>
  );
}

const ls = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
};

function clap() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const b = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 300);
    const s = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = 0.25;
    s.buffer = b;
    s.connect(g);
    g.connect(c.destination);
    s.start();
  } catch { /* sound blocked */ }
}

export function DirectorsChair({ job, plan, stills, clipsDone, sessions, remainingSec }) {
  const id = job.id;
  const runKey = id + '-' + job.startedAt;
  const [thumb, setThumb] = useState(() => ls.get('thumb-' + id, null));
  const [title, setTitle] = useState(() => ls.get('title-' + id, null));
  const [guess, setGuess] = useState(() => ls.get('guess-' + runKey, null));
  const [mins, setMins] = useState('');
  const [rated, setRated] = useState(() => ls.get('rated-sessions', []));
  const [past, setPast] = useState(null);
  const [skip, setSkip] = useState([]);
  const [clapN, setClapN] = useState(0);
  const prevClips = useRef(clipsDone);
  useEffect(() => {
    if (clipsDone > prevClips.current) { setClapN((n) => n + 1); clap(); }
    prevClips.current = clipsDone;
  }, [clipsDone]);
  const candidates = (sessions || []).filter((s) => s.hasVideo && s.id !== id && !rated.includes(s.id));
  useEffect(() => {
    if (!past && candidates.length) {
      const s = candidates[Math.floor(Math.random() * candidates.length)];
      fetch('/api/sessions/' + s.id).then((r) => (r.ok ? r.json() : null)).then((j) => j && j.video && setPast(j)).catch(() => {});
    }
  }, [candidates.length, past]);
  const titles = [...new Set([plan.title, plan.hook && plan.hook.split(/[,.]/)[0], plan.payoff && plan.payoff.replace(/\.$/, '')].filter(Boolean).map((t) => t.slice(0, 60)))];
  const missions = [
    stills.length > 0 && !thumb && 'thumb',
    job.kind === 'render' && !guess && 'guess',
    titles.length > 1 && !title && 'title',
    past && 'rate',
  ].filter(Boolean).filter((m) => !skip.includes(m));
  const m = missions[0];
  const rate = (r) => fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: past.id, rating: r }) })
    .finally(() => { const n = [...rated, past.id]; ls.set('rated-sessions', n); setRated(n); setPast(null); });
  return (
    <div className="chair">
      <div className="chairhead"><span className={'clapper' + (clapN ? ' snap' : '')} key={clapN}>🎬</span><b>Director&apos;s chair</b><span className="muted small">{clipsDone ? `${clipsDone} take${clipsDone > 1 ? 's' : ''} in the can` : 'cameras warming up'}</span></div>
      {guess && <p className="small muted">Your bet: done in {guess.min} min{remainingSec != null ? ` · the Studio says about ${Math.max(1, Math.round(remainingSec / 60))} min left` : ''}.</p>}
      {!m && <p className="muted small">All caught up. Sit back: your frames appear above as they develop.</p>}
      {m === 'thumb' && (<div><p>Pick the cover frame for this Short.</p><div className="pick">{stills.map((s) => <img key={s.p} src={'/media?p=' + encodeURIComponent(s.p)} onClick={() => { ls.set('thumb-' + id, s.p); setThumb(s.p); }} alt={'Shot ' + s.shot} />)}</div></div>)}
      {m === 'guess' && (<div><p>Place your bet: how many minutes until it&apos;s done?</p><div className="row"><input type="number" min="1" max="99" value={mins} onChange={(e) => setMins(e.target.value)} placeholder="min" /><button className="ghost" disabled={!mins} onClick={() => { const g = { min: +mins, at: Date.now() }; ls.set('guess-' + runKey, g); setGuess(g); }}>Lock it in</button></div></div>)}
      {m === 'title' && (<div><p>Which title fits best?</p><div className="row wrap">{titles.map((t) => <button key={t} className="ghost" onClick={() => { ls.set('title-' + id, t); setTitle(t); }}>{t}</button>)}</div></div>)}
      {m === 'rate' && (<div><p>Quick one: rate an earlier video. It teaches the Studio what you like.</p><video className="pastvid" src={'/media?p=' + encodeURIComponent(past.video)} muted autoPlay loop playsInline /><div className="row"><button onClick={() => rate('up')}>👍</button><button onClick={() => rate('down')}>👎</button></div></div>)}
      {m && <button className="link" onClick={() => setSkip([...skip, m])}>skip</button>}
    </div>
  );
}

export function guessResult(job) {
  const g = ls.get('guess-' + job.id + '-' + job.startedAt, null);
  if (!g || job.status !== 'done' || !job.updatedAt) return null;
  const real = (job.updatedAt - g.at) / 60000;
  const off = Math.abs(real - g.min);
  return off < 1 ? `🎯 Your bet of ${g.min} min was spot on!` : `Your bet: ${g.min} min. Actual: ${real.toFixed(1)} min (${off.toFixed(1)} min ${real > g.min ? 'longer' : 'shorter'}).`;
}

export function LearnedCard() {
  const [l, setL] = useState(null);
  useEffect(() => { fetch('/api/learning').then((r) => r.json()).then(setL).catch(() => {}); }, []);
  if (!l || (!l.drafts && !l.renders && !l.checkpointReviews && !l.machineReviews)) return null;
  const up = Object.values(l.ratings || {}).reduce((n, r) => n + r.up, 0);
  const down = Object.values(l.ratings || {}).reduce((n, r) => n + r.down, 0);
  return (
    <div className="card learned">
      <b>What the Studio has recorded on this Mac</b>
      <p className="muted small">{l.drafts} plans · {l.renders} finished renders · {up} good / {down} needs-work ratings{l.guidedRuns ? ` · local story models used review evidence in ${l.guidedRuns} runs` : ''}{l.calibration.cycleSec ? ` · measured ${fmt(l.calibration.cycleSec)} per clip (${l.calibration.samples} renders)` : ''}</p>
      {l.gateEvents > 0 && <p className="muted small">Recorded {l.gateEvents} gate outcomes, {l.scenePlans} scene plans, and {l.machineReviews || 0} hash-checked final-file screens. These show where ideas passed, needed repair, or were blocked.</p>}
      {l.topBlockers.length > 0 && <ul className="small">{l.topBlockers.map((b) => <li key={b.reason}>Most common block ({b.count}x): {plainBlock(b.reason)}</li>)}</ul>}
      {l.recentGateEvents?.length > 0 && <ul className="small">{l.recentGateEvents.slice(-3).map((event, i) => <li key={i}>{event.gate}: {event.outcome} · {plainBlock(event.message)}</li>)}</ul>}
      {l.recentMachineReviews?.some((review) => review.likelyBelow4?.length) && <p className="muted small">Latest automated screen flagged: {l.recentMachineReviews.slice().reverse().find((review) => review.likelyBelow4?.length)?.likelyBelow4.join(', ')}. This is an advisory cue for your review, not an artistic score.</p>}
      {l.recentNotes.length > 0 && <ul className="small">{l.recentNotes.map((n, i) => <li key={i}>{n.rating === 'up' ? '👍' : '👎'} {n.note}</li>)}</ul>}
      {l.recentCheckpointReviews?.length > 0 && <div className="small"><b>{l.checkpointReviews} human checkpoint review{l.checkpointReviews === 1 ? '' : 's'} recorded</b>
        <ul>{l.recentCheckpointReviews.map((item, i) => <li key={i}>{item.title || 'Untitled export'} · payoff {item.payoff.replace('-', ' ')}{item.notes ? ` · ${item.notes}` : ''}</li>)}</ul>
        <p className="muted">These are tied to specific exports. They do not change prompts or scores automatically.</p></div>}
      <p className="muted small">This log records ideas, scenes, gates, QA and your export-specific reviews. Local story models can consult repeated blockers and your notes on later ideas and plans. They cannot override your request or pass a gate; reviews do not retrain FLUX or LTX, and production defaults change only after measured checks.</p>
    </div>
  );
}

export function ShotPlan({ shots, notes, events }) {
  const fixes = (n) => shotFixes(n, notes, events, plainBlock);
  return (
    <ol className="shotplan">
      {shots.map((s, i) => (
        <li key={i} className="shotcard">
          <div className="shothead"><b>Shot {i + 1}</b><span className="muted">{s.seconds}s</span></div>
          <p><span className="k">Action</span> {s.motionPrompt || s.imagePrompt}</p>
          {s.imagePrompt && s.motionPrompt && <p className="muted"><span className="k">First frame</span> {s.imagePrompt}</p>}
          {s.sound && <p className="muted"><span className="k">Sound</span> {s.sound}</p>}
          {s.narration && <p className="muted"><span className="k">Voice</span> {s.narration}</p>}
          {fixes(i + 1).map((f) => <p key={f} className="shotfix"><span className="k">Fix</span> {f}</p>)}
        </li>
      ))}
    </ol>
  );
}

export function PrerenderChecklist({ checklist }) {
  const mark = { ok: '\u2713', todo: '\u2022', blocked: '\u2717' };
  return (
    <ul className="precheck" aria-label="Before you render">
      {checklist.items.map((i) => <li key={i.id} className={i.state}><span aria-hidden="true">{mark[i.state]}</span> <b>{i.label}</b> <span className="muted small">{i.detail}</span></li>)}
    </ul>
  );
}

export function FramesReview({ job, plan, files, onStills, onRegen, onRender, onApproveFrames, busy, blocked, anyRunning = false, rendersLeft = null }) {
  const [choices, setChoices] = useState({});
  const [approving, setApproving] = useState(false);
  const shots = plan.shots || [];
  const sequence = job.sequence?.stage ? job.sequence : null;
  const sequential = Boolean(sequence?.active && sequence.stage === 'review');
  const shotNumbers = sequential ? [sequence.currentShot] : shots.map((_, i) => i + 1);
  const needsHumanReview = sequential || Boolean(files.needsHumanReview);
  useEffect(() => setChoices({}), [job.id, job.scenario, job.updatedAt]);
  const still = (n) => [...(files.stills || [])].reverse().find((f) => f.shot === n);
  if (!shots.length) return null;
  if (!(files.stills || []).length && !needsHumanReview) {
    return <section className="card"><h3>Review first frames</h3><p>This frame set has no verified selection. Make first frames to continue.</p><button className="primary" disabled={busy || blocked} onClick={onStills}>Make first frames</button></section>;
  }
  const url = (f) => '/media?p=' + encodeURIComponent(f.p) + '&v=' + Math.round(f.t);
  const all = shots.every((_, i) => still(i + 1));
  const est = planEstimate(clipsOf(shots), job.options?.quality);
  const checklist = prerenderChecklist({ shots, hasStill: (n) => Boolean(still(n)), needsHumanReview, blocked, otherJobRunning: anyRunning, rendersLeft, clips: clipsOf(shots) });
  const pendingFrames = files.pendingFrames || [];
  const candidateForShot = (n) => pendingFrames.find((frame) => frame.shot === n);
  const candidateChoice = (n) => {
    const frame = candidateForShot(n);
    if (!frame) return null;
    const selected = choices[n] || frame.selectedCandidate;
    return frame.candidates.find((candidate) => candidate.candidate === selected) || frame.candidates[0];
  };
  const selectCandidate = (shot, candidate) => setChoices((current) => ({ ...current, [shot]: candidate }));
  const completeCandidates = shotNumbers.every((shot) => (candidateForShot(shot)?.candidates || []).length > 0);
  const approve = async () => {
    if (!onApproveFrames || approving || !completeCandidates) return;
    setApproving(true);
    try {
      const result = await onApproveFrames(shotNumbers.map((shot) => ({
        shot, candidate: candidateChoice(shot)?.candidate,
      })));
      if (result?.ok) {
        const response = await fetch('/api/live-files?scenario=' + encodeURIComponent(job.scenario));
        if (response.ok) window.dispatchEvent(new CustomEvent('studio-frames-approved', { detail: await response.json() }));
      }
    } finally {
      setApproving(false);
    }
  };
  return (
    <div className="card frames">
      <h3>First frames</h3>
      <p className="muted small">{sequential
        ? `Shot ${sequence.currentShot} of ${sequence.shotCount}. Approve this frame to render its motion; Studio will use that verified clip's final frame when creating the next shot.`
        : needsHumanReview
        ? 'The local vision gate could not approve every frame. Choose one candidate for every shot; your explicit approval is required before motion can start.'
        : 'Studio generates and checks three local candidates per shot, then pins the selected frame. Review every frame before the long motion step; a typical three-candidate set takes about 75 seconds.'}</p>
      {files.pendingFramesError && <p className="bad">{files.pendingFramesError}</p>}
      <PrerenderChecklist checklist={checklist} />
      <div className="tiles">
        {shotNumbers.map((shot) => {
          const sh = shots[shot - 1];
          return <div className="tile" key={shot}>
            {needsHumanReview && candidateChoice(shot)
              ? <img src={url(candidateChoice(shot))} alt={'Shot ' + shot + ' candidate ' + candidateChoice(shot).candidate} />
              : still(shot) ? <img src={url(still(shot))} alt={'Shot ' + shot} /> : <div className="ph">not made yet</div>}
            <div className="cap"><b>Shot {shot}</b> · {sh.seconds}s</div>
            {needsHumanReview && candidateForShot(shot)?.candidates.map((candidate) => (
              <label className="small" key={candidate.candidate} style={{ display: 'block', marginTop: 6 }}>
                <input type="radio" name={'frame-' + shot} checked={candidateChoice(shot)?.candidate === candidate.candidate}
                  onChange={() => selectCandidate(shot, candidate.candidate)} />
                Candidate {candidate.candidate} · {candidate.status}{candidate.reason ? `: ${candidate.reason}` : ''}
              </label>
            ))}
            <button className="ghost" disabled={busy} onClick={() => onRegen(shot)}>Regenerate</button>
          </div>;
        })}
      </div>
      {needsHumanReview && <p><button className="primary" onClick={approve} disabled={busy || blocked || approving || !completeCandidates}>
        {approving ? 'Saving frame approval...' : sequential ? 'Approve shot and render motion' : 'Approve selected frames'}
      </button><span className="muted small">{sequential
        ? ' Review the candidate images and any visual concerns; the exact approved file is hash-checked before motion.'
        : ' This is a human override of the local visual gate. Review the image and listed concern for every shot.'}</span></p>}
      {!needsHumanReview && <p><button className="primary" onClick={onRender} disabled={busy || blocked || !all}>Approve frames and render video</button>
        <span className="muted small"> about {fmt(est.mid)} ({fmt(est.low)} to {fmt(est.high)}); reuses these frames. This is the long step: nothing is sent to motion until you press it.</span></p>
      }
    </div>
  );
}

export function FramesBlock({ job, plan, onStills, onRegen, onRender, onApproveFrames, busy, blocked, anyRunning, rendersLeft }) {
  const [files, setFiles] = useState({ stills: [] });
  const show = job.kind === 'stills' && job.status === 'done' && job.scenario;
  useEffect(() => {
    if (!show) return undefined;
    let stop = false;
    fetch('/api/live-files?scenario=' + encodeURIComponent(job.scenario)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !stop) setFiles(j); }).catch(() => {});
    return () => { stop = true; };
  }, [show, job.scenario, job.updatedAt]);
  useEffect(() => {
    const refresh = (event) => setFiles(event.detail);
    window.addEventListener('studio-frames-approved', refresh);
    return () => window.removeEventListener('studio-frames-approved', refresh);
  }, []);
  if (job.sequence?.stage === 'ready' && job.status === 'done') {
    return <section className="card"><h3>Shot sequence ready</h3>
      <p className="muted">Every first frame was approved before its motion rendered. The approved Shot 1 frame is also recorded as the shared identity reference for later scenes.</p>
      <button className="primary" onClick={onRender} disabled={busy || blocked}>Assemble final video</button>
    </section>;
  }
  if (!show) return null;
  return <FramesReview job={job} plan={plan} files={files} onStills={onStills} onRegen={onRegen} onRender={onRender} onApproveFrames={onApproveFrames} busy={busy} blocked={blocked} anyRunning={anyRunning} rendersLeft={rendersLeft} />;
}

export function PlanCard({ job, idea, onStills, onReference, onCharacter, disabled, notes }) {
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
      } catch (error) { setReferenceError(error.message); }
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
      <p className="muted">{shots.length} shots · {total}s · render estimate about {fmt(planEstimate(clipsOf(shots), job.options?.quality).mid)} ({fmt(planEstimate(clipsOf(shots), job.options?.quality).low)} to {fmt(planEstimate(clipsOf(shots), job.options?.quality).high)}) if nothing is retried</p>
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
      {onCharacter && <CharacterReferences key={job.id} job={job} canApply={canAttachReferences && !job.sequence?.active}
        disabled={disabled} onApply={async (id) => {
          const result = await onCharacter(id);
          setLocalReferences(result.references || []);
        }} />}
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

const TIPS = [
  'Tip: name who does what, then the ending. "A fox chases a paper boat, then sails away" plans far better than a mood.',
  'Tip: Look sets the style. Cartoon and Night cartoon skip the food-kitchen defaults.',
  'Tip: the first still decides the whole clip. If it looks wrong, Stop and re-plan; it saves minutes.',
  'Tip: 10 seconds is two or three shots. Keep one clear action per shot.',
  'Tip: the Setting box overrides the scene, e.g. "a rainy rooftop garden".',
];

export function RenderLive({ job, plan, sessions, canSimulateHostedShot, onRetakeMotion, onSequenceTake, onContinue, busy }) {
  const [files, setFiles] = useState({ stills: [], clips: [] });
  const [tip, setTip] = useState(0);
  const sc = job.scenario;
  const running = job.status === 'running';
  useEffect(() => {
    if (!sc) return undefined;
    let stop = false;
    const load = () => fetch('/api/live-files?scenario=' + encodeURIComponent(sc) + '&sessionId=' + encodeURIComponent(job.id)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !stop) setFiles(j); }).catch(() => {});
    load();
    if (!running) return () => { stop = true; };
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [sc, running, job.id, job.updatedAt]);
  useEffect(() => { if (!running) return undefined; const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 9000); return () => clearInterval(t); }, [running]);
  const shots = plan.shots || [];
  if (job.kind === 'sequence-motion' && job.status === 'done' && job.sequence?.stage === 'motion' && !job.options?.unattended) {
    const takes = takeControls(files.takes, job.sequence.currentShot);
    const estimate = estFor(job.options?.quality);
    return <>
      <MotionTakeReview key={job.id + ':' + job.startedAt} sessionId={job.id} />
      {canSimulateHostedShot && <HostedShotSimulation key={job.id + ':' + job.sequence.currentShot} sessionId={job.id} shot={job.sequence.currentShot} />}
      <button type="button" disabled={busy || !takes.canMakeNew} onClick={() => onSequenceTake()}>Another take</button>
      {takes.canMakeNew && <button type="button" className="ghost" disabled={busy} onClick={() => onSequenceTake(undefined, true)}
        title={`Render remaining seeds one at a time. Allow ${fmt(estimate.cycleLow)}–${fmt(estimate.cycleHigh)} per new clip.`}>Fill all three takes</button>}
      {takes.switches.filter((take) => !take.active).map((take) =>
        <button key={take.take} type="button" disabled={busy} onClick={() => onSequenceTake(take.take)}>{take.label}</button>)}
      <button type="button" className="primary" disabled={busy} onClick={onContinue}>
        {job.sequence.currentShot < job.sequence.shotCount ? 'Use take and continue' : 'Use take for assembly'}
      </button>
    </>;
  }
  if ((job.kind !== 'render' && job.kind !== 'stills') || !shots.length) return null;
  const still = (n) => [...files.stills].reverse().find((f) => f.shot === n);
  const selectedParts = (n) => (files.selectedClips || []).filter((f) => f.shot === n);
  const clip = (n) => selectedParts(n)[0];
  const url = (f) => '/media?p=' + encodeURIComponent(f.p) + '&v=' + (f.sha256 || Math.round(f.t));
  return (
    <div className="card live">
      <h3>{running ? 'Behind the scenes' : 'What was made'}</h3>
      {running && <p className="nowline">{nowLine(job.lines)}</p>}
      <div className="tiles">
        {shots.map((sh, i) => (
          <div className="tile" key={i}>
            {clip(i + 1) ? selectedParts(i + 1).map((part) =>
              <div key={part.sha256 + ':' + part.part}>
                {selectedParts(i + 1).length > 1 && <span className="muted small">Segment {part.part}</span>}
                <video src={url(part)} controls muted loop playsInline />
              </div>)
              : still(i + 1) ? <img className="develop" src={url(still(i + 1))} alt={'Shot ' + (i + 1)} />
              : <div className="ph">{running ? 'waiting...' : 'no file'}</div>}
            <div className="cap"><b>Shot {i + 1}</b> · {sh.seconds}s · {clip(i + 1) ? 'clip ready' : still(i + 1)?.verified === false ? 'review required; not approved' : still(i + 1) ? 'first frame ready' : 'queued'}</div>
            {still(i + 1)?.reviewReason && <div className="muted small">{still(i + 1).reviewReason}</div>}
            {sh.sound && <div className="muted small">Sound: {sh.sound}</div>}
            {!running && job.kind === 'render' && job.status === 'done' && clip(i + 1) && onRetakeMotion && (() => {
              const takes = takeControls(files.takes, i + 1);
              return <div className="takes">
                <div className="muted small">{takes.label}</div>
                <button type="button" className="ghost" disabled={busy || !takes.canMakeNew}
                  title="Same approved first frame, a new motion seed. Only this shot is regenerated (about 5 to 20 minutes on this Mac), then the video is assembled again. Earlier takes are kept."
                  onClick={() => onRetakeMotion(i + 1)}>{takes.canMakeNew ? 'Another take' : 'All takes used'}</button>
                {takes.switches.map((t) => <button type="button" key={t.take} className={t.active ? 'primary' : 'ghost'} disabled={busy || t.active} onClick={() => onRetakeMotion(i + 1, t.take)}>{t.label}</button>)}
              </div>;
            })()}
          </div>
        ))}
      </div>
      {running && <p className="muted tip">{TIPS[tip]}</p>}
      {running && <DirectorsChair job={job} plan={plan} stills={shots.map((_, i) => still(i + 1)).filter(Boolean)} clipsDone={files.progressClips?.length || 0} sessions={sessions} />}
      {!running && guessResult(job) && <p className="guessres">{guessResult(job)}</p>}
    </div>
  );
}
