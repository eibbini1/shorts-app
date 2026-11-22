// Server-side reader for `@@event {json}` lines (writer: scripts/pipeline_events.py).
// studio/src/pipeline-lines.js holds the same parser for the browser; the contract test keeps them equal.
export const EVENT_PREFIX = '@@event ';

export function parseEventLine(line) {
  const text = String(line || '');
  if (!text.startsWith(EVENT_PREFIX)) return null;
  try {
    const event = JSON.parse(text.slice(EVENT_PREFIX.length));
    return event && typeof event === 'object' && typeof event.type === 'string' ? event : null;
  } catch { return null; }
}
