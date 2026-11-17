import { useEffect, useRef, useState } from 'react';

/* ---------- render time estimate ----------
   Calibrated from real timestamps on this Mac (LTX-2.3 MLX, 576x1024, plugged in):
   fox 2 shots: clip 262 s + 245 s, still 24 s + 21 s, finishing 65 s, total 617 s
   first-cold-night-10: clips 229 s + 259 s; red-curry 8 shots: ~223-225 s per clip.
   One clip per shot, so time scales with the shot count, not the seconds. A retry or a vision-gate
   regeneration adds more; the live estimate corrects itself after the first clip. */
export const EST = { cycle: 274, cycleLow: 240, cycleHigh: 315, finish: 70, start: 10 };
export const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// the pipeline cuts a shot into ceil(seconds / 5) clips, so time follows clips, not shots
export const clipsOf = (shots) => (shots || []).reduce((n, sh) => n + Math.max(1, Math.ceil((sh.seconds || 5) / 5)), 0);
export const planEstimate = (n) => ({ low: EST.start + n * EST.cycleLow + EST.finish - 10, mid: EST.start + n * EST.cycle + EST.finish, high: EST.start + n * EST.cycleHigh + EST.finish + 15 });

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
    load(); const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [running, job.scenario]);
  if (job.kind !== 'render' || !n || !job.startedAt) return null;
  if (!running) {
    if (job.status !== 'done') return null;
    const est = planEstimate(n);
    return <div className="timer done">Finished. The estimate for {n} clip{n > 1 ? 's' : ''} was about {fmt(est.mid)}; the real time is in the log.</div>;
  }
  // one finished clip per shot (latest file per shot), only files written after this render started
  const done = new Map();
  files.clips.filter((c) => c.t >= job.startedAt).forEach((c) => done.set(c.n, c));
  const k = done.size;
  const last = k ? Math.max(...[...done.values()].map((c) => c.t)) : 0;
  const prior = learned || EST.cycle;
  const cycle = k ? Math.min(EST.cycleHigh * 1.5, Math.max(EST.cycleLow * 0.7, (last - job.startedAt - EST.start * 1000) / 1000 / k)) : prior;
  const endAt = job.startedAt + (EST.start + n * cycle + EST.finish) * 1000;
  const remaining = (endAt - now) / 1000;
  const elapsed = (now - job.startedAt) / 1000;
  const spread = k ? 0.06 : 0.12; // after a clip is measured the range tightens
  const lo = remaining * (1 - spread), hi = remaining * (1 + spread) + (k ? 0 : 30);
  const pct = Math.min(99, (elapsed / (elapsed + Math.max(remaining, 1))) * 100);
  return (
    <div className="timer" role="status">
      <div className="tnums">
        <span><b>{fmt(elapsed)}</b> elapsed</span>
        <span>{remaining > 5 ? <>about <b>{fmt(remaining)}</b> left <span className="muted">({fmt(lo)} to {fmt(hi)})</span></> : <b>finishing up...</b>}</span>
        <span className="muted">{k}/{n} clips · est. finish {new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="bar"><div className="fill" style={{ width: pct + '%' }} /></div>
      <div className="muted small">{k ? `Based on your first ${k} clip${k > 1 ? 's' : ''} (${fmt(cycle)} each).` : (learned ? `Estimate from your own past renders on this Mac (${fmt(learned)} per shot). It sharpens after the first clip.` : 'Estimate from past runs on this Mac (about 4.5 min per clip). It sharpens after the first clip.')} Retries add time.</div>
    </div>
  );
}

/* ---------- idea helper ---------- */
const MOOD = new Set('nice beautiful cool amazing good great best awesome story stories animation animated cartoon video short shorts film movie clip scene idea something thing cute funny epic'.split(' '));
const STOP = new Set('a an the of in on at to and or with for from by is are was it its his her their this that some'.split(' '));
const VERBS = new Set(('walk walks run runs chase chases chasing catch catches pour pours pouring slice slices cut cuts chop chops stir stirs mix mixes bake bakes fry fries cook cooks grill grills open opens close closes jump jumps fly flies swim swims climb climbs push pushes pull pulls throw throws grab grabs drop drops fall falls drizzle drizzles spread spreads flip flips whisk whisks sail sails dance dances hug hugs find finds follow follows meet meets build builds paint paints write writes ride rides drive drives sprint sprints paddle paddles carry carries lift lifts hold holds reach reaches turn turns smile smiles laugh laughs look looks wave waves sing sings sit sits stand stands roll rolls spin spins slide slides splash splashes melt melts glow glows grow grows glide glides land lands water waters rest rests').split(' '));

