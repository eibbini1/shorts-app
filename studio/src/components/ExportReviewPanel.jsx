import { useEffect, useState } from 'react';
import { readRepairGuidance, writeRepairGuidance } from '../draft-storage.js';
import {
  reviewRecommendations,
  suggestedRepairGuidance,
  suggestedShotRepairGuidance,
} from '../review-recommendations.js';
import { exportReviewStatus, releaseQualityStatus } from '../review-status.js';
import { Player } from './PlayerAndCompare.jsx';
import { plainBlock } from './StoryComposer.jsx';

export function Feedback({ sessionId, video, onRated }) {
  const [sent, setSent] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setSent(''); setNote(''); }, [sessionId]);
  const send = (rating) => fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: sessionId, video, rating, note }),
  })
    .then((r) => {
      if (r.ok) {
        setSent(rating);
        if (onRated) onRated(rating);
      } else setSent('err');
    })
    .catch(() => setSent('err'));
  if (sent === 'up' || sent === 'down') {
    return <p className="muted small">Saved to the learning log ({sent === 'up' ? 'good result' : 'needs work'}). This is creator feedback.</p>;
  }
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

export function CheckpointReviewForm({ job, timeline }) {
  const [available, setAvailable] = useState(null);
  const [saved, setSaved] = useState(null);
  const [findings, setFindings] = useState({});
  const [payoff, setPayoff] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let stop = false;
    setAvailable(null); setSaved(null); setFindings({}); setPayoff(''); setNotes(''); setConfirmed(false); setError('');
    fetch('/api/checkpoint-review?sessionId=' + encodeURIComponent(job.id)).then((r) => r.json()).then((result) => {
      if (stop) return;
      setAvailable(result.available === true);
      setSaved(result.review || null);
      if (result.review) {
        setFindings(Object.fromEntries(result.review.shotFindings.map((item) => [item.shot, item.outcome])));
        setPayoff(result.review.payoff);
        setNotes(result.review.notes || '');
        setConfirmed(true);
      } else if (result.reason) setError(result.reason);
    }).catch(() => { if (!stop) { setAvailable(false); setError('Could not load the saved review state.'); } });
    return () => { stop = true; };
  }, [job.id, job.video]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/checkpoint-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: job.id,
          video: job.video,
          confirmed,
          payoff,
          notes,
          shotFindings: timeline.map((item) => ({ shot: item.shot, outcome: findings[item.shot] || '' })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this review.');
      setSaved(result.review);
    } catch (failure) { setError(failure.message || 'Could not save this review.'); }
    finally { setBusy(false); }
  };
  if (available === null) return <p className="muted small" role="status">Loading the saved checkpoint review…</p>;
  if (!available) return <p className="muted small">Human checkpoint review cannot be saved for this export yet. {error}</p>;
  if (saved) return (
    <div className="checkpoint-review" role="status">
      <p><b>Checkpoint review saved.</b> Payoff: {saved.payoff.replace('-', ' ')}. This is evidence for this exact export, not an automatic score or model update.</p>
      <ul>{saved.shotFindings.map((item) => <li key={item.shot}>Shot {item.shot}: {item.outcome.replace('-', ' ')}</li>)}</ul>
      <button type="button" className="ghost" onClick={() => setSaved(null)}>Edit review</button>
    </div>
  );
  const complete = timeline.length > 0 && timeline.every((item) => findings[item.shot]) && payoff && confirmed;
  return (
    <div className="checkpoint-review">
      <h4>Record what you saw</h4>
      <p className="muted small">Compare the planned actions with the start/middle/end frames. This saves your observations without assigning a score.</p>
      {timeline.map((item) => (
        <label key={item.shot} className="checkpoint-review-row">
          <span><b>Shot {item.shot}</b> · {item.plannedAction}</span>
          <select value={findings[item.shot] || ''} onChange={(event) => setFindings((current) => ({ ...current, [item.shot]: event.target.value }))}>
            <option value="">Choose what you saw…</option>
            <option value="matches">Action matches the plan</option>
            <option value="partial">Action is partly visible</option>
            <option value="not-visible">Action is not visible</option>
          </select>
        </label>
      ))}
      <label className="checkpoint-review-row">
        <span><b>Final payoff</b> · Did the last shot achieve its planned ending?</span>
        <select value={payoff} onChange={(event) => setPayoff(event.target.value)}>
          <option value="">Choose an outcome…</option>
          <option value="achieved">Achieved</option>
          <option value="partial">Partly achieved</option>
          <option value="not-visible">Not visible</option>
        </select>
      </label>
      <label className="checkpoint-review-row">
        <span>Optional note</span>
        <input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Describe a mismatch or useful detail" />
      </label>
      <label className="checkpoint-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I compared this export&apos;s checkpoints with its planned actions.
      </label>
      <button type="button" disabled={busy || !complete} onClick={save}>{busy ? 'Saving…' : 'Save checkpoint review'}</button>
      {error && <p className="bad small" role="alert">{error}</p>}
    </div>
  );
}

