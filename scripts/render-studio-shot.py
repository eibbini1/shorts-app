#!/usr/bin/env python3
"""Render one Studio-approved shot and save its verified final frame for continuity."""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('render_any_local', SCRIPTS / 'render-any-local.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
from first_checks import check_clip
import render_quality


class Progress:
    def __init__(self, shot):
        self.shot = shot
        self.observed = []

    def mark_complete(self, _index, _part):
        return None

    def __call__(self, active=None, elapsed=0):
        part = active[1] + 1 if active else 1
        return f'[sequence] shot {self.shot + 1} motion part {part} ({elapsed:.0f}s)'


def file_hash(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--scenario-sha256', required=True, help='Expected hash of the approved story plan')
    parser.add_argument('--shot', required=True, type=int, help='1-based shot number')
    parser.add_argument('--reference', required=True, type=Path, help='Approved first frame inside the scenario work directory')
    parser.add_argument('--reference-sha256', required=True, help='Expected hash of the approved first frame')
    parser.add_argument('--editor', choices=('ffmpeg', 'artcraft'), default='ffmpeg')
    args = parser.parse_args()

    scenario = args.scenario.expanduser().resolve()
    if not scenario.is_file():
        parser.error(f'Missing scenario: {scenario}')
    renderer.run('node', ROOT / 'scripts/bb-local-scenario.mjs', '--validate', scenario)
    if file_hash(scenario) != args.scenario_sha256:
        raise RuntimeError('The story plan changed after this shot was approved.')
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    shots = data['plan']['shots']
    if not 1 <= args.shot <= len(shots):
        parser.error(f'--shot must be between 1 and {len(shots)}')
    index = args.shot - 1
    work = ROOT / 'storage/any-local' / scenario.stem
    work = work.resolve()
    reference = args.reference.expanduser().resolve()
    if not reference.is_file() or not reference.is_relative_to(work):
        parser.error('The approved reference must be an existing image inside this scenario work directory.')
    approved_reference_sha256 = file_hash(reference)
    if approved_reference_sha256 != args.reference_sha256:
        raise RuntimeError('The approved first frame changed before motion generation.')

    shot = shots[index]
    width, height = render_quality.dimensions(data['settings'])
    reference = renderer.prep_still(work, reference) if args.editor == 'artcraft' else reference
    model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
    gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
    parts = math.ceil(shot['seconds'] / 5)
    progress = Progress(index)
    previous_clip = None
    current_reference = reference
    for part in range(parts):
        if part:
            anchor = work / 'motion' / f'shot-{index:02d}-part-{part - 1:02d}-anchor.png'
            renderer.run('ffmpeg', '-y', '-v', 'error', '-sseof', '-0.05', '-i', previous_clip,
                         '-frames:v', 1, anchor)
            current_reference = anchor
        previous_clip = renderer.clip(work, index, part, shot, 2200 + index * 10 + part,
                                      current_reference, width, height, model, gemma,
                                      progress, cache_only=False)
        if index == 0 and part == 0:
            problem = check_clip(previous_clip)
            if problem:
                raise RuntimeError(f'First clip failed: {problem}')
    end_frame = renderer.extract_end_frame(work, index, previous_clip)
    sequence_dir = work / 'sequence'
    sequence_dir.mkdir(parents=True, exist_ok=True)
    result = {
        'schemaVersion': 1,
        'scenarioSha256': file_hash(scenario),
        'shot': args.shot,
        'approvedReferenceSha256': approved_reference_sha256,
        'clip': str(previous_clip.relative_to(work)),
        'clipSha256': file_hash(previous_clip),
        'endFrame': str(end_frame.relative_to(work)),
        'endFrameSha256': file_hash(end_frame),
    }
    manifest = sequence_dir / f'shot-{args.shot:02d}.json'
    temporary = manifest.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    temporary.replace(manifest)
    print(json.dumps({
        'event': 'shot-motion-complete',
        'shot': args.shot,
        'clip': str(previous_clip.relative_to(work)),
        'clipSha256': file_hash(previous_clip),
        'endFrame': str(end_frame.relative_to(work)),
        'endFrameSha256': file_hash(end_frame),
    }), flush=True)


if __name__ == '__main__':
    main()
