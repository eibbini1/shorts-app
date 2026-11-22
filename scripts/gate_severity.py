#!/usr/bin/env python3
"""Which story-gate problems stop a render and which only warn.

Owner direction (2026-11-22): "stop blocking, start warning". Style and quality rules warn and the
run continues. A problem stays blocking when it contradicts the owner's idea (wrong hook, action or
ending), would make the render fail or waste hours (schema, timing, exact repeats), or is a factual
honesty rule (evidence gate). Anything not recognised is treated as blocking, so a new gate message is
never silently downgraded.
"""
import re

# Style / quality rules: the film can still be made exactly as requested, it may just look weaker.
SOFT = [
    r'^weak hook',
    r'^picture prompts score',
    r'not framed close',
    r'^title does not name the requested subject',
    r'^opening narration exceeds',
    r'narration cannot fit',
    r'narration ends mid-sentence',
    r'near-identical',
    r'has no recognizable physical action',
    r'uses abstract or placeholder motion',
    r'is camera movement over a still',
    r'^recipe sequence (needs an explicit cooking-time cut|phases must progress)',
    r'sound plan has a gap',
]
SOFT_RE = [re.compile(p, re.I) for p in SOFT]


def is_soft(problem):
    text = str(problem).strip()
    return any(rx.search(text) for rx in SOFT_RE)


def split(problems):
    """Return (hard, soft), each keeping the original order."""
    hard, soft = [], []
    for problem in problems:
        (soft if is_soft(problem) else hard).append(problem)
    return hard, soft