function CopyableText({ label, value, multiline = false }) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage('Clipboard unavailable; select the text to copy it.');
    }
  };
  return (
    <div className="copy-field">
      <div className="copy-field-head"><b>{label}</b><button type="button" className="ghost" onClick={copy}>Copy</button></div>
      {multiline ? <pre>{value}</pre> : <p>{value}</p>}
      {message && <span className="muted small" role="status">{message}</span>}
    </div>
  );
}

function ReleaseReadiness({ report, review }) {
  const quality = releaseQualityStatus(report, review.videoSha256);
  if (quality.status === 'missing') return <p className="muted small">No release quality report was found for this export.</p>;
  if (!quality.verified) return <p className="bad small" role="status">Saved release report is not verified against this exact export; its score is not treated as current.</p>;
  const statusText = {
    pass: 'Release gate passed',
    revise: 'Revise before release',
    blocked: 'Release blocked',
    'review-needed': 'Human review needed',
  }[quality.status] || `Release status: ${quality.status}`;
  const reasons = [
    ...(Array.isArray(report.evidenceReleaseProblems) ? report.evidenceReleaseProblems : []),
    ...(Array.isArray(report.reviewEvidenceProblems) ? report.reviewEvidenceProblems : []),
    ...(Array.isArray(report.criticalEditorialBelow4) && report.criticalEditorialBelow4.length
      ? [`Editorial ratings below 4/5: ${report.criticalEditorialBelow4.join(', ')}`] : []),
  ];
  return (
    <div className={`release-readiness release-${quality.status}`}>
      <b>{statusText}</b>
      <p>{Number.isFinite(report.score) ? `${report.score}/${report.possible || 100}` : 'Score unavailable'}
        {Number.isFinite(report.technicalPoints) && Number.isFinite(report.storyPoints) && Number.isFinite(report.editorialPoints)
          ? ` · technical ${report.technicalPoints}, story ${report.storyPoints}, editorial ${report.editorialPoints}` : ''}</p>
      {reasons.length > 0 && <ul>{reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>}
      {report.note && <p className="muted small">{report.note}</p>}
    </div>
  );
}

export function ExportReview({ job, review, weak, notes, busy, renderDisabled, onRetake, onRepair, onCompare }) {
  const [rated, setRated] = useState('');
  const [artifactState, setArtifactState] = useState({ status: 'loading', items: [], pack: null, quality: null, errors: [] });
  const recommendations = reviewRecommendations(review);
  const suggestedGuidance = suggestedRepairGuidance(recommendations, job.options?.ending);
  const [repairGuidance, setRepairGuidance] = useState(() => readRepairGuidance(job.id, job.video) ?? suggestedGuidance);
  useEffect(() => { setRated(''); }, [job.id]);
  useEffect(() => {
    const saved = readRepairGuidance(job.id, job.video);
    const next = saved ?? suggestedGuidance;
    setRepairGuidance(next);
    if (saved === null && next) writeRepairGuidance(job.id, job.video, next);
  }, [job.id, job.video, suggestedGuidance]);
  useEffect(() => {
    let current = true;
    setArtifactState({ status: 'loading', items: [], pack: null, quality: null, errors: [] });
    fetch('/api/artifacts?sessionId=' + encodeURIComponent(job.id))
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load publishing files.');
        return data;
      })
      .then(async (data) => {
        const items = Array.isArray(data.artifacts) ? data.artifacts : [];
        const readJson = async (kind) => {
          const artifact = items.find((item) => item.kind === kind);
          if (!artifact) return { value: null, error: null };
          try {
            const response = await fetch('/media?p=' + encodeURIComponent(artifact.path));
            if (!response.ok) throw new Error(`Could not load ${artifact.label}.`);
            const value = await response.json();
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${artifact.label} is not valid JSON.`);
            return { value, error: null };
          } catch (error) {
            return { value: null, error: error.message };
          }
        };
        const [pack, quality] = await Promise.all([readJson('publish-pack'), readJson('quality-report')]);
        if (current) setArtifactState({
          status: 'ready', items, pack: pack.value, quality: quality.value,
          errors: [pack.error, quality.error].filter(Boolean),
        });
      })
      .catch((error) => {
        if (current) setArtifactState({ status: 'error', items: [], pack: null, quality: null, errors: [], error: error.message });
      });
    return () => { current = false; };
  }, [job.id, job.video]);
  const failed = notes.filter((n) => n.startsWith('BLOCKED')).map((n) => plainBlock(n.replace(/^BLOCKED:\s*/, '')));
  const passed = job.technicalQa?.status === 'passed';
  const reviewStatus = exportReviewStatus({ failed, technicalPassed: passed, review });
  const src = '/media?p=' + encodeURIComponent(job.video);
  return (
    <section className="card export" aria-labelledby="exp-h">
      <h3 id="exp-h">Review export</h3>
      <p className={'readystate ' + reviewStatus.tone} role="status">{reviewStatus.message}</p>
      <Player src={src} />
      <p className="row"><a className="btn" href={src} download>Download video</a>{onCompare && <button type="button" className="ghost" onClick={onCompare}>Compare with another video</button>}</p>
      {artifactState.status === 'ready' && artifactState.items.length > 0 && <div className="export-artifacts">
        <b>Publishing files</b>
        <ul>{artifactState.items.map((artifact) => <li key={artifact.kind}>
          <a href={'/media?p=' + encodeURIComponent(artifact.path)} download>{artifact.label}</a>
        </li>)}</ul>
      </div>}
      {artifactState.status === 'ready' && <ReleaseReadiness report={artifactState.quality} review={review} />}
      {artifactState.status === 'ready' && artifactState.pack && <details className="publish-preview">
        <summary>Preview publishing details</summary>
        {artifactState.pack.title && <CopyableText label="Title" value={String(artifactState.pack.title)} />}
        {artifactState.pack.description && <CopyableText label="Description" value={String(artifactState.pack.description)} multiline />}
        {Array.isArray(artifactState.pack.tags) && artifactState.pack.tags.length > 0 &&
          <CopyableText label="Tags" value={artifactState.pack.tags.map(String).join(', ')} />}
        {Array.isArray(artifactState.pack.claimsToCheck) && artifactState.pack.claimsToCheck.length > 0 &&
          <div className="copy-field"><b>Claims to check</b><ul>{artifactState.pack.claimsToCheck.map((claim, index) => <li key={`${claim}-${index}`}>{String(claim)}</li>)}</ul></div>}
      </details>}
      {artifactState.status === 'ready' && artifactState.errors.map((message, index) => <p className="bad small" role="alert" key={`${message}-${index}`}>{message}</p>)}
      {artifactState.status === 'ready' && artifactState.items.length === 0 && <p className="muted small">No caption, publish-pack, or provenance files were found beside this export.</p>}
      {artifactState.status === 'error' && <p className="bad small" role="alert">{artifactState.error}</p>}
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
        {review.status === 'complete' && Object.values(review.flags || {}).some((items) => items.length > 0) && <><dt>Automatic review flags (check these moments)</dt><dd><ul>{Object.entries(review.flags || {}).flatMap(([category, items]) => items.map((item, index) => <li key={category + index}>{category}: {item}</li>))}</ul></dd></>}
        {review.status === 'complete' && recommendations.length > 0 && <><dt>Recommended next steps</dt><dd><ul>{recommendations.map((recommendation, index) => {
          const { category, issue, nextStep, shot, seconds } = recommendation;
          const canRetakeShot = Number.isInteger(shot) && job.sequence?.stage === 'ready'
            && shot <= Number(job.sequence.shotCount) && onRetake;
          return <li key={category + index}>
            <b>{category}:</b> {nextStep} <span className="muted">Flag: {issue}</span>
            {shot && <p className="muted small">Affected shot {shot}{Number.isFinite(seconds) ? ` · around ${seconds.toFixed(1)}s` : ''}</p>}
            {shot && onRepair && <button type="button" className="ghost" disabled={busy} onClick={() => {
              const guidance = suggestedShotRepairGuidance(recommendation, job.options?.ending);
              setRepairGuidance(guidance);
              writeRepairGuidance(job.id, job.video, guidance);
              document.querySelector('[aria-label="Plan repair instructions"]')?.focus();
            }}>Focus plan repair on shot {shot}</button>}
            {canRetakeShot && <div>
              <button type="button" className="ghost" disabled={busy || renderDisabled} onClick={() => onRetake(shot)}>Try new still candidates for shot {shot}</button>
              <span className="muted small"> The prompt stays unchanged. Motion remains locked until you review and approve a candidate.</span>
            </div>}
          </li>;
        })}</ul></dd></>}
        {review.status === 'complete' && review.sampleTimeline?.length > 0 && <><dt>Shot action checkpoints</dt><dd>
          <p className="muted">Start, middle and end samples are provided for your review. The contact sheet is not an automatic realism verdict.</p>
          {review.contactSheet && <details className="action-checkpoints">
            <summary>Open timestamped frame sheet</summary>
            <img src={'/media?p=' + encodeURIComponent(review.contactSheet)} alt="Timestamped start, middle and end frames for every shot" loading="lazy" />
          </details>}
          <ol>{review.sampleTimeline.map((item) => <li key={item.shot}><b>Shot {item.shot}</b> · {item.startSeconds.toFixed(1)}s / {item.middleSeconds.toFixed(1)}s / {item.endSeconds.toFixed(1)}s<br /><span className="muted">Planned: {item.plannedAction}</span></li>)}</ol>
          <CheckpointReviewForm job={job} timeline={review.sampleTimeline} />
        </dd></>}
        <dt>Human editorial review</dt>
        <dd>{rated ? `Rated by you: ${rated === 'up' ? 'good' : 'needs work'}.` : 'Picture and sound have not been reviewed by a person yet.'}</dd>
      </dl>
      {review.status === 'complete' && recommendations.length > 0 && onRepair && <div className="retake">
        <label><b>Revise the plan</b>
          <textarea aria-label="Plan repair instructions" rows={4} maxLength={600} value={repairGuidance} onChange={(event) => {
            const value = event.target.value;
            setRepairGuidance(value);
            writeRepairGuidance(job.id, job.video, value);
          }} />
        </label>
        <p className="muted small">These instructions are saved locally for this export.</p>
        <p className="muted">The local AI will propose a revised story plan. You review and approve that plan before any frames or video are generated; this export and its history are kept.</p>
        <button type="button" className="primary" disabled={busy || !repairGuidance.trim()} onClick={() => onRepair(repairGuidance)}>Prepare a corrected plan</button>
      </div>}
      {weak.length > 0 && <div className="retake"><p><b>Make a new take.</b> A new seed regenerates the selected shot and then renders the complete video; time depends on the number of clips.</p>
        {renderDisabled && <p className="muted">No renders remain today. You can still revise and review the story plan.</p>}
        {weak.map((n) => <button key={n} type="button" className="ghost" disabled={busy || renderDisabled} onClick={() => onRetake(n)}>Make a new take of shot {n}</button>)}</div>}
      <Feedback sessionId={job.id} video={job.video} onRated={setRated} />
      <p className="muted small">{job.video}</p>
    </section>
  );
}
