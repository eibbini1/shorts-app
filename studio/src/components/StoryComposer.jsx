import { useEffect, useState } from 'react';
import { attemptCount, blockReasons } from '../pipeline-lines.js';
import { ideaHint } from '../idea-hint.js';
import { repairPreviewChanges } from '../review-recommendations.js';
import { moveQueueItem } from '../queue-order.js';

export const LOOKS = [
  { id: 'food', name: 'Food film', sw: ['#0f1115', '#e0b04a'], ex: 'A chef slices a glowing wagyu steak on a marble board, then drizzles sauce over it', ending: 'sauce glistening on the steak' },
  { id: 'cartoon', name: 'Cartoon', sw: ['#ff8a3d', '#6ec1ff'], ex: 'A small robot carries a seed up a stairway to a sunny rooftop, then plants it and a giant sunflower blooms above him', ending: 'a giant sunflower blooms above the robot' },
  { id: 'night', name: 'Night cartoon', sw: ['#0b1630', '#f3ead6'], ex: 'A small fox chases a paper boat down a moonlit rainy street, then catches it and sails away', ending: 'the fox sails away in the paper boat under the moon' },
  { id: 'custom', name: 'Custom', sw: ['#444a5a', '#c9cedb'], ex: 'A paper plane glides over a quiet harbour, then lands on a fishing boat', ending: 'the paper plane rests on the boat deck' },
];

export const THEME_SW = {
  studio: ['#0f1115', '#e0b04a'],
  night: ['#0b1630', '#f3ead6'],
  white: ['#ffffff', '#0b1630'],
  codex: ['#212121', '#5b9cff'],
};

export function IdeaHelper({ text, look, ending, quiet }) {
  const h = ideaHint(text, look, ending);
  if (!h || (quiet && h.level === 'ok')) return null;
  return <div className={'hint ' + h.level}>{h.level === 'ok' ? '✓ ' : h.level === 'warn' ? '! ' : '· '}{h.msg}</div>;
}

export function LookChips({ look, setLook, onExample, exampleBusy }) {
  const cur = LOOKS.find((l) => l.id === look) || LOOKS[0];
  const move = (e, i) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = LOOKS[(i + d + LOOKS.length) % LOOKS.length];
    setLook(n.id);
    e.currentTarget.parentElement.querySelector(`[data-look="${n.id}"]`)?.focus();
  };
  return (
    <div className="lookchips" role="radiogroup" aria-label="Film look">
      {LOOKS.map((l, i) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          data-look={l.id}
          aria-checked={look === l.id}
          tabIndex={look === l.id ? 0 : -1}
          className={look === l.id ? 'on' : ''}
          onClick={() => setLook(l.id)}
          onKeyDown={(e) => move(e, i)}
        >
          <span className="sw"><i style={{ background: l.sw[0] }} /><i style={{ background: l.sw[1] }} /></span>{l.name}
        </button>
      ))}
      <button type="button" className="link" disabled={exampleBusy} onClick={() => onExample(cur)}>
        {exampleBusy ? 'Finding an idea…' : 'Suggest an idea'}
      </button>
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

export function FailureCard({ help, onRetry, busy }) {
  return (
    <section className="card failcard" role="alert">
      <h3>{help.title}</h3>
      <p>{help.why}</p>
      <ul>{help.tips.map((t) => <li key={t}>{t}</li>)}</ul>
      {help.detail && <details><summary className="small muted">Error text</summary><pre className="small">{help.detail}</pre></details>}
      {help.canRetry && <button className="primary" disabled={busy} onClick={onRetry}>Retry render in this project</button>}
    </section>
  );
}

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
  [/ASMR sound line/, 'Add a supported sound effect that fits the shot.'],
];

export const plainBlock = (reason) => (PLAIN.find(([re]) => re.test(reason)) || [null, reason])[1];

