// "Another take" controls for one finished shot. Takes are motion seeds on the same approved first frame
// (the server sends verified completed takes keyed by zero-based shot).
export const MAX_TAKES = 3;

export function takeState(takes, shotNumber) {
  const entry = (takes && takes[String(shotNumber - 1)]) || {};
  const current = Math.min(Math.max(Number.isInteger(entry.current) ? entry.current : 0, 0), MAX_TAKES - 1);
  const highest = Math.min(Math.max(Number.isInteger(entry.highest) ? entry.highest : current, current), MAX_TAKES - 1);
  return { current, highest };
}

// What to show under a shot: whether a new take is allowed, and the switch buttons for takes already made.
export function takeControls(takes, shotNumber) {
  const { current } = takeState(takes, shotNumber);
  const completed = (takes?.[shotNumber - 1]?.completed || [])
    .filter((take) => Number.isInteger(take) && take >= 0 && take < MAX_TAKES);
  const canMakeNew = new Set(completed).size < MAX_TAKES;
  const switches = completed.length > 1 ? completed.map((take) => ({
    take, label: `Take ${take + 1}`, active: take === current,
  })) : [];
  return { current, canMakeNew, switches, label: `Take ${current + 1} of ${MAX_TAKES}` };
}
