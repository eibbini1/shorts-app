#!/usr/bin/env python3
"""Per-shot motion takes: the same approved first frame, a different motion seed.

Take 0 is the long-standing seed (2200 + shot*10 + part), so every existing cache and render is unchanged.
Take N adds N * 7919 (the same prime step the first-frame regenerate uses). Earlier takes stay cached on disk,
so switching back to one is instant. Up to MAX_TAKES takes per shot keeps time and disk bounded.
State lives in <work>/motion/takes.json: {"<shot index>": {"current": n, "highest": m}}.

CLI (used by the Studio server so there is one implementation):
  motion_takes.py select --work DIR --shot N [--take K]   -> prints JSON {shot, current, highest, max}
"""
import argparse, json, os, sys
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


def seed(work, index, part):
    """Motion seed for one clip part of shot `index` (0-based) at its current take."""
    return BASE_SEED + index * 10 + part + SEED_STEP * state(work, index)['current']


def select(work, index, take=None):
    """Move shot `index` to `take`, or to a brand-new take when take is None. Returns the new state."""
    now = state(work, index)
    if take is None:
        take = now['highest'] + 1
        if take >= MAX_TAKES:
            raise ValueError(f'All {MAX_TAKES} takes of this shot are used; switch back to one of them.')
    else:
        take = int(take)
        if not 0 <= take <= now['highest']:
            raise ValueError(f'Take {take + 1} has not been made yet.')
    data = load(work)
    data[str(index)] = {'current': take, 'highest': max(now['highest'], take)}
    path = _file(work)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data))
    os.replace(tmp, path)
    return state(work, index)


def main(argv):
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('select')
    s.add_argument('--work', required=True)
    s.add_argument('--shot', type=int, required=True, help='1-based shot number')
    s.add_argument('--take', type=int, help='0-based take to switch to; omit for a new take')
    a = p.parse_args(argv)
    if a.shot < 1:
        print(json.dumps({'error': 'shot must be 1 or more'})); return 2
    try:
        result = select(a.work, a.shot - 1, a.take)
    except ValueError as error:
        print(json.dumps({'error': str(error)})); return 3
    print(json.dumps({'shot': a.shot, **result, 'max': MAX_TAKES}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
