#!/usr/bin/env python3
"""Score a local Short; require editorial evidence before declaring 90/100 quality."""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('continuity', 'realism', 'story', 'audio', 'payoff')
TECHNICAL = ('blackFrames', 'frozenPicture', 'loudness', 'silence', 'length', 'hookSpokenEarly')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--pack', required=True, type=Path)
    p.add_argument('--qa-report', type=Path, help='QA for the exact exported film; overrides the earlier pack QA')
    p.add_argument('--video', type=Path, help='Exact exported film for scene-cut analysis')
    p.add_argument('--editorial', type=Path, help='JSON with 0–5 scores for continuity, realism, story, audio, payoff')
    p.add_argument('--output', type=Path)
    p.add_argument('--min-score', type=int, default=90)
    p.add_argument('--history', type=Path, default=ROOT / 'storage/learning/quality-scores.jsonl')
    a = p.parse_args()
    scenario = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    pack = json.loads(a.pack.read_text(encoding='utf-8-sig'))
    qa = json.loads(a.qa_report.read_text()) if a.qa_report else pack.get('qa', {})
    checks = qa.get('checks', {})
    technical = {name: bool(checks.get(name, {}).get('ok')) and 'skipped' not in str(checks.get(name, {}).get('note', '')).lower() for name in TECHNICAL}
    technical_points = 5 * sum(technical.values())
    audit = subprocess.run([sys.executable, str(ROOT / 'scripts/audit-local-story.py'), str(a.scenario)], capture_output=True, text=True)
    preflight = subprocess.run([sys.executable, str(ROOT / 'scripts/preflight-short.py'), str(a.scenario), '--strict'], capture_output=True, text=True)
    hook = re.search(r'-> (\d+)/100', preflight.stdout)
    hook_score = int(hook.group(1)) if hook else 0
    story_points = (10 if audit.returncode == 0 else 0) + (5 if hook_score >= 70 else 0) + (5 if preflight.returncode == 0 else 0)
    scene_analysis = {'available': False}
    scene_python = ROOT / 'storage/tools/scenedetect/.venv/bin/python'
    video_name = pack.get('video')
    video_path = a.video or (a.pack.parent / video_name if video_name else None)
    if scene_python.is_file() and video_path and video_path.is_file():
        probe = subprocess.run([str(scene_python), str(ROOT/'scripts/scene-cuts.py'), '--video', str(video_path)], capture_output=True, text=True, timeout=90)
        if probe.returncode == 0:
            scene_analysis = json.loads(probe.stdout)
            scene_analysis['available'] = True
    editorial = None
    if a.editorial:
        editorial = json.loads(a.editorial.read_text(encoding='utf-8-sig'))
        if set(editorial) != set(CATEGORIES) or any(type(editorial[key]) not in (int, float) or not 0 <= editorial[key] <= 5 for key in CATEGORIES):
            p.error('Editorial JSON needs exactly continuity, realism, story, audio, payoff, each scored 0–5')
    editorial_points = sum(editorial.values()) * 2 if editorial else 0
    score = technical_points + story_points + editorial_points
    critical = [key for key in CATEGORIES if editorial and editorial[key] < 4]
    status = 'review-needed' if editorial is None else 'pass' if score >= a.min_score and not critical and all(technical.values()) else 'revise'
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'title': scenario['plan']['title'],
        'score': score, 'possible': 100, 'minimum': a.min_score, 'status': status,
        'technicalPoints': technical_points, 'storyPoints': story_points, 'editorialPoints': editorial_points,
        'technicalChecks': technical, 'hookScore': hook_score, 'editorial': editorial,
        'reviewedVideo': str(video_path) if video_path else None,
        'sceneAnalysis': scene_analysis,
        'criticalEditorialBelow4': critical,
        'note': 'A 90+ score is a release gate, not a prediction of views. Editorial scores require actual viewing and listening; missing review cannot pass.',
    }
    output = a.output or a.pack.with_suffix('.quality.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+'\n')
    if editorial is not None:
        history = a.history.resolve()
        history.parent.mkdir(parents=True, exist_ok=True)
        prior = []
        if history.is_file():
            prior = [json.loads(line) for line in history.read_text().splitlines() if line.strip()]
        prior = [row for row in prior if row.get('scenario') != str(a.scenario.resolve())]
        prior.append({'scenario':str(a.scenario.resolve()), 'title':report['title'], 'checkedAt':report['checkedAt'], 'score':score, 'status':status, 'editorial':editorial})
        history.write_text(''.join(json.dumps(row)+'\n' for row in prior))
    print(f'{status.upper()}: {score:.0f}/100 (technical {technical_points}/30, story {story_points}/20, editorial {editorial_points:.0f}/50)')
    if editorial is None: print('Watch and listen, then supply five editorial scores to reach a final result.')
    if critical: print('Revise critical categories below 4/5:', ', '.join(critical))
    print(f'Report: {output}')
    return 0 if status == 'pass' else 1


if __name__ == '__main__': sys.exit(main())
