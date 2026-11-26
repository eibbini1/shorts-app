#!/usr/bin/env python3
"""Catalogue of licensed sound effects: measure, validate, and pick without repeats.

The library is a manifest (`assets/sfx/library.json`) that points at audio files
elsewhere under `assets/`. Audio stays out of Git; the manifest records where each
file came from, its licence, and measured facts (length, loudness, first-hit time).

    python3 scripts/sfx_library.py scan        # measure files, write facts into the manifest
    python3 scripts/sfx_library.py validate    # licence and file checks, exit 1 on problems
    python3 scripts/sfx_library.py pick crunch --seed 7 --avoid crunch-02
    python3 scripts/sfx_library.py samples crust-break=crunch bite=bite

`samples` prints a `foleySamples` object ready for a scenario's `audioPlan`.
"""
import argparse
import array
import hashlib
import json
import math
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets' / 'sfx' / 'library.json'
# Licences that need no credit and allow commercial video use. Anything else fails validation.
ALLOWED_LICENSES = {'CC0-1.0', 'PUBLIC-DOMAIN', 'OWN-RECORDING', 'PIXABAY-CONTENT'}
REQUIRED = ('id', 'file', 'category', 'license', 'sourceUrl', 'recordedAction')
CATEGORIES = {
    'crunch', 'bite', 'sizzle', 'pour', 'chop', 'contact', 'impact', 'riser', 'whoosh',
    'swell', 'stinger', 'land', 'ui', 'ambience', 'breath', 'transition',
}


def load(path=MANIFEST):
    return json.loads(Path(path).read_text())


def save(data, path=MANIFEST):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def decode_mono(path, rate=16000):
    """Decode any audio file to mono 16-bit samples with ffmpeg (no extra Python packages)."""
    out = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(rate), '-f', 's16le', '-'],
        capture_output=True, check=True).stdout
    samples = array.array('h')
    samples.frombytes(out[: len(out) // 2 * 2])
    return samples, rate


def measure(path):
    """Length, peak, loudness estimate and the time of the first real hit."""
    samples, rate = decode_mono(path)
    if not samples:
        raise ValueError(f'{path}: no audio decoded')
    peak = max(max(samples), -min(samples)) or 1
    window = max(1, rate // 100)  # 10 ms
    rms = []
    for start in range(0, len(samples) - window + 1, window):
        chunk = samples[start:start + window]
        rms.append(math.sqrt(sum(s * s for s in chunk) / window))
    floor = max(rms) * 0.2  # a hit is the first window within 14 dB of the loudest one
    first = next((i for i, value in enumerate(rms) if value >= floor), 0)
    mean_square = sum(s * s for s in samples) / len(samples)
    return {
        'durationSeconds': round(len(samples) / rate, 3),
        'peakDb': round(20 * math.log10(peak / 32768), 1),
        'rmsDb': round(10 * math.log10(max(mean_square, 1) / 32768 ** 2), 1),
        'firstHitSeconds': round(first * 0.01, 2),
    }


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def _resolve_under_root(root, rel_path):
    base = Path(root).resolve()
    candidate = (base / rel_path).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate


def problems(data, root=ROOT):
    """Return a list of human-readable problems; empty means the manifest is usable."""
    found, seen = [], set()
    for entry in data.get('entries', []):
        name = entry.get('id', '?')
        for key in REQUIRED:
            if not entry.get(key):
                found.append(f'{name}: missing {key}')
        if name in seen:
            found.append(f'{name}: duplicate id')
        seen.add(name)
        if entry.get('category') and entry['category'] not in CATEGORIES:
            found.append(f'{name}: unknown category {entry["category"]!r}')
        if entry.get('license') and entry['license'] not in ALLOWED_LICENSES:
            found.append(f'{name}: licence {entry["license"]!r} is not allowed (need no credit, commercial OK)')
        if entry.get('file'):
            audio = _resolve_under_root(root, entry['file'])
            if audio is None:
                found.append(f'{name}: file path escapes root ({entry["file"]})')
            elif not audio.is_file():
                found.append(f'{name}: file missing ({entry["file"]})')
            elif entry.get('sha256') and sha256(audio) != entry['sha256']:
                found.append(f'{name}: file changed since it was catalogued (sha256 differs)')
    return found


def pick(data, category, seed=0, avoid=()):
    """Choose one entry of a category. Skips `avoid` ids while any other variant exists."""
    pool = [e for e in data.get('entries', []) if e.get('category') == category]
    if not pool:
        raise LookupError(f'no sound in category {category!r}')
    fresh = [e for e in pool if e['id'] not in set(avoid)] or pool
    return random.Random(seed).choice(sorted(fresh, key=lambda e: e['id']))


def foley_samples(data, mapping, seed=0):
    """Build an audioPlan `foleySamples` object: {cueName: category} -> sample records."""
    used, samples = [], {}
    for cue, category in mapping.items():
        entry = pick(data, category, seed=seed, avoid=used)
        used.append(entry['id'])
        samples[cue] = {
            'file': entry['file'], 'recordedAction': entry['recordedAction'],
            'sourceUrl': entry['sourceUrl'], 'license': entry['license'],
            'offsetSeconds': entry.get('firstHitSeconds', 0),
        }
    return samples


def scan(data, root=ROOT):
    for entry in data.get('entries', []):
        audio = _resolve_under_root(root, entry['file'])
        if audio is None or not audio.is_file():
            print(f'skip {entry["id"]}: file missing or outside root', file=sys.stderr)
            continue
        entry.update(measure(audio))
        entry['sha256'] = sha256(audio)
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--manifest', default=str(MANIFEST))
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('scan')
    sub.add_parser('validate')
    pick_cmd = sub.add_parser('pick')
    pick_cmd.add_argument('category')
    pick_cmd.add_argument('--seed', type=int, default=0)
    pick_cmd.add_argument('--avoid', nargs='*', default=[])
    samples_cmd = sub.add_parser('samples')
    samples_cmd.add_argument('pairs', nargs='+', help='cue=category, for example crust-break=crunch')
    samples_cmd.add_argument('--seed', type=int, default=0)
    args = parser.parse_args(argv)
    data = load(args.manifest)
    if args.command == 'scan':
        save(scan(data), args.manifest)
        print(f'Measured {len(data["entries"])} entries')
    elif args.command == 'validate':
        found = problems(data)
        for line in found:
            print(line)
        print('OK' if not found else f'{len(found)} problem(s)')
        return 1 if found else 0
    elif args.command == 'pick':
        print(json.dumps(pick(data, args.category, args.seed, args.avoid), indent=2))
    elif args.command == 'samples':
        mapping = dict(pair.split('=', 1) for pair in args.pairs)
        print(json.dumps(foley_samples(data, mapping, args.seed), indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
