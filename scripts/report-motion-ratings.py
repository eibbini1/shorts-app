#!/usr/bin/env python3
"""Export hash-bound owner motion ratings and report where gate evidence exists."""
import argparse
import json
import os
from pathlib import Path
import re
from statistics import mean
from tempfile import NamedTemporaryFile

DIMENSIONS = ('identity', 'action', 'realism')
RATING_THRESHOLD = 4
GATES = {
    'technical-screen': None,
    'black-frames': None,
    'frozen-motion': None,
    'identity-drift': 'identity',
    'missed-action': 'action',
    'unnatural-motion': 'realism',
}
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LEDGER = ROOT / 'storage/studio-learning/runs.jsonl'
DEFAULT_GOLDEN = ROOT / 'outputs/golden/golden-set-v0.jsonl'
HASH = re.compile(r'[0-9a-f]{64}')
ORIGIN = 'studio-owner-motion-v1'


def verified_rating(row):
    ratings = row.get('ratings')
    return isinstance(ratings, dict) and all(type(ratings.get(key)) is int and 1 <= ratings[key] <= 5 for key in DIMENSIONS)


def collect(lines):
    latest, evidence = {}, {}
    for line in lines:
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        clip = row.get('clipSha256')
        if not isinstance(clip, str) or not HASH.fullmatch(clip):
            continue
        if row.get('type') == 'motion-take-review' and verified_rating(row) and isinstance(row.get('user'), str):
            role = row.get('reviewerRole')
            role = role if role in ('owner', 'creator') else 'unverified'
            latest[role, row['user'], clip] = row
        gate = row.get('gate')
        if (row.get('type') == 'motion-clip-gate' and row.get('schemaVersion') == 1 and
                isinstance(gate, str) and gate in GATES and type(row.get('flagged')) is bool and
                isinstance(row.get('gateVersion'), str) and row['gateVersion']):
            evidence[clip, gate] = row
    return latest, evidence


def make_rows(latest, evidence):
    rows = []
    for (role, reviewer, clip), row in sorted(latest.items()):
        if role != 'owner':
            continue
        gates = {gate: {'version': item['gateVersion'], 'flagged': item['flagged'],
                        'thresholds': item.get('thresholds')}
                 for gate in GATES if (item := evidence.get((clip, gate)))}
        entry = {'kind': 'clip', 'id': f'studio-{reviewer}-{clip}', 'sha256': clip, 'labeler': 'owner',
                 'source': ORIGIN, 'reviewer': reviewer, 'scale': '1-5',
                 'labels': {key: row['ratings'][key] for key in DIMENSIONS}, 'gates': gates}
        for key in ('clip', 'session', 'shot', 'take', 'part', 'seconds', 'ts', 'notes'):
            if row.get(key) is not None:
                entry['path' if key == 'clip' else key] = row[key]
        rows.append(entry)
    return rows


def summarize(lines):
    latest, evidence = collect(lines)
    owners = make_rows(latest, evidence)
    per_gate = {}
    for gate, dimension in GATES.items():
        pairs = [(row['gates'][gate], row['labels']) for row in owners if gate in row['gates']]
        counts = {'pairs': len(pairs), 'missing': len(owners) - len(pairs)}
        if dimension:
            counts['comparison'] = f'{dimension} below {RATING_THRESHOLD}'
            counts['agree'] = sum(flag['flagged'] == (ratings[dimension] < RATING_THRESHOLD) for flag, ratings in pairs)
        else:
            counts['comparison'] = 'Co-occurrence only'
            counts['flaggedAndLowRealism'] = sum(flag['flagged'] and ratings['realism'] < RATING_THRESHOLD for flag, ratings in pairs)
        per_gate[gate] = counts
    return {
        'reviewerFilter': 'Authenticated owner only. Creator and legacy unknown-role ratings are excluded.',
        'ratedClips': len({row['sha256'] for row in owners}),
        'reviewerClipRatings': len(owners),
        'excludedRatings': sum(role != 'owner' for role, _, _ in latest),
        'meanHumanRating': {key: round(mean(row['labels'][key] for row in owners), 2) if owners else None
                            for key in DIMENSIONS},
        'gates': per_gate,
    }, owners


def export(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    prior = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
    retained = []
    for line in prior:
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or row.get('source') != ORIGIN:
            retained.append(line)
    content = ''.join(line + '\n' for line in retained)
    content += ''.join(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n' for row in rows)
    if path.exists() and content == path.read_text(encoding='utf-8'):
        return
    with NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as handle:
        name = handle.name
        handle.write(content)
    try:
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', type=Path, default=DEFAULT_LEDGER)
    parser.add_argument('--export', nargs='?', type=Path, const=DEFAULT_GOLDEN,
                        help='Update existing golden set with current owner ratings. Omit for a read-only report.')
    args = parser.parse_args()
    if args.ledger.is_file():
        with args.ledger.open(encoding='utf-8') as ledger:
            report, rows = summarize(ledger)
    elif args.export:
        parser.error('The ratings ledger does not exist. The golden set was not changed.')
    else:
        report, rows = summarize(())
    if args.export:
        export(args.export, rows)
        report['goldenSet'] = str(args.export)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