export function ideaHint(text, look) {
  const t = text.trim();
  if (!t) return null;
  const words = t.toLowerCase().replace(/[^a-z\s,'-]/g, ' ').split(/\s+/).filter(Boolean);
  const content = words.filter((w) => !STOP.has(w) && !MOOD.has(w));
  const hasVerb = words.some((w) => VERBS.has(w));
  const hasEnding = /\bthen\b|;|\.\s*\w|,\s*(and\s+)?\w+/i.test(t);
  if (words.length < 4 || content.length < 2) return { level: 'warn', msg: 'This reads like a mood, not a scene. Say who does what, then the ending. Example: "A small fox chases a paper boat, then sails away in it".' };
  if (!hasVerb) return { level: 'warn', msg: 'No clear action found. Add what the subject physically does (chases, pours, slices, climbs...) so every shot has something to animate.' };
  if (!hasEnding) return { level: 'tip', msg: 'Good start. Add an ending, e.g. ", then ..." or fill the Ending box, so the last shot has a target.' };
  if (look === 'food' && !/(food|dish|steak|bread|onion|garlic|noodle|rice|sauce|cake|fruit|soup|kebab|tomato|cheese|egg|chicken|burger|pasta|cook|bake|chef|kitchen|pan|slice|pour|dumpling|curry|salad)/i.test(t)) return { level: 'tip', msg: 'Look is "Food film" but the idea has no food in it. Switch Look to Cartoon or Custom if this is not a food video.' };
  return { level: 'ok', msg: 'Looks concrete: a subject, an action and an ending.' };
}
export function IdeaHelper({ text, look, quiet }) {
  const h = ideaHint(text, look);
  if (!h || (quiet && h.level === 'ok')) return null; // speak only when there is advice
  return <div className={'hint ' + h.level}>{h.level === 'ok' ? '✓ ' : h.level === 'warn' ? '! ' : '· '}{h.msg}</div>;
}

/* ---------- look and theme cards ---------- */
export const LOOKS = [
  { id: 'food', name: 'Food film', sw: ['#0f1115', '#e0b04a'], ex: 'A chef slices a glowing wagyu steak on a marble board, then drizzles sauce over it', ending: 'sauce glistening on the steak' },
  { id: 'cartoon', name: 'Cartoon', sw: ['#ff8a3d', '#6ec1ff'], ex: 'A small robot carries a seed up a stairway to a sunny rooftop, then plants it and a giant sunflower blooms above him', ending: 'a giant sunflower blooms above the robot' },
  { id: 'night', name: 'Night cartoon', sw: ['#0b1630', '#f3ead6'], ex: 'A small fox chases a paper boat down a moonlit rainy street, then catches it and sails away', ending: 'the fox sails away in the paper boat under the moon' },
  { id: 'custom', name: 'Custom', sw: ['#444a5a', '#c9cedb'], ex: 'A paper plane glides over a quiet harbour, then lands on a fishing boat', ending: 'the paper plane rests on the boat deck' },
];
export const THEME_SW = { studio: ['#0f1115', '#e0b04a'], night: ['#0b1630', '#f3ead6'], white: ['#ffffff', '#0b1630'] };

export function LookChips({ look, setLook, onExample }) {
  const cur = LOOKS.find((l) => l.id === look) || LOOKS[0];
  const move = (e, i) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return; e.preventDefault();
    const n = LOOKS[(i + d + LOOKS.length) % LOOKS.length]; setLook(n.id);
    e.currentTarget.parentElement.querySelector(`[data-look="${n.id}"]`)?.focus();
  };
  return (
    <div className="lookchips" role="radiogroup" aria-label="Film look">
      {LOOKS.map((l, i) => (
        <button key={l.id} type="button" role="radio" data-look={l.id} aria-checked={look === l.id} tabIndex={look === l.id ? 0 : -1} className={look === l.id ? 'on' : ''} onClick={() => setLook(l.id)} onKeyDown={(e) => move(e, i)}>
          <span className="sw"><i style={{ background: l.sw[0] }} /><i style={{ background: l.sw[1] }} /></span>{l.name}
        </button>
      ))}
      <button type="button" className="link" onClick={() => onExample(cur)}>Try an example</button>
    </div>
  );
}
export function LookCards({ look, setLook, onExample }) {
  return (
    <div className="looks">
      {LOOKS.map((l) => (
        <div key={l.id} className={'lookcard' + (look === l.id ? ' on' : '')}>
          <button className="lk" onClick={() => setLook(l.id)} aria-pressed={look === l.id}>
            <span className="sw"><i style={{ background: l.sw[0] }} /><i style={{ background: l.sw[1] }} /></span>
            <span>{l.name}</span>
          </button>
          <button className="ex" onClick={() => onExample(l)} title={l.ex}>Try example</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- player: loop, speed, frame stepping ---------- */
const FPS = 24;
export function Player({ src, fps = FPS }) {
  const v = useRef(null);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => { if (v.current) { v.current.playbackRate = rate; v.current.loop = loop; } }, [rate, loop]);
  useEffect(() => {
    const el = v.current; if (!el) return undefined;
    let raf; const tick = () => { setT(el.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  const step = (d) => { const el = v.current; if (!el) return; el.pause(); const f = Math.floor(el.currentTime * fps + 1e-6) + d; el.currentTime = Math.min(Math.max(0, (f + 0.5) / fps), Math.max(0, (el.duration || 0) - 0.001)); };
  const onKey = (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === ',' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === '.' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === ' ') { e.preventDefault(); const el = v.current; if (el.paused) el.play(); else el.pause(); }
  };
  return (
    <div className="pl" tabIndex={0} onKeyDown={onKey}>
      <video ref={v} src={src} controls playsInline className="player" onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <div className="plbar">
        <button onClick={() => step(-fps)} title="Back 1 s">« 1s</button>
        <button onClick={() => step(-1)} title="Previous frame (, or left arrow)">‹ frame</button>
        <button onClick={() => step(1)} title="Next frame (. or right arrow)">frame ›</button>
        <button onClick={() => step(fps)} title="Forward 1 s">1s »</button>
        <label>Speed <select value={rate} onChange={(e) => setRate(+e.target.value)}>{[0.25, 0.5, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}</select></label>
        <label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop</label>
        <span className="muted small">frame {Math.floor(t * fps)} / {Math.round(dur * fps)} · {t.toFixed(2)}s · click here, then use , and . keys</span>
      </div>
    </div>
  );
}

/* ---------- compare two clips on one clock ---------- */
export function ComparePanel({ onClose }) {
  const [list, setList] = useState([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [blind, setBlind] = useState(false);
  const [swap, setSwap] = useState(false);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const va = useRef(null); const vb = useRef(null);
  useEffect(() => { fetch('/api/videos').then((r) => r.json()).then((j) => { setList(j); if (j[0]) setA(j[0].p); if (j[1]) setB(j[1].p); }).catch(() => {}); }, []);
  const left = blind && swap ? b : a; const right = blind && swap ? a : b;
  const both = (fn) => [va.current, vb.current].forEach((el) => el && fn(el));
  const play = () => { both((el) => { el.currentTime = va.current.currentTime; }); both((el) => el.play()); };
  const pause = () => both((el) => el.pause());
  const seek = (s) => both((el) => { el.currentTime = s; });
  const step = (d) => { pause(); const f = Math.floor(va.current.currentTime * FPS + 1e-6) + d; seek(Math.max(0, (f + 0.5) / FPS)); };
  useEffect(() => { both((el) => { el.playbackRate = rate; }); }, [rate, left, right]);
  useEffect(() => {
    let raf;
    const tick = () => {
      const m = va.current, f = vb.current;
      if (m && f) { setT(m.currentTime); f.muted = true; if (!m.paused && Math.abs(f.currentTime - m.currentTime) > 0.08) f.currentTime = m.currentTime; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  const name = (p) => (list.find((x) => x.p === p)?.n || p || '').replace(/\.mp4$/, '');
  const url = (p) => '/media?p=' + encodeURIComponent(p);
  const opts = list.map((x) => <option key={x.p} value={x.p}>{x.n}</option>);
  return (
    <div className="card compare">
      <div className="cmphead"><h3>Compare clips</h3><button className="ghost" onClick={onClose}>Close</button></div>
      <div className="cmpsel">
        <label>A <select value={a} onChange={(e) => setA(e.target.value)}>{opts}</select></label>
        <label>B <select value={b} onChange={(e) => setB(e.target.value)}>{opts}</select></label>
        <label><input type="checkbox" checked={blind} onChange={(e) => { setBlind(e.target.checked); setSwap(Math.random() < 0.5); }} /> Blind (hide names, random sides)</label>
      </div>
      <div className="cmpvids">
        <div><video ref={va} src={left ? url(left) : undefined} playsInline className="player" /><div className="muted small">{blind ? 'Left' : 'A: ' + name(left)}</div></div>
        <div><video ref={vb} src={right ? url(right) : undefined} playsInline muted className="player" /><div className="muted small">{blind ? 'Right' : 'B: ' + name(right)}</div></div>
      </div>
      <div className="plbar">
        <button onClick={play}>Play both</button><button onClick={pause}>Pause</button>
        <button onClick={() => step(-1)}>‹ frame</button><button onClick={() => step(1)}>frame ›</button>
        <button onClick={() => seek(0)}>Restart</button>
        <label>Speed <select value={rate} onChange={(e) => setRate(+e.target.value)}>{[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}x</option>)}</select></label>
        <span className="muted small">{t.toFixed(2)}s · the right video is muted and follows the left clock</span>
      </div>
      {blind && <p className="muted small">Judge the clips first. Names stay hidden while Blind is on; untick it to reveal which was which. The scoring sheet comes in the next phase.</p>}
    </div>
  );
}

/* ---------- feedback + what the Studio has learned ---------- */
export function Feedback({ sessionId, video, onRated }) {
  const [sent, setSent] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setSent(''); setNote(''); }, [sessionId]);
  const send = (rating) => fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionId, video, rating, note }) })
    .then((r) => { if (r.ok) { setSent(rating); if (onRated) onRated(rating); } else setSent('err'); }).catch(() => setSent('err'));
  if (sent === 'up' || sent === 'down') return <p className="muted small">Saved to the learning log ({sent === 'up' ? 'good result' : 'needs work'}). This is creator feedback.</p>;
  return (
    <div className="plbar">
      <span>How is this video?</span>
      <button onClick={() => send('up')}>👍 Good</button>
      <button onClick={() => send('down')}>👎 Needs work</button>
      <input className="ending" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. stray shape in the sky in shot 2" />
      {sent === 'err' && <span className="bad small">Could not save.</span>}
    </div>
  );
}

export function LearnedCard() {
  const [l, setL] = useState(null);
  useEffect(() => { fetch('/api/learning').then((r) => r.json()).then(setL).catch(() => {}); }, []);
  if (!l || (!l.drafts && !l.renders)) return null;
  const up = Object.values(l.ratings || {}).reduce((n, r) => n + r.up, 0), down = Object.values(l.ratings || {}).reduce((n, r) => n + r.down, 0);
  return (
    <div className="card learned">
      <b>What the Studio has recorded on this Mac</b>
      <p className="muted small">{l.drafts} plans · {l.renders} finished renders · {up} good / {down} needs-work ratings{l.calibration.cycleSec ? ` · measured ${fmt(l.calibration.cycleSec)} per clip (${l.calibration.samples} renders)` : ''}</p>
      {l.topBlockers.length > 0 && <ul className="small">{l.topBlockers.map((b) => <li key={b.reason}>Most common block ({b.count}x): {plainBlock(b.reason)}</li>)}</ul>}
      {l.recentNotes.length > 0 && <ul className="small">{l.recentNotes.map((n, i) => <li key={i}>{n.rating === 'up' ? '👍' : '👎'} {n.note}</li>)}</ul>}
      <p className="muted small">This log is saved in storage/studio-learning. It does not retrain the video models; it feeds the time estimate and the tips, and it is there for us to improve the prompts and rules from.</p>
    </div>
  );
}

/* ---------- first frames: check the pictures before spending minutes on motion ---------- */
export function FramesReview({ job, plan, files, onRegen, onRender, busy, blocked }) {
  const shots = plan.shots || [];
  const still = (n) => [...(files.stills || [])].reverse().find((f) => f.shot === n);
  if (!shots.length || !(files.stills || []).length) return null;
  const url = (f) => '/media?p=' + encodeURIComponent(f.p) + '&v=' + Math.round(f.t);
  const all = shots.every((_, i) => still(i + 1));
  const est = planEstimate(clipsOf(shots));
  return (
    <div className="card frames">
      <h3>First frames</h3>
      <p className="muted small">The first frame decides how each clip looks. Regenerate any frame you don't like (about 25 s each) before the long motion step.</p>
      <div className="tiles">
        {shots.map((sh, i) => (
          <div className="tile" key={i}>
            {still(i + 1) ? <img src={url(still(i + 1))} alt={'Shot ' + (i + 1)} /> : <div className="ph">not made yet</div>}
            <div className="cap"><b>Shot {i + 1}</b> · {sh.seconds}s</div>
            <button className="ghost" disabled={busy} onClick={() => onRegen(i + 1)}>Regenerate</button>
          </div>
        ))}
      </div>
      <p><button className="primary" onClick={onRender} disabled={busy || blocked || !all}>Approve frames and render video</button>
        <span className="muted small"> about {fmt(est.mid)} ({fmt(est.low)} to {fmt(est.high)}); reuses these frames. This is the long step: nothing is sent to motion until you press it.</span></p>
    </div>
  );
}

export function FramesBlock({ job, plan, onRegen, onRender, busy, blocked }) {
  const [files, setFiles] = useState({ stills: [] });
  const show = job.kind === 'stills' && job.status === 'done' && job.scenario;
  useEffect(() => {
    if (!show) return undefined;
    let stop = false;
    fetch('/api/live-files?scenario=' + encodeURIComponent(job.scenario)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !stop) setFiles(j); }).catch(() => {});
    return () => { stop = true; };
  }, [show, job.scenario, job.updatedAt]);
  if (!show) return null;
  return <FramesReview job={job} plan={plan} files={files} onRegen={onRegen} onRender={onRender} busy={busy} blocked={blocked} />;
}

/* ---------- a block the Studio could not fix by itself: plain words and one-click next steps ---------- */
const PLAIN = [
  [/repeat topic/, 'You already made a video on this topic. Add a twist (new place, time or mood), or make it anyway.'],
  [/near-identical imagePrompt/, 'Two shots would start from almost the same picture.'],
  [/near-identical motionPrompt|repeated motionPrompt/, 'Two shots would move the same way.'],
  [/no recognizable physical action|camera movement over a still/, 'A shot has no clear movement, so the clip would look frozen.'],
  [/requested ending|payoff changed/, 'The last shot does not land on your ending.'],
  [/visual hook/, 'The first shot does not show your opening.'],
  [/required physical action/, 'No shot shows the main action of your idea.'],
  [/title does not name/, 'The title does not name your subject.'],
  [/timings|too few distinct shots/, 'The shots do not add up to the length you picked.'],
  [/narration/, 'A narration line is too long or cut off.'],
];
export const plainBlock = (reason) => (PLAIN.find(([re]) => re.test(reason)) || [null, reason])[1];
export function BlockedCard({ lines, choice, busy, onRetry, onAnyway, onEdit }) {
  const reasons = [...new Set(lines.filter((l) => l.startsWith('BLOCKED: ')).map((l) => plainBlock(l.slice(9))))];
  const tries = lines.filter((l) => /^Attempt \d+\/\d+/.test(l)).length;
  return (
    <div className="card blockcard">
      <h3>{choice === 'repeat-topic' ? 'This topic was already made' : 'This one needs a nudge'}</h3>
      <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {choice !== 'repeat-topic' && <p className="muted small">The Studio tried {tries || 1} version{tries === 1 ? '' : 's'} and fixed what it safely could. Nothing was rendered, so no time was lost on video.</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={onRetry}>Try again</button>
        {choice === 'repeat-topic' && <button className="ghost" disabled={busy} onClick={onAnyway}>Make it anyway</button>}
        <button className="ghost" onClick={onEdit}>Edit my idea</button>
      </div>
    </div>
  );
}

/* ---------- where the job is: one bar of stages, so waiting has a visible shape ---------- */
const STAGES = [
  ['Story', /Reading your idea|Drafting the story|Fixing the story|Checking the plan/],
  ['First frames', /Generating stills/],
  ['Motion', /Generating motion clips/],
  ['Sound', /Recording narration|Mixing sound/],
  ['Finishing', /Finishing and exporting|Quality checks/],
];
export function StepTrack({ job }) {
  if (job.status !== 'running') return null;
  const want = 5; // always show the whole journey; later stages stay dim
  let cur = job.kind === 'draft' ? 0 : 1;
  (job.steps || []).forEach((s) => { const i = STAGES.findIndex(([, re]) => re.test(s)); if (i > cur) cur = i; });
  if (job.kind === 'stills') cur = 1; else if (job.kind === 'draft') cur = 0; // a frames job never moves past frames
  else { // render: read the pipeline's own markers (step labels also match setup lines such as 'Finishing editor: artcraft')
    const MARK = [[/^Step 3\/4|Reusing image|First frame ready/, 1], [/Generating local LTX motion/, 2], [/^Step 4\/4|Effects placed/, 3], [/Wrote qa block|Contact sheet:|Timing: checks/, 4]];
    cur = 1; (job.lines || []).forEach((l) => MARK.forEach(([re, n]) => { if (re.test(l) && n > cur) cur = n; }));
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

/* ---------- queue the next idea while this one renders ---------- */
const QKEY = 'studio-up-next';
export function readQueue() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } }
export function writeQueue(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* storage blocked */ } window.dispatchEvent(new Event('studio-queue')); }
export function UpNext({ show, autoNext, setAutoNext }) {
  const [q, setQ] = useState(readQueue);
  const [text, setText] = useState('');
  useEffect(() => { const f = () => setQ(readQueue()); window.addEventListener('studio-queue', f); return () => window.removeEventListener('studio-queue', f); }, []);
  if (!show && !q.length) return null;
  const add = () => { const t = text.trim(); if (!t) return; writeQueue([...q, t].slice(0, 10)); setText(''); };
  return (
    <div className="card upnext">
      <h3>Up next</h3>
      <p className="muted small">Write your next idea while this one works. It uses the same look, length and sound settings.</p>
      <div className="row"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. A tiny dragon toasts a marshmallow, then shares it with a mouse" /><button className="ghost" onClick={add}>Add</button></div>
      {q.length > 0 && <ol>{q.map((t, i) => <li key={i}>{t} <button className="link" onClick={() => writeQueue(q.filter((_, k) => k !== i))}>remove</button></li>)}</ol>}
      <label className="small"><input type="checkbox" checked={autoNext} onChange={(ev) => setAutoNext(ev.target.checked)} /> Start the next idea by itself when this job ends</label>
    </div>
  );
}

/* ---------- the director's chair: useful little missions while the Mac works ---------- */
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } } };
function clap() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const b = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 300); const s = c.createBufferSource(); const g = c.createGain(); g.gain.value = 0.25; s.buffer = b; s.connect(g); g.connect(c.destination); s.start(); } catch { /* sound blocked */ } }

