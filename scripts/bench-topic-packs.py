#!/usr/bin/env python3
"""Dry-run or render the original local topic-pack clips in serial."""
import argparse
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]


class Progress:
    def __init__(self):
        self.observed = []

    def mark_complete(self, _index, _part):
        pass

    def __call__(self, active=None, elapsed=0):
        return f'Motion elapsed: {elapsed:.0f}s'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true', help='Start the selected local model jobs')
    parser.add_argument('--pack', help='One topic pack ID')
    parser.add_argument('--limit', type=int, help='Stop after this many clips')
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be at least 1.')
    data = json.loads((ROOT / 'data/topic-pack-pilots.json').read_text())
    bank = json.loads((ROOT / 'data/topic-packs.json').read_text())
    pack_ids = {pack['id'] for pack in bank['packs']}
    cases = data['cases']
    ids = {case['id'] for case in cases}
    if len(ids) != len(cases) or any(case['pack'] not in pack_ids or not case['image'] or not case['motion'] for case in cases):
        parser.error('The pilot set has duplicate IDs, unknown packs, or missing prompts.')
    selected = [(index, case) for index, case in enumerate(cases) if not args.pack or case['pack'] == args.pack]
    if not selected:
        parser.error('No cases match that pack.')
    selected = selected[:args.limit]
    print('Selected clips: ' + ', '.join(case['id'] for _, case in selected), flush=True)
    if not args.render:
        print('Dry run. No model jobs started.')
        return 0

    spec = importlib.util.spec_from_file_location('render_any_local', ROOT / 'scripts/render-any-local.py')
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    from first_checks import check_clip, check_still
    from render_quality import dimensions

    work = ROOT / 'storage/benchmarks/topic-pack-pilots-v1'
    (work / 'refs').mkdir(parents=True, exist_ok=True)
    (work / 'motion').mkdir(parents=True, exist_ok=True)
    model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
    gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
    width, height = dimensions({'format': 'short', 'quality': 'standard'})
    report_path = work / 'results.json'
    existing = json.loads(report_path.read_text()) if report_path.exists() else {}
    for index, case in selected:
        case_id = case['id']
        row = {'pack': case['pack'], 'nativeWidth': width, 'nativeHeight': height, 'frames': 97,
               'fps': renderer.FPS, 'status': 'pending', 'humanRating': None}
        started = time.monotonic()
        try:
            shot = {'imagePrompt': case['image'], 'motionPrompt': case['motion']}
            row.update(imageSeed=1200 + index, motionSeed=2200 + index * 10, **shot)
            image = renderer.still(work, index, shot, 1200 + index, None, width, height)
            row['firstFrame'] = str(image.relative_to(ROOT))
            row['firstFrameSha256'] = renderer.file_hash(image)
            still_problem = check_still(image)
            if still_problem:
                row.update(status='first-frame-review', technicalFlag=still_problem)
            else:
                progress = Progress()
                clip = renderer.clip(work, index, 0, shot, row['motionSeed'], image,
                                     width, height, model, gemma, progress)
                flag = check_clip(clip)
                row.update(status='technical-review' if flag else 'editorial-review',
                           clip=str(clip.relative_to(ROOT)), clipSha256=renderer.file_hash(clip),
                           technicalFlag=flag, motionCacheHit=not progress.observed,
                           motionRenderSeconds=round(progress.observed[0], 1) if progress.observed else None)
        except Exception as error:
            row.update(status='failed', error=str(error))
        prior = existing.get(case_id, {})
        if row.get('clipSha256') and row.get('clipSha256') == prior.get('clipSha256'):
            row['humanRating'] = prior.get('humanRating')
            if row.get('motionCacheHit'):
                row['motionRenderSeconds'] = prior.get('motionRenderSeconds')
        row['seconds'] = round(time.monotonic() - started, 1)
        existing[case_id] = row
        temporary = report_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(existing, indent=2) + '\n')
        temporary.replace(report_path)
        print(f'{case_id}: {row["status"]} ({row["seconds"]}s)', flush=True)
    return int(any(existing[case['id']]['status'] == 'failed' for _, case in selected))


if __name__ == '__main__':
    raise SystemExit(main())
