#!/usr/bin/env python3
"""Per-shot motion takes: the same approved first frame, a different motion seed.

Take 0 is the long-standing seed (2200 + shot*10 + part), so every existing cache and render is unchanged.
Take N adds N * 7919 (the same prime step the first-frame regenerate uses). Earlier takes stay cached on disk,
so switching back to one is instant. Up to MAX_TAKES takes per shot keeps time and disk bounded.
Studio owns the committed take registry. Render workers read it and report
completed artifacts to Studio instead of updating the selection themselves.
"""
import json
from pathlib import Path

MAX_TAKES = 3
SEED_STEP = 7919
BASE_SEED = 2200


def _file(work):
    return Path(work) / 'motion' / 'takes.json'


def load(work):
    try:
        data = json.loads(_file(work).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def state(work, index):
    entry = load(work).get(str(index)) or {}
    current = int(entry.get('current', 0)) if str(entry.get('current', 0)).lstrip('-').isdigit() else 0
    highest = int(entry.get('highest', current)) if str(entry.get('highest', current)).lstrip('-').isdigit() else current
    current = min(max(current, 0), MAX_TAKES - 1)
    highest = min(max(highest, current), MAX_TAKES - 1)
    return {'current': current, 'highest': highest}


def seed(work, index, part, *, take=None):
    """Motion seed for one clip part of a zero-based shot and take."""
    if take is None:
        take = state(work, index)['current']
    return BASE_SEED + index * 10 + part + SEED_STEP * take