export function DirectorsChair({ job, plan, stills, clipsDone, sessions, remainingSec }) {
  const id = job.id; const runKey = id + '-' + job.startedAt;
  const [thumb, setThumb] = useState(() => ls.get('thumb-' + id, null));
  const [title, setTitle] = useState(() => ls.get('title-' + id, null));
  const [guess, setGuess] = useState(() => ls.get('guess-' + runKey, null));
  const [mins, setMins] = useState('');
  const [rated, setRated] = useState(() => ls.get('rated-sessions', []));
  const [past, setPast] = useState(null);
  const [skip, setSkip] = useState([]);
  const [clapN, setClapN] = useState(0);
  const prevClips = useRef(clipsDone);
  useEffect(() => { if (clipsDone > prevClips.current) { setClapN((n) => n + 1); clap(); } prevClips.current = clipsDone; }, [clipsDone]);
  const candidates = (sessions || []).filter((s) => s.hasVideo && s.id !== id && !rated.includes(s.id));
  useEffect(() => { if (!past && candidates.length) { const s = candidates[Math.floor(Math.random() * candidates.length)]; fetch('/api/sessions/' + s.id).then((r) => (r.ok ? r.json() : null)).then((j) => j && j.video && setPast(j)).catch(() => {}); } }, [candidates.length, past]);
  const titles = [...new Set([plan.title, plan.hook && plan.hook.split(/[,.]/)[0], plan.payoff && plan.payoff.replace(/\.$/, '')].filter(Boolean).map((t) => t.slice(0, 60)))];
  const missions = [
    stills.length > 0 && !thumb && 'thumb',
    job.kind === 'render' && !guess && 'guess',
    titles.length > 1 && !title && 'title',
    past && 'rate',
  ].filter(Boolean).filter((m) => !skip.includes(m));
  const m = missions[0];
  const rate = (r) => fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: past.id, rating: r }) }).finally(() => { const n = [...rated, past.id]; ls.set('rated-sessions', n); setRated(n); setPast(null); });
  return (
    <div className="chair">
      <div className="chairhead"><span className={'clapper' + (clapN ? ' snap' : '')} key={clapN}>🎬</span><b>Director's chair</b><span className="muted small">{clipsDone ? `${clipsDone} take${clipsDone > 1 ? 's' : ''} in the can` : 'cameras warming up'}</span></div>
      {guess && <p className="small muted">Your bet: done in {guess.min} min{remainingSec != null ? ` · the Studio says about ${Math.max(1, Math.round(remainingSec / 60))} min left` : ''}.</p>}
      {!m && <p className="muted small">All caught up. Sit back: your frames appear above as they develop.</p>}
      {m === 'thumb' && (<div><p>Pick the cover frame for this Short.</p><div className="pick">{stills.map((s) => <img key={s.p} src={'/media?p=' + encodeURIComponent(s.p)} onClick={() => { ls.set('thumb-' + id, s.p); setThumb(s.p); }} alt={'Shot ' + s.shot} />)}</div></div>)}
      {m === 'guess' && (<div><p>Place your bet: how many minutes until it's done?</p><div className="row"><input type="number" min="1" max="99" value={mins} onChange={(e) => setMins(e.target.value)} placeholder="min" /><button className="ghost" disabled={!mins} onClick={() => { const g = { min: +mins, at: Date.now() }; ls.set('guess-' + runKey, g); setGuess(g); }}>Lock it in</button></div></div>)}
      {m === 'title' && (<div><p>Which title fits best?</p><div className="row wrap">{titles.map((t) => <button key={t} className="ghost" onClick={() => { ls.set('title-' + id, t); setTitle(t); }}>{t}</button>)}</div></div>)}
      {m === 'rate' && (<div><p>Quick one: rate an earlier video. It teaches the Studio what you like.</p><video className="pastvid" src={'/media?p=' + encodeURIComponent(past.video)} muted autoPlay loop playsInline /><div className="row"><button onClick={() => rate('up')}>👍</button><button onClick={() => rate('down')}>👎</button></div></div>)}
      {m && <button className="link" onClick={() => setSkip([...skip, m])}>skip</button>}
    </div>
  );
}
export function guessResult(job) {
  const g = ls.get('guess-' + job.id + '-' + job.startedAt, null);
  if (!g || job.status !== 'done' || !job.updatedAt) return null;
  const real = (job.updatedAt - g.at) / 60000; const off = Math.abs(real - g.min);
  return off < 1 ? `🎯 Your bet of ${g.min} min was spot on!` : `Your bet: ${g.min} min. Actual: ${real.toFixed(1)} min (${off.toFixed(1)} min ${real > g.min ? 'longer' : 'shorter'}).`;
}


/* ---------- stages: Plan video -> Review first frames -> Render video -> Review export ---------- */
export const STAGE_NAMES = ['Plan video', 'Review first frames', 'Render video', 'Review export'];
export function stageIndex(job) {
  if (!job.status || job.status === 'idle') return -1;
  if (job.kind === 'draft') return job.status === 'done' && job.plan ? 1 : 0;
  if (job.kind === 'stills') return 1;
  if (job.kind === 'render') return job.status === 'done' && job.video ? 3 : 2;
  return 0;
}
export function StageBar({ job }) {
  const cur = stageIndex(job);
  if (cur < 0) return null;
  return (
    <ol className="stagebar" aria-label="Progress through the film">
      {STAGE_NAMES.map((n, i) => (
        <li key={n} aria-current={i === cur ? 'step' : undefined} className={i < cur ? 'done' : i === cur ? 'now' : ''}><span className="n">{i < cur ? '✓' : i + 1}</span> {n}</li>
      ))}
    </ol>
  );
}
// One honest state per job: waiting / running / awaiting approval / blocked / failed / complete.
// "Awaiting approval" is derived from a finished plan or first-frames job, because the server only reports running/done/failed.
export function jobState(job, blocked, busyElsewhere) {
  const st = job.status;
  if (!st || st === 'idle') return busyElsewhere ? { k: 'waiting', t: 'The Mac is busy with another video. New ideas wait in Up next.' } : { k: 'idle', t: '' };
  if (st === 'running') return { k: 'running', t: job.kind === 'draft' ? 'Planning your video.' : job.kind === 'stills' ? 'Making first frames.' : 'Rendering motion. This takes several minutes; you can leave this page open.' };
  if (st === 'stopping') return { k: 'waiting', t: 'Stopping the current job. Studio will be available when it exits.' };
  if (st === 'cancelled') return { k: 'stopped', t: 'Stopped. Your idea is kept; plan again when ready.' };
  if (st === 'interrupted') return { k: 'failed', t: 'The Mac restarted this job. Your idea is kept; try again.' };
  if (st === 'failed') return blocked ? { k: 'blocked', t: 'Blocked by a check. Nothing was rendered. Fix the point below or try again.' } : { k: 'failed', t: 'Something went wrong. Your idea is kept; try again.' };
  if (job.kind === 'draft') return blocked ? { k: 'blocked', t: 'Blocked by a check. Nothing was rendered.' } : { k: 'approval', t: 'Plan ready. Next: make first frames, then check them before the long render.' };
  if (job.kind === 'stills') return blocked ? { k: 'blocked', t: 'Blocked by a check. Fix it before rendering.' } : { k: 'approval', t: 'First frames ready. Approve them to start the render, or regenerate any frame.' };
  return blocked ? { k: 'blocked', t: 'Final file failed a check. It is not ready.' } : { k: 'complete', t: 'Video rendered. Review the export below before using it.' };
}

/* ---------- plan review: every shot with its action, picture, length and sound ---------- */
export function ShotPlan({ shots, notes }) {
  const fixes = (n) => (notes || []).filter((l) => /^BLOCKED/.test(l) && new RegExp('shots?\\s*' + n + '\\b', 'i').test(l)).map((l) => plainBlock(l.replace(/^BLOCKED:\s*/, '')));
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

/* ---------- export review: file gates, shot flags and human review are three different things ---------- */
export function ExportReview({ job, review, weak, notes, busy, onRetake, onCompare }) {
  const [rated, setRated] = useState('');
  useEffect(() => { setRated(''); }, [job.id]);
  const failed = notes.filter((n) => n.startsWith('BLOCKED')).map((n) => plainBlock(n.replace(/^BLOCKED:\s*/, '')));
  const passed = job.technicalQa?.status === 'passed';
  const src = '/media?p=' + encodeURIComponent(job.video);
  return (
    <section className="card export" aria-labelledby="exp-h">
      <h3 id="exp-h">Review export</h3>
      <p className={'readystate ' + (failed.length ? 'bad' : 'ok')} role="status">{failed.length ? 'Not ready: the final file failed a check.' : passed ? 'Technical checks passed. Watch and listen before publishing.' : 'Technical checks have not been confirmed for this export.'}</p>
      <Player src={src} />
      <p className="row"><a className="btn" href={src} download>Download video</a>{onCompare && <button type="button" className="ghost" onClick={onCompare}>Compare with another video</button>}</p>
      <dl className="gates">
        <dt>Technical checks on the final file</dt>
        <dd>{failed.length ? <ul>{failed.map((f) => <li key={f} className="bad">{f}</li>)}</ul> : passed ? 'Passed for this exact export.' : 'No check result was recorded for this file.'}</dd>
        <dt>Source and export resolution</dt>
        <dd>{review.resolution?.delivery ? `Export ${review.resolution.delivery.width}×${review.resolution.delivery.height}.` : 'Export dimensions unavailable.'} {review.resolution?.status === 'verified'
          ? `Native motion sources: ${[...new Set(review.resolution.native.map((item) => item.width + '×' + item.height))].join(', ')}. ${review.resolution.native.some((item) => item.width < review.resolution.delivery.width || item.height < review.resolution.delivery.height) ? 'Delivery includes upscaling.' : ''}`
          : 'Native motion resolution is unverified for this file.'}</dd>
        <dt>Automatic shot flags</dt>
        <dd>{weak.length ? `${weak.length === 1 ? 'Shot ' + weak[0] + ' barely moves' : 'Shots ' + weak.join(', ') + ' barely move'}. This is a machine measure, not a verdict.` : review.status === 'complete' && review.motionChecked ? 'No shot was flagged by the motion measure.' : review.status === 'pending' ? 'Review results are loading.' : review.status === 'stale' ? 'The saved review belongs to a different version. Review this export again.' : review.status === 'complete' ? 'Motion measurement is incomplete.' : 'Review results are unavailable for this export.'}
          {review.status === 'complete' && <p className="muted">{review.visionChecked ? 'Vision screening ran.' : 'Vision screening is unverified or was skipped.'} {(review.unchecked || []).join(' ')} {(review.notMachineChecked || []).join(' ')}</p>}</dd>
        {review.status === 'complete' && Object.values(review.flags || {}).some((items) => items.length > 0) && <><dt>Advisory findings</dt><dd><ul>{Object.entries(review.flags || {}).flatMap(([category, items]) => items.map((item, index) => <li key={category + index}>{category}: {item}</li>))}</ul></dd></>}
        <dt>Human editorial review</dt>
        <dd>{rated ? `Rated by you: ${rated === 'up' ? 'good' : 'needs work'}.` : 'Picture and sound have not been reviewed by a person yet.'}</dd>
      </dl>
      {weak.length > 0 && <div className="retake"><p><b>Make a new take.</b> A new take uses a new seed and re-renders by itself (about 5 minutes).</p>{weak.map((n) => <button key={n} type="button" className="ghost" disabled={busy} onClick={() => onRetake(n)}>Make a new take of shot {n}</button>)}</div>}
      <Feedback sessionId={job.id} video={job.video} onRated={setRated} />
      <p className="muted small">{job.video}</p>
    </section>
  );
}
