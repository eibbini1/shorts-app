// Per-clip progress for a running render: which clips are finished, which one is rendering now, how long it
// has been going, and whether it is taking noticeably longer than the measured pace.
// Clips are numbered 1..total in file order; the pipeline writes them one after another, so the first clip
// without a file is the one in progress.
export function clipProgress({ total, doneShots = [], startedAt, lastDoneAt = 0, now, cycleSec, startSec = 10 }) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const done = new Set(doneShots.map(Number));
  let active = null;
  const clips = [];
  for (let shot = 1; shot <= count; shot += 1) {
    if (done.has(shot)) { clips.push({ shot, state: 'done' }); continue; }
    if (active === null) {
      active = shot;
      const since = Math.max(lastDoneAt || 0, (startedAt || now) + startSec * 1000);
      const elapsedSec = Math.max(0, Math.round((now - since) / 1000));
      clips.push({ shot, state: 'active', elapsedSec, slow: Boolean(cycleSec) && elapsedSec > cycleSec * 1.5 });
    } else {
      clips.push({ shot, state: 'queued' });
    }
  }
  return clips;
}
