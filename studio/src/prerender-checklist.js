// What must be true before the long motion step starts. Pure: reads the same facts the render button already uses.
// state: 'ok' | 'todo' | 'blocked'. `ready` is true only when every item is ok.
export function prerenderChecklist({ shots = [], hasStill = () => false, needsHumanReview = false, blocked = false, otherJobRunning = false, rendersLeft = null, clips = 0, estimate = '' } = {}) {
  const missing = shots.map((_, i) => i + 1).filter((n) => !hasStill(n));
  const items = [
    { id: 'plan', label: 'Shot plan', state: shots.length ? 'ok' : 'blocked', detail: shots.length ? `${shots.length} shot${shots.length === 1 ? '' : 's'}, ${clips} clip${clips === 1 ? '' : 's'} to render` : 'No shots in the plan yet' },
    { id: 'frames', label: 'First frames', state: !shots.length ? 'blocked' : missing.length ? 'todo' : 'ok', detail: missing.length ? `Missing for shot${missing.length === 1 ? '' : 's'} ${missing.join(', ')}` : 'Every shot has a first frame' },
    { id: 'review', label: 'Frames reviewed', state: needsHumanReview ? 'todo' : 'ok', detail: needsHumanReview ? 'Your approval is needed: the automatic check did not approve every frame' : 'Automatic check passed; look them over before you press render' },
    { id: 'blocks', label: 'No blocking issues', state: blocked ? 'blocked' : 'ok', detail: blocked ? 'The plan has an unresolved block' : 'Nothing is blocking this plan' },
    { id: 'mac', label: 'Mac is free', state: otherJobRunning ? 'blocked' : 'ok', detail: otherJobRunning ? 'Another job is running; wait for it to finish' : 'No other job is running' },
  ];
  if (rendersLeft !== null) items.push({ id: 'quota', label: 'Renders left today', state: rendersLeft > 0 ? 'ok' : 'blocked', detail: rendersLeft > 0 ? `${rendersLeft} left` : 'Daily limit reached' });
  return { items, ready: items.every((i) => i.state === 'ok'), estimate };
}
