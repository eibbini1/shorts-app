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
SUBJECT_QUESTION = ('The left half and the right half are two moments from one short film. '
                    'Do both halves show the same main character or object, looking the same?')
FOOD_RE = re.compile(r'\b(food|dish|plate|bowl|meal|cook\w*|chef|kitchen|steak|burger|kebab|sushi|pasta|pizza|cake|dessert|sauce|soup|salad|egg|bread|wagyu|truffle|caviar|cheese|fries|taco)\b', re.I)


def is_food_film(scenario):
    text = ' '.join(str(shot.get('imagePrompt', '')) for shot in scenario['plan']['shots']) + ' ' + str(scenario.get('topic', ''))
    return bool(FOOD_RE.search(text))


def ending_question(scenario):
    ending = str(scenario.get('requestedEnding') or '').strip()
    return f'The film should end like this: "{ending[:180]}". Does this final image already show that outcome, not just the build-up to it?' if ending else None
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


def sample_timeline(windows):
    """Return safely inset start/middle/end timestamps for each planned shot."""
    timeline = []
    for index, (start, end) in enumerate(windows, 1):
        duration = max(0.0, end - start)
        inset = min(0.12, duration / 5)
        timeline.append({
            'shot': index,
            'startSeconds': round(start + inset, 3),
            'middleSeconds': round((start + end) / 2, 3),
            'endSeconds': round(end - inset, 3),
        })
    return timeline


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


def contact_sheet(frames, labels, target):
    if len(frames) != len(labels) or not frames or len(frames) % 3:
        raise ValueError('contact sheet needs three labeled samples per shot')
    inputs = [arg for frame in frames for arg in ('-i', frame)]
    columns, rows = 3, (len(frames) + 2) // 3
    layout = '|'.join(f'{(i % columns) * 270}_{(i // columns) * 480}' for i in range(len(frames)))
    tiles = []
    for i, label in enumerate(labels):
        safe_label = re.sub(r'[^A-Z0-9 .:-]', '', label.upper())[:48]
        tiles.append(f'[{i}:v]scale=270:480,drawbox=x=0:y=0:w=iw:h=30:color=black@0.68:t=fill,'
                     f"drawtext=text='{safe_label}':fontcolor=white:fontsize=14:x=8:y=8[s{i}]")
    graph = ';'.join(tiles) + ';' + ''.join(f'[s{i}]' for i in range(len(frames))) + f'xstack=inputs={len(frames)}:layout={layout}'
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


MIN_MOTION = 2.0  # mean 0-255 change between frames 1/8 s apart; real shots here measured 3.7-18.9, a frozen fox shot 1.7


def shot_motion(video, start, end, width=96, height=170, fps=8):
    """How much the picture changes inside one shot; a near-zero value means the motion model returned an almost still clip."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{start + 0.1:.2f}', '-t', f'{max(0.5, end - start - 0.2):.2f}', '-i', str(video),
                          '-vf', f'fps={fps},scale={width}:{height},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    size = width * height
    frames = [raw[i:i + size] for i in range(0, len(raw) - size + 1, size)]
    if len(frames) < 3:
        return None
    total = sum(sum(abs(a - b) for a, b in zip(f1, f2)) / size for f1, f2 in zip(frames, frames[1:]))
    return round(total / (len(frames) - 1), 2)


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
    timeline = sample_timeline(windows)
    starts, mids, ends, samples, sample_labels = [], [], [], [], []
    for item in timeline:
        shot = scenario['plan']['shots'][item['shot'] - 1]
        item['plannedAction'] = str(shot.get('motionPrompt') or shot.get('imagePrompt') or '')[:400]
        for stage, key, bucket in (('START', 'startSeconds', starts), ('MIDDLE', 'middleSeconds', mids), ('END', 'endSeconds', ends)):
            frame = grab(video, item[key], work / f"shot{item['shot']}-{stage.lower()}.png")
            bucket.append(frame); samples.append(frame)
            sample_labels.append(f"SHOT {item['shot']} {stage} {item[key]:.1f}s")
    sheet = contact_sheet(samples, sample_labels, video.with_suffix('.contact.png'))
    integrated, peak = loudness(video)
    means = [shot_mean_volume(video, a, b) for a, b in windows]
    audio = audio_flags(integrated, peak, means)
    motion = [shot_motion(video, a, b) for a, b in windows]
    shot_results, payoff, continuity = [], None, None
    if not args.skip_vision:
        vision = load_vision()
        cache = video.parent / 'prereview-cache'
        questions = [shot_questions(scenario, checks, index) for index in range(len(windows))]
        # Middle frame: the shot's action is under way. An action that completes (an oven door closing)
        # legitimately hides the subject by the last frame, so only the final shot is checked at its end.
        for index, frame in enumerate(mids):
            shot_results.append(ask(vision, frame, questions[index], cache))
        extra = ending_question(scenario)
        payoff = ask(vision, ends[-1], questions[-1] + ([extra] if extra else []), cache)
        if len(windows) > 1:
            continuity = ask(vision, side_by_side(starts[0], ends[-1], work / 'food.png'),
                             [CONTINUITY_QUESTION if is_food_film(scenario) else SUBJECT_QUESTION], cache)
    flags, unchecked = categorize(shot_results, payoff, continuity, audio)
    for number, value in enumerate(motion, 1):
        if value is not None and value < MIN_MOTION:
            flags['realism'].append(f'shot {number} barely moves (motion {value}, real shots here measure 3.7-18.9): regenerate it for a new take')
    likely_low = [key for key in CATEGORIES if flags[key]]
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'video': str(video),
        'videoSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
        'contactSheet': str(sheet), 'contactSheetSha256': hashlib.sha256(sheet.read_bytes()).hexdigest(),
        'sampleTimeline': timeline, 'loudnessLUFS': integrated, 'truePeakDBTP': peak,
        'shotMeanVolumeDB': means, 'shotMotion': motion, 'shots': shot_results, 'payoffFrame': payoff, 'foodContinuity': continuity,
        'visionChecked': not args.skip_vision,
        'flags': flags, 'likelyBelow4': likely_low, 'unchecked': unchecked,
        'notMachineChecked': ['story', 'same kitchen across shots (use the contact sheet)', 'narration naturalness', 'sound cue timing by ear', 'whether the motion looks believable (only the amount of motion is measured)'],
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
