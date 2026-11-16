#!/usr/bin/env python3
"""Screen the exact finished film before a person rates it.

The still gate checks pictures before motion; LTX can still morph the food while it moves. This
re-asks each shot's visual questions on the final frame of that shot in the exported MP4, checks
that the opening and final dish match, measures loudness and per-shot sound, and builds a contact
sheet for a fast continuity look. It never awards editorial points: the result only says which
categories are likely to score below 4/5 so they can be fixed before the review.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import statistics
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('continuity', 'realism', 'story', 'audio', 'payoff')
TARGET_LUFS, LUFS_TOLERANCE, MAX_TRUE_PEAK = -15.0, 2.0, -1.0
QUIET_SHOT_GAP_DB = 12.0
CONTINUITY_QUESTION = ('The left half and the right half are two moments from one cooking video. '
                       'Do both halves show the same kind of food with the same kind of topping?')
# A same-kitchen comparison was tried and dropped: qwen3-vl:4b never finished a verdict on it (2026-11-16).


def load_vision():
    spec = importlib.util.spec_from_file_location('check_still_vision', ROOT / 'scripts/check-still-vision.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def shot_windows(scenario):
    start, windows = 0.0, []
    for shot in scenario['plan']['shots']:
        end = start + float(shot['seconds'])
        windows.append((start, end))
        start = end
    return windows


def shot_questions(scenario, checks, index):
    questions = (checks[index] if index < len(checks) else {}).get('questions') or []
    if questions:
        return list(questions)
    subject = scenario['plan']['shots'][index]['imagePrompt'].split('.')[0][:180]
    return [f'Does this image show {subject}?']


def audio_flags(integrated, true_peak, shot_means):
    flags = []
    if integrated is None:
        flags.append('loudness could not be measured')
    elif abs(integrated - TARGET_LUFS) > LUFS_TOLERANCE:
        flags.append(f'integrated loudness {integrated:.1f} LUFS is outside {TARGET_LUFS:.0f}±{LUFS_TOLERANCE:.0f}')
    if true_peak is not None and true_peak > MAX_TRUE_PEAK:
        flags.append(f'true peak {true_peak:.1f} dBTP is above {MAX_TRUE_PEAK:.0f}')
    measured = [value for value in shot_means if value is not None]
    if measured:
        median = statistics.median(measured)
        for index, value in enumerate(shot_means, 1):
            if value is not None and median - value > QUIET_SHOT_GAP_DB:
                flags.append(f'shot {index} is {median - value:.0f} dB quieter than the others; its sound cue may be missing')
    return flags


def categorize(shot_results, payoff, continuity, audio):
    """Map failed checks to rating categories; an unavailable check is unchecked, not a failure."""
    flags = {key: [] for key in CATEGORIES}
    unchecked = []
    labelled = [(f'shot {i} middle frame', 'realism', r) for i, r in enumerate(shot_results, 1)]
    labelled += [('final frame', 'payoff', payoff), ('opening and final dish', 'continuity', continuity)]
    for label, category, result in labelled:
        if not result:
            continue
        if result['status'] == 'unavailable':
            unchecked.append(f'{label}: {"; ".join(result["issues"])}')
        elif result['status'] != 'pass':
            flags[category].append(f'{label}: {"; ".join(result["issues"])}')
    flags['audio'].extend(audio)
    return flags, unchecked


def ffmpeg(*args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *map(str, args)], capture_output=True, text=True)


def grab(video, seconds, target, width=540):
    result = ffmpeg('-y', '-ss', f'{max(seconds, 0):.3f}', '-i', video, '-frames:v', '1',
                    '-vf', f'scale={width}:-2', target)
    if result.returncode or not Path(target).is_file():
        raise RuntimeError(f'could not extract a frame at {seconds:.2f}s')
    return Path(target)


def side_by_side(left, right, target):
    result = ffmpeg('-y', '-i', left, '-i', right, '-filter_complex', 'hstack=inputs=2', target)
    if result.returncode:
        raise RuntimeError('could not build the comparison image')
    return Path(target)


def contact_sheet(frames, target):
    inputs = [arg for frame in frames for arg in ('-i', frame)]
    rows = len(frames) // 2
    layout = '|'.join(f'{col * 270}_{row * 480}' for row in range(rows) for col in range(2))
    scaled = ''.join(f'[{i}:v]scale=270:480[s{i}];' for i in range(len(frames)))
    graph = scaled + ''.join(f'[s{i}]' for i in range(len(frames))) + f'xstack=inputs={len(frames)}:layout={layout}'
    result = ffmpeg('-y', *inputs, '-filter_complex', graph, target)
    if result.returncode:
        raise RuntimeError('could not build the contact sheet')
    return Path(target)


def loudness(video):
    output = ffmpeg('-i', video, '-af', 'ebur128=peak=true', '-f', 'null', '-').stderr
    summary = output[output.rfind('Summary:'):]
    integrated = re.search(r'I:\s+(-?[\d.]+) LUFS', summary)
    peak = re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary)
    return (float(integrated.group(1)) if integrated else None, float(peak.group(1)) if peak else None)


def shot_mean_volume(video, start, end):
    output = ffmpeg('-ss', f'{start:.3f}', '-t', f'{end - start:.3f}', '-i', video,
                    '-af', 'volumedetect', '-vn', '-f', 'null', '-').stderr
    match = re.search(r'mean_volume:\s+(-?[\d.]+) dB', output)
    return float(match.group(1)) if match else None


def summarize(report):
    status = report['status']
    issues = report['verdict']['missingOrWrong']
    return {'status': status, 'issues': issues, 'report': report.get('reportPath')}


def ask(vision, image, questions, cache):
    report, path = vision.review(image, '', questions=tuple(questions), cache_dir=cache)
    report['reportPath'] = str(path)
    return summarize(report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--skip-vision', action='store_true', help='Audio and contact sheet only')
    args = parser.parse_args()
    scenario = json.loads(args.scenario.read_text(encoding='utf-8-sig'))
    video = args.video.resolve()
    if not video.is_file():
        parser.error('video must exist')
    output = args.output or video.with_suffix('.prereview.json')
    work = Path(tempfile.mkdtemp(prefix='prereview-'))
    windows = shot_windows(scenario)
    checks = scenario.get('visualChecks') or [{}] * len(windows)
    mids = [grab(video, (a + b) / 2, work / f'shot{i}-mid.png') for i, (a, b) in enumerate(windows, 1)]
    ends = [grab(video, b - 0.25, work / f'shot{i}-end.png') for i, (a, b) in enumerate(windows, 1)]
    sheet = contact_sheet([frame for pair in zip(mids, ends) for frame in pair],
                          video.with_suffix('.contact.png'))
    integrated, peak = loudness(video)
    means = [shot_mean_volume(video, a, b) for a, b in windows]
    audio = audio_flags(integrated, peak, means)
    shot_results, payoff, continuity = [], None, None
    if not args.skip_vision:
        vision = load_vision()
        cache = video.parent / 'prereview-cache'
        questions = [shot_questions(scenario, checks, index) for index in range(len(windows))]
        # Middle frame: the shot's action is under way. An action that completes (an oven door closing)
        # legitimately hides the subject by the last frame, so only the final shot is checked at its end.
        for index, frame in enumerate(mids):
            shot_results.append(ask(vision, frame, questions[index], cache))
        payoff = ask(vision, ends[-1], questions[-1], cache)
        if len(windows) > 1:
            continuity = ask(vision, side_by_side(mids[0], ends[-1], work / 'food.png'), [CONTINUITY_QUESTION], cache)
    flags, unchecked = categorize(shot_results, payoff, continuity, audio)
    likely_low = [key for key in CATEGORIES if flags[key]]
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'video': str(video),
        'videoSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
        'contactSheet': str(sheet), 'loudnessLUFS': integrated, 'truePeakDBTP': peak,
        'shotMeanVolumeDB': means, 'shots': shot_results, 'payoffFrame': payoff, 'foodContinuity': continuity,
        'visionChecked': not args.skip_vision,
        'flags': flags, 'likelyBelow4': likely_low, 'unchecked': unchecked,
        'notMachineChecked': ['story', 'same kitchen across shots (use the contact sheet)', 'narration naturalness', 'sound cue timing by ear', 'motion believability'],
        'note': 'Advisory screen of the final file. It adds no score; a person must still watch and listen.',
    }
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Pre-review: {"clear" if not likely_low else "fix before review: " + ", ".join(likely_low)}')
    for key in CATEGORIES:
        for flag in flags[key]:
            print(f'  {key}: {flag}')
    for item in unchecked:
        print(f'  unchecked: {item}')
    print(f'Contact sheet: {sheet}')
    print(f'Report: {output}')
    return 0 if not likely_low else 1


if __name__ == '__main__':
    sys.exit(main())