export function BlockedCard({ lines, events, choice, busy, onRetry, onAnyway, onEdit }) {
  const reasons = blockReasons(lines, events, plainBlock);
  const tries = attemptCount(lines);
  return (
    <div className="card blockcard">
      <h3>{choice === 'repeat-topic' ? 'This topic was already made' : 'This one needs a nudge'}</h3>
      <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {choice !== 'repeat-topic' && (
        <p className="muted small">
          The Studio tried {tries || 1} version{tries === 1 ? '' : 's'} and fixed what it safely could. Nothing was rendered, so no time was lost on video.
        </p>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={onRetry}>Try again</button>
        {choice === 'repeat-topic' && <button className="ghost" disabled={busy} onClick={onAnyway}>Make it anyway</button>}
        <button className="ghost" onClick={onEdit}>Edit my idea</button>
      </div>
    </div>
  );
}

export function RepairChangePreview({ changes }) {
  return (
    <div className="repair-preview" aria-label="Proposed plan changes">
      <h4>Proposed changes</h4>
      {changes.length ? <ul>
        {changes.map(({ label, before, after }) => (
          <li key={label}>
            <b>{label}</b><br />
            <del>{before}</del><br />
            <ins>{after}</ins>
          </li>
        ))}
      </ul> : <p className="muted small">No saved brief fields changed. Review the refined story direction before starting a new plan.</p>}
      <p className="muted small">Starting this plan does not render frames or motion. The previous export and review stay unchanged.</p>
    </div>
  );
}

export function IdeaRefinement({ result, onUse }) {
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

export function ReadinessCheck() {
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

const QKEY = 'studio-up-next';
export function readQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); }
  catch { return []; }
}
export function writeQueue(q) {
  try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('studio-queue'));
}

export function UpNext({ show, autoNext, setAutoNext, serverQueue, onAddServer, onMoveServer, onRemoveServer, onToggleServer }) {
  const [localQ, setLocalQ] = useState(readQueue);
  const [text, setText] = useState('');
  useEffect(() => {
    const f = () => setLocalQ(readQueue());
    window.addEventListener('studio-queue', f);
    return () => window.removeEventListener('studio-queue', f);
  }, []);
  const usingServer = Boolean(serverQueue);
  const items = usingServer ? (serverQueue.items || []) : localQ.map((prompt, index) => ({ id: String(index), prompt }));
  const activeAutoNext = usingServer ? serverQueue.autoNext !== false : autoNext;
  if (!show && !items.length) return null;
  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (usingServer && onAddServer) onAddServer(t);
    else writeQueue([...localQ, t].slice(0, 10));
    setText('');
  };
  return (
    <div className="card upnext">
      <h3>Up next</h3>
      <p className="muted small">{usingServer
        ? 'Write your next idea while this one works. Saved on this Mac server so queued ideas run unattended even if you close this tab.'
        : 'Write your next idea while this one works. It uses the same look, length and sound settings.'}</p>
      <div className="row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="e.g. A tiny dragon toasts a marshmallow, then shares it with a mouse"
        />
        <button className="ghost" onClick={add}>Add</button>
      </div>
      {items.length > 0 && <ol>{items.map((item, i) => (
        <li key={item.id || i}>
          <span className="queue-prompt">{item.prompt}</span>
          <span className="queue-actions">
            <button type="button" className="link" disabled={i === 0} aria-label={`Move idea ${i + 1} up`} onClick={() => usingServer ? onMoveServer?.(i, -1) : writeQueue(moveQueueItem(localQ, i, -1))}>↑</button>
            <button type="button" className="link" disabled={i === items.length - 1} aria-label={`Move idea ${i + 1} down`} onClick={() => usingServer ? onMoveServer?.(i, 1) : writeQueue(moveQueueItem(localQ, i, 1))}>↓</button>
            <button type="button" className="link" aria-label={`Remove idea ${i + 1}: ${item.prompt}`} onClick={() => usingServer ? onRemoveServer?.(item.id) : writeQueue(localQ.filter((_, k) => k !== i))}>remove</button>
          </span>
        </li>
      ))}</ol>}
      <label className="small">
        <input
          type="checkbox"
          checked={activeAutoNext}
          onChange={(ev) => usingServer ? onToggleServer?.(ev.target.checked) : setAutoNext(ev.target.checked)}
        /> Start the next idea by itself when this job ends
      </label>
    </div>
  );
}
