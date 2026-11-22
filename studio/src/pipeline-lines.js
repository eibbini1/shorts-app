// How the Studio reads pipeline output. Two inputs:
//  1. human text lines (job.lines) — the original contract, kept unchanged;
//  2. structured events (job.events) — `@@event {json}` lines the pipeline prints alongside the text.
// Every reader prefers events when present and falls back to the text, so older sessions still work.
export const EVENT_PREFIX = '@@event ';

export function parseEventLine(line) {
  const text = String(line || '');
  if (!text.startsWith(EVENT_PREFIX)) return null;
  try {
    const event = JSON.parse(text.slice(EVENT_PREFIX.length));
    return event && typeof event === 'object' && typeof event.type === 'string' ? event : null;
  } catch { return null; }
}

export function notesOf(lines) {
  // A provisional QA score only means a human rating is pending; it is not a block.
  return (lines || []).filter((l) => /^(BLOCKED|REVIEW|WARNING|Fixed automatically)/.test(l))
    .map((l) => (/^BLOCKED:.*provisional score/.test(l) ? 'REVIEW: waiting for your rating (thumbs up or down below)' : l));
}
export const isBlocked = (notes) => notes.some((l) => l.startsWith('BLOCKED'));
export const choiceOf = (lines) => ((lines || []).find((l) => l.startsWith('NEEDS-CHOICE: ')) || '').slice(14);
export const attemptCount = (lines) => (lines || []).filter((l) => /^Attempt \d+\/\d+/.test(l)).length;

export function progressOf(lines) {
  let best = null;
  for (const l of lines || []) {
    const m = l.match(/(?:beat|clip|shot|still)s?\s+(\d+)\s*\/\s*(\d+)/i) || l.match(/(\d+)\s*\/\s*(\d+)\b/);
    if (m && +m[2] > 0 && +m[1] <= +m[2]) best = { n: +m[1], of: +m[2], label: l.slice(0, 70) };
  }
  return best;
}

export function nowLine(lines) {
  const p = [...(lines || [])].reverse().find((l) => String(l).includes('[progress]'));
  if (!p) return 'Getting ready...';
  const m = String(p).split('[progress]')[1] || '';
  const parts = m.split('|').map((x) => x.trim());
  const clips = parts.find((x) => /motion clips/.test(x)) || '';
  const what = parts.find((x) => /rendering|still|FLUX|voice|sound|finish/i.test(x)) || parts[3] || '';
  const left = parts.find((x) => /remaining/.test(x)) || '';
  return [what, clips && 'done: ' + clips.replace(' motion clips', ' clips'), left].filter(Boolean).join(' · ');
}

/** Gate blocks from structured events: [{gate, code, shot, message}]. Empty when the run printed none. */
export function gateBlocks(events) {
  return (events || []).filter((e) => e.type === 'gate' && (e.status === 'blocked' || e.status === 'failed'));
}

/** Block reasons for the blocked card: event messages when present, else the BLOCKED: text lines. */
export function blockReasons(lines, events, plain = (x) => x) {
  const fromEvents = gateBlocks(events).map((e) => plain(String(e.message || e.code || e.gate)));
  if (fromEvents.length) return [...new Set(fromEvents)];
  return [...new Set((lines || []).filter((l) => l.startsWith('BLOCKED: ')).map((l) => plain(l.slice(9))))];
}

/** Fixes that belong to one shot: events carry the shot number; text needs a "shot N" match. */
export function shotFixes(n, notes, events, plain = (x) => x) {
  const fromEvents = gateBlocks(events).filter((e) => Number(e.shot) === n).map((e) => plain(String(e.message || e.code)));
  const fromText = (notes || []).filter((l) => /^BLOCKED/.test(l) && new RegExp('shots?\\s*' + n + '\\b', 'i').test(l))
    .map((l) => plain(l.replace(/^BLOCKED:\s*/, '')));
  return [...new Set([...fromEvents, ...fromText])];
}
