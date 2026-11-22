// "Another take" controls for one finished shot. Takes are motion seeds on the same approved first frame
// (scripts/motion_takes.py owns the real state; the server sends it as files.takes keyed by 0-based shot).
export const MAX_TAKES = 3;

export function takeState(takes, shotNumber) {
  const entry = (takes && takes[String(shotNumber - 1)]) || {};
  const current = Math.min(Math.max(Number.isInteger(entry.current) ? entry.current : 0, 0), MAX_TAKES - 1);
  const highest = Math.min(Math.max(Number.isInteger(entry.highest) ? entry.highest : current, current), MAX_TAKES - 1);
  return { current, highest };
}

// What to show under a shot: whether a new take is allowed, and the switch buttons for takes already made.
export function takeControls(takes, shotNumber) {
  const { current, highest } = takeState(takes, shotNumber);
  const canMakeNew = highest + 1 < MAX_TAKES;
  const switches = highest > 0 ? Array.from({ length: highest + 1 }, (_, take) => ({ take, label: `Take ${take + 1}`, active: take === current })) : [];
  return { current, highest, canMakeNew, switches, label: `Take ${current + 1} of ${MAX_TAKES}` };
}
