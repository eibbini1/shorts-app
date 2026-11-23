import { useEffect, useState } from 'react';

export default function MotionTakeReview({ sessionId }) {
  const [review, setReview] = useState(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sequence/motion-review?sessionId=' + encodeURIComponent(sessionId), { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setReview(data);
      })
      .catch((error) => { if (!controller.signal.aborted) setProblem(error.message); });
    return () => controller.abort();
  }, [sessionId]);

  const source = review?.segments[segmentIndex];
  return <section className="card">
    <h3>Review motion before continuing</h3>
    {Number.isInteger(review?.take) && <p>Take {review.take + 1}</p>}
    {review?.segments.length > 1 && <label>Clip segment <select value={segmentIndex}
      onChange={(event) => setSegmentIndex(Number(event.target.value))}>
      {review.segments.map(({ part }, index) => <option key={part} value={index}>Segment {part}</option>)}
    </select></label>}
    {review?.parts > 1 && review.segments.length === 1 && <p>Only the final segment was recorded for this take.</p>}
    {review?.takeScreen?.length > 0 && <details>
      <summary>Technical checks by take</summary>
      <ol>{review.takeScreen.map(({ take, flags, checkedParts, parts, complete, elapsedSeconds }) => <li key={take}>
        Take {take + 1} · {!complete && (checkedParts ? `Screening incomplete (${checkedParts}/${parts} segments checked)` : 'Screening status unknown')}
        {!complete && flags.length > 0 && ' · '}
        {flags.length ? flags.join(' · ') : complete && 'No technical flags'}
        {Number.isFinite(elapsedSeconds) && ` · ${elapsedSeconds}s to prepare and check`}
      </li>)}</ol>
      <p className="muted small">Fully screened takes are listed first. Watch each take to judge the action and realism.</p>
    </details>}
    {problem && <p role="status">{problem}</p>}
    {source && <SegmentReview key={source.part + ':' + source.sha256} source={source} sessionId={sessionId} />}
  </section>;
}

function SegmentReview({ source, sessionId }) {
  const [frames, setFrames] = useState([]);
  const [problem, setProblem] = useState('');
  const [message, setMessage] = useState(source.myReview ? 'Your saved finding for this clip.' : '');
  const [saving, setSaving] = useState(false);

  const url = source && '/media?p=' + encodeURIComponent(source.clip) + '&v=' + source.sha256;
  useEffect(() => {
    if (!url) return undefined;
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const samples = [];
    let times = [];
    let stopped = false;
    video.muted = true;
    video.preload = 'auto';
    const timeout = setTimeout(() => fail('Frame samples timed out. You can still try playing the clip.'), 12000);
    function fail(message) {
      clearTimeout(timeout);
      stopped = true;
      setProblem(message);
    }
    video.onerror = () => fail('Motion clip could not be decoded.');
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
        return fail('Motion clip has no readable duration or dimensions.');
      }
      const last = Math.max(0, video.duration - 0.08);
      times = [Math.min(0.04, last), last / 2, last];
      if (last < 0.1) return fail('Motion clip is too short to sample.');
      canvas.width = 160;
      canvas.height = Math.round(160 * video.videoHeight / video.videoWidth);
      video.currentTime = times[0];
    };
    video.onseeked = () => {
      if (stopped) return;
      try {
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const dark = pixels.every((value, index) => index % 4 === 3 || value < 18);
        samples.push({ time: video.currentTime, image: canvas.toDataURL('image/png'), dark });
        if (samples.length < times.length) {
          video.currentTime = times[samples.length];
          return;
        }
        clearTimeout(timeout);
        setFrames(samples);
      } catch { fail('Frame samples are unavailable. You can still play the clip.'); }
    };
    video.src = url;
    return () => {
      stopped = true;
      clearTimeout(timeout);
      video.onerror = null;
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  async function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/sequence/motion-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sha256: source.sha256, part: source.part, outcome: fields.get('outcome'),
          seconds: Number(fields.get('seconds')), notes: fields.get('notes'),
          ratings: Object.fromEntries(['identity', 'action', 'realism'].map((key) => [key, Number(fields.get(key))])) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage('Finding saved for this clip.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  return <>
    {url && <video src={url} controls playsInline preload="metadata" style={{ maxWidth: '100%', maxHeight: '55vh' }} />}
    {problem && <p role="status">{problem}</p>}
    {frames.length > 0 && <div className="tiles">
      {frames.map(({ time, image, dark }, index) => <figure key={index}>
        <img src={image} alt={['Start frame', 'Middle frame', 'End frame'][index]} width="160" />
        <figcaption>{time.toFixed(2)}s{dark ? ' · very dark' : ''}</figcaption>
      </figure>)}
    </div>}
    {frames.length === 3 && frames.every(({ image }) => image === frames[0].image) &&
      <p role="status">All three sampled frames match. Check for a frozen clip during playback.</p>}
    {source && <form onSubmit={save}>
      <label>Finding <select name="outcome" required defaultValue={source.myReview?.outcome ?? ''}>
        <option value="" disabled>Choose a finding</option>
        <option value="holds-up">Holds up</option>
        <option value="identity-drift">Identity drift</option>
        <option value="missed-action">Missed action</option>
        <option value="unnatural-motion">Unnatural motion</option>
      </select></label>
      <fieldset>
        <legend>Rate from 1 (poor) to 5 (excellent)</legend>
        {Object.entries({ identity: 'Identity held', action: 'Action happened', realism: 'Motion looks real' }).map(([key, label]) =>
          <label key={key}>{label} <select name={key} required defaultValue={source.myReview?.ratings?.[key] ?? ''}>
            <option value="" disabled>Choose rating</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>)}
      </fieldset>
      <label>Seconds into this clip <input name="seconds" type="number" min="0" max="60" step="any" defaultValue={source.myReview?.seconds ?? 0} required /></label>
      <label>Notes <textarea name="notes" maxLength="1000" defaultValue={source.myReview?.notes ?? ''} /></label>
      <button type="submit" disabled={saving}>Save finding</button>
      {message && <p role="status">{message}</p>}
    </form>}
  </>;
}
