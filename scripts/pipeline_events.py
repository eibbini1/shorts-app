"""Structured pipeline events for the Studio, printed next to the human-readable lines.

One line per event: '@@event ' + compact JSON with a 'type' field. Readers that do not
understand events ignore the line; the Studio parses it in studio/src/pipeline-lines.js.
Never put secrets, tokens or absolute user paths in an event.
"""
import json
import re
import sys

PREFIX = '@@event '
_SHOT = re.compile(r'\bshots?\s+(\d+)\b', re.I)


def shot_of(text):
    """First shot number named in a message ('shot 2: ...'), or None."""
    match = _SHOT.search(str(text or ''))
    return int(match.group(1)) if match else None


def emit(event_type, stream=None, **fields):
    """Print one event line. Fields with value None are dropped."""
    event = {'type': event_type, **{k: v for k, v in fields.items() if v is not None}}
    out = stream or sys.stdout
    print(PREFIX + json.dumps(event, ensure_ascii=False, separators=(',', ':')), file=out, flush=True)
    return event


def gate(name, status, code, message=None, shot=None, stream=None):
    """A gate outcome: status is passed | blocked | failed | repaired | review."""
    if shot is None and message:
        shot = shot_of(message)
    return emit('gate', stream=stream, gate=name, status=status, code=code,
                message=str(message)[:400] if message else None, shot=shot)
