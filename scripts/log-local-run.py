#!/usr/bin/env python3
"""Record a completed local render for future comparison and reviewed-shot retrieval."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG = ROOT / 'storage/learning/local-runs.jsonl'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--pack', type=Path)
    p.add_argument('--log', type=Path, default=DEFAULT_LOG)
    a = p.parse_args()
    scenario, video = a.scenario.resolve(), a.video.resolve()
    if not scenario.is_file() or not video.is_file(): p.error('Scenario and completed video must exist')
    pack = (a.pack or video.with_name(video.stem.replace('.captioned', '') + '.pack.json')).resolve()
    scenario_data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    pack_data = json.loads(pack.read_text(encoding='utf-8-sig')) if pack.is_file() else {}
    video_sha = sha(video)
    log = a.log.resolve()
    if log.is_file():
        for line in log.read_text().splitlines():
            try:
                if json.loads(line).get('videoSha256') == video_sha:
                    print('Run already recorded; no duplicate learning record added.')
                    return
            except json.JSONDecodeError:
                continue
    record = {
        'recordedAt': datetime.now(timezone.utc).isoformat(),
        'scenario': str(scenario), 'scenarioSha256': sha(scenario),
        'video': str(video), 'videoSha256': video_sha,
        'title': scenario_data['plan']['title'], 'topic': scenario_data.get('topic'),
        'storyModel': scenario_data.get('model'), 'voice': scenario_data.get('settings', {}).get('voice', 'af_heart'),
        'seconds': scenario_data['settings']['seconds'],
        'shotCount': len(scenario_data['plan']['shots']),
        'qualityChecks': scenario_data.get('qualityChecks'),
        'technicalQa': pack_data.get('qa'), 'timingsSeconds': pack_data.get('timingsSeconds'),
        'editorialReview': 'pending',
        'learningRule': 'Technical QA is not visual approval. Only separately reviewed shots with all scores >=4 may be reused as prompt examples.',
    }
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a') as target: target.write(json.dumps(record, ensure_ascii=False)+'\n')
    print(f'Recorded run for local comparison: {log}')


if __name__ == '__main__': main()
