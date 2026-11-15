#!/usr/bin/env python3
"""Score a local Short; require editorial evidence before declaring 90/100 quality."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from presentation_mode import choose as choose_presentation
from evidence_gate import check as check_evidence

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('continuity', 'realism', 'story', 'audio', 'payoff')
TECHNICAL = ('blackFrames', 'frozenPicture', 'loudness', 'silence', 'length')
REVIEW_FACTS = ('watchedFullVideo', 'listenedFullAudio', 'checkedOpeningHook',
                'checkedFoodContinuity', 'checkedShotTransitions', 'checkedSoundCueSync')


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def qa_matches_file(qa, video_path):
    return bool(video_path and video_path.is_file() and qa.get('passed') is True and
                qa.get('videoSha256') == file_sha256(video_path))


def review_evidence_problems(review_evidence, video_sha256):
    problems = [key for key in REVIEW_FACTS if review_evidence.get(key) is not True]
    if review_evidence.get('videoSha256') != video_sha256:
        problems.append('videoSha256 does not match the exact final file')
    if not str(review_evidence.get('reviewer', '')).strip():
        problems.append('reviewer is missing')
    return problems


def release_status(*, release_problems, qa_current, structure_ok, editorial, review_problems, score, minimum, critical, technical):
    if release_problems or not qa_current or not structure_ok or not all(technical.values()):
        return 'blocked'
    if editorial is None or review_problems:
        return 'review-needed'
    return 'pass' if score >= minimum and not critical else 'revise'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--pack', required=True, type=Path)
    p.add_argument('--qa-report', type=Path, help='QA for the exact exported film; overrides the earlier pack QA')
    p.add_argument('--allow-repeat', action='store_true', help='Treat a deliberate rerender of a previously used topic as allowed in preflight')
    p.add_argument('--video', type=Path, help='Exact exported film for scene-cut analysis')
    p.add_argument('--editorial', type=Path, help='JSON with 0–5 scores for continuity, realism, story, audio, payoff')
    p.add_argument('--output', type=Path)
    p.add_argument('--min-score', type=int, default=90)
    p.add_argument('--history', type=Path, default=ROOT / 'storage/learning/quality-scores.jsonl')
    a = p.parse_args()
    scenario = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    presentation = choose_presentation(scenario)
    pack = json.loads(a.pack.read_text(encoding='utf-8-sig'))
    evidence_problems, evidence_notes, _ = check_evidence(
        scenario, json.loads((ROOT / 'data/prices.json').read_text()),
        json.loads((ROOT / 'data/published-signatures.json').read_text()))
    release_problems = evidence_problems + [note for note in evidence_notes if
        'history is empty' in note or 'signature missing' in note or 'outside the four-format' in note]
    video_name = pack.get('video')
    video_path = (a.video or (a.pack.parent / video_name if video_name else None))
    video_path = video_path.resolve() if video_path else None
    video_sha256 = file_sha256(video_path) if video_path and video_path.is_file() else None
    qa = json.loads(a.qa_report.read_text()) if a.qa_report else pack.get('qa', {})
    qa_current = qa_matches_file(qa, video_path)
    checks = qa.get('checks', {})
    hook_check = 'visualHookEarly' if presentation['mode'] == 'asmr' else 'hookSpokenEarly'
    technical = {name: bool(checks.get(name, {}).get('ok')) and 'skipped' not in str(checks.get(name, {}).get('note', '')).lower() for name in (*TECHNICAL, hook_check)}
    technical_points = 5 * sum(technical.values())
    audit = subprocess.run([sys.executable, str(ROOT / 'scripts/audit-local-story.py'), str(a.scenario)], capture_output=True, text=True)
    preflight_cmd = [sys.executable, str(ROOT / 'scripts/preflight-short.py'), str(a.scenario), '--strict']
    if a.allow_repeat:
        preflight_cmd.append('--allow')
    preflight = subprocess.run(preflight_cmd, capture_output=True, text=True)
    hook = re.search(r'-> (\d+)/100', preflight.stdout)
    hook_score = int(hook.group(1)) if hook and presentation['voice'] else None
    hook_evidence = (hook_score is not None and hook_score >= 70) if presentation['voice'] else technical[hook_check]
    story_points = (10 if audit.returncode == 0 else 0) + (5 if hook_evidence else 0) + (5 if preflight.returncode == 0 else 0)
    scene_analysis = {'available': False}
    scene_python = ROOT / 'storage/tools/scenedetect/.venv/bin/python'
    if scene_python.is_file() and video_path and video_path.is_file():
        probe = subprocess.run([str(scene_python), str(ROOT/'scripts/scene-cuts.py'), '--video', str(video_path)], capture_output=True, text=True, timeout=90)
        if probe.returncode == 0:
            scene_analysis = json.loads(probe.stdout)
            scene_analysis['available'] = True
    editorial = None
    review_evidence = {}
    review_problems = []
    if a.editorial:
        submitted = json.loads(a.editorial.read_text(encoding='utf-8-sig'))
        editorial = {key: submitted[key] for key in CATEGORIES if key in submitted}
        review_evidence = submitted.get('reviewEvidence') or {}
        if set(editorial) != set(CATEGORIES) or any(type(editorial[key]) not in (int, float) or not 0 <= editorial[key] <= 5 for key in CATEGORIES):
            p.error('Editorial JSON needs continuity, realism, story, audio, payoff, each scored 0–5')
        review_problems = review_evidence_problems(review_evidence, video_sha256)
    editorial_points = sum(editorial.values()) * 2 if editorial else 0
    score = technical_points + story_points + editorial_points
    critical = [key for key in CATEGORIES if editorial and editorial[key] < 4]
    structure_ok = audit.returncode == 0 and preflight.returncode == 0
    status = release_status(release_problems=release_problems, qa_current=qa_current,
                            structure_ok=structure_ok, editorial=editorial, review_problems=review_problems,
                            score=score, minimum=a.min_score, critical=critical, technical=technical)
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'title': scenario['plan']['title'],
        'score': score, 'possible': 100, 'minimum': a.min_score, 'status': status,
        'technicalPoints': technical_points, 'storyPoints': story_points, 'editorialPoints': editorial_points,
        'technicalChecks': technical, 'hookScore': hook_score, 'hookEvidence': 'narrated line' if presentation['voice'] else 'visible opening frame', 'editorial': editorial,
        'presentation': presentation,
        'reviewedVideo': str(video_path) if video_path else None,
        'reviewedVideoSha256': video_sha256,
        'qaMatchesFinalVideo': qa_current,
        'storyAuditPassed': audit.returncode == 0, 'strictPreflightPassed': preflight.returncode == 0,
        'reviewEvidence': review_evidence, 'reviewEvidenceProblems': review_problems,
        'sceneAnalysis': scene_analysis,
        'criticalEditorialBelow4': critical,
        'evidenceReleaseProblems': release_problems, 'evidenceReviewNotes': evidence_notes,
        'note': 'A 90+ score is a release gate, not a prediction of views. Editorial scores and a current-file review record require actual viewing and listening; missing evidence cannot pass.',
    }
    output = a.output or a.pack.with_suffix('.quality.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+'\n')
    if editorial is not None and not review_problems:
        history = a.history.resolve()
        history.parent.mkdir(parents=True, exist_ok=True)
        prior = []
        if history.is_file():
            prior = [json.loads(line) for line in history.read_text().splitlines() if line.strip()]
        prior = [row for row in prior if row.get('scenario') != str(a.scenario.resolve())]
        prior.append({'scenario':str(a.scenario.resolve()), 'title':report['title'], 'checkedAt':report['checkedAt'], 'score':score, 'status':status, 'editorial':editorial})
        history.write_text(''.join(json.dumps(row)+'\n' for row in prior))
    score_label = 'score' if status == 'pass' else 'provisional score'
    print(f'{status.upper()}: {score_label} {score:.0f}/100 (technical {technical_points}/30, story {story_points}/20, editorial {editorial_points:.0f}/50)')
    if editorial is None: print('Watch and listen, then supply five editorial scores to reach a final result.')
    if critical: print('Revise critical categories below 4/5:', ', '.join(critical))
    if release_problems: print('Release blocked:', '; '.join(release_problems))
    if not qa_current: print('Release blocked: QA is missing, failed, or belongs to different video bytes.')
    if not structure_ok: print('Release blocked: strict preflight or story audit failed.')
    if review_problems: print('Editorial review incomplete:', '; '.join(review_problems))
    print(f'Report: {output}')
    return 0 if status == 'pass' else 1


if __name__ == '__main__': sys.exit(main())
