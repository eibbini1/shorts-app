#!/usr/bin/env python3
"""Record a person's watch-and-listen review of the exact final film, then re-score it.

The release score keeps 50 of its 100 points for five editorial ratings. This turns one review
into the evidence file score-local-video.py requires: the six review facts, the reviewer's name,
the five 0–5 ratings, and the SHA-256 of the file that was watched. It never fills a rating in.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('continuity', 'realism', 'story', 'audio', 'payoff')
QUESTIONS = {
    'continuity': 'Does one subject and location persist from first to last shot?',
    'realism': 'Do food and human motion look believable at phone size?',
    'story': 'Do the shots form one beginning-to-end story?',
    'audio': 'Is the narration natural and the soundtrack/ASMR balanced?',
    'payoff': 'Is the promised final action visibly achieved?',
}
FACTS = {
    'watchedFullVideo': 'Did you watch the whole film at phone size?',
    'listenedFullAudio': 'Did you listen to the whole film on speakers or headphones?',
    'checkedOpeningHook': 'Did you check the first two seconds as a scroll-stopper?',
    'checkedFoodContinuity': 'Did you check the food stays the same dish across shots?',
    'checkedShotTransitions': 'Did you check every cut between shots?',
    'checkedSoundCueSync': 'Did you check each sound cue lands with its action?',
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def parse_scores(text):
    parts = [part.strip() for part in text.split(',')]
    if len(parts) != len(CATEGORIES):
        raise ValueError(f'give five ratings in this order: {", ".join(CATEGORIES)}')
    values = []
    for part in parts:
        value = float(part)
        if not 0 <= value <= 5:
            raise ValueError('each rating must be 0–5')
        values.append(int(value) if value.is_integer() else value)
    return dict(zip(CATEGORIES, values))


def build_record(scores, facts, reviewer, video_sha256, notes=''):
    missing = [key for key in FACTS if facts.get(key) is not True]
    if missing:
        raise ValueError('review is incomplete: ' + ', '.join(missing))
    if not reviewer.strip():
        raise ValueError('reviewer name is required')
    if set(scores) != set(CATEGORIES):
        raise ValueError('all five ratings are required')
    return {**scores, 'notes': notes,
            'reviewEvidence': {**{key: True for key in FACTS}, 'reviewer': reviewer.strip(),
                               'videoSha256': video_sha256,
                               'reviewedAt': datetime.now(timezone.utc).isoformat()}}


def projected_score(scores, machine_points=50):
    return machine_points + 2 * sum(scores.values())


def ask_yes(question):
    return input(f'{question} [y/n] ').strip().lower() in ('y', 'yes')


def ask_rating(category):
    while True:
        try:
            value = float(input(f'{category} 0–5 — {QUESTIONS[category]} '))
        except ValueError:
            continue
        if 0 <= value <= 5:
            return int(value) if value.is_integer() else value


def show_prereview(video, digest):
    report_path = video.with_suffix('.prereview.json')
    if not report_path.is_file():
        print('No machine pre-review for this file; run prereview-local-video.py first for flags.')
        return
    report = json.loads(report_path.read_text())
    if report.get('videoSha256') != digest:
        print('The machine pre-review belongs to a different version of this file; ignoring it.')
        return
    flagged = report.get('likelyBelow4') or []
    print('Machine pre-review:', 'no flags' if not flagged else 'check ' + ', '.join(flagged))
    for category, items in (report.get('flags') or {}).items():
        for item in items:
            print(f'  {category}: {item}')
    print(f'Contact sheet: {report.get("contactSheet")}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--pack', required=True, type=Path)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--reviewer')
    parser.add_argument('--scores', help='continuity,realism,story,audio,payoff (each 0–5)')
    parser.add_argument('--confirm-watched-and-listened', action='store_true',
                        help='With --scores: you watched the whole film and listened to it, and checked the hook, '
                             'food continuity, every cut and every sound cue')
    parser.add_argument('--notes', default='')
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    video = args.video.resolve()
    if not video.is_file():
        parser.error('video must exist')
    digest = sha256(video)
    show_prereview(video, digest)
    if args.scores:
        if not args.confirm_watched_and_listened:
            parser.error('--scores needs --confirm-watched-and-listened; a rating without a full review cannot count')
        try:
            scores = parse_scores(args.scores)
        except ValueError as error:
            parser.error(str(error))
        facts = {key: True for key in FACTS}
        reviewer, notes = args.reviewer or '', args.notes
    else:
        if not sys.stdin.isatty():
            parser.error('interactive review needs a terminal; or pass --scores with --confirm-watched-and-listened')
        if not args.no_open and sys.platform == 'darwin':
            subprocess.run(['open', str(video)], check=False)
            print('Opened the film. Watch it at phone size and listen fully, then answer.')
        facts = {key: ask_yes(question) for key, question in FACTS.items()}
        if not all(facts.values()):
            print('Not recorded: finish the full watch and listen first. Nothing was scored.')
            return 2
        scores = {category: ask_rating(category) for category in CATEGORIES}
        reviewer = args.reviewer or input('Reviewer name: ')
        notes = args.notes or input('Notes (what to fix next, optional): ')
    try:
        record = build_record(scores, facts, reviewer, digest, notes)
    except ValueError as error:
        parser.error(str(error))
    output = args.output or ROOT / 'storage/learning/reviews' / f'{video.stem}.editorial.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(record, indent=2) + '\n')
    print(f'Review saved: {output}')
    low = [key for key in CATEGORIES if scores[key] < 4]
    print(f'Expected score if technical and story stay full: {projected_score(scores)}/100'
          + (f'; release needs 4+ in {", ".join(low)}' if low else ''))
    return subprocess.run([sys.executable, str(ROOT / 'scripts/score-local-video.py'), '--scenario', str(args.scenario),
                           '--pack', str(args.pack), '--video', str(video), '--editorial', str(output)]).returncode


if __name__ == '__main__':
    sys.exit(main())
