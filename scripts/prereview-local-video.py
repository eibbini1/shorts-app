#!/usr/bin/env python3
"""Screen the exact finished film before a person rates it.

The still gate checks pictures before motion; LTX can still morph the food while it moves. This
re-asks each shot's visual questions on its middle frame, samples tool movement across frames, checks
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_standards import PREREVIEW_MAX_TP_DB, PREREVIEW_TOLERANCE_LUFS, TARGET_LUFS  # noqa: E402
import look_drift  # noqa: E402
from look_profiles import FOOD_RE, continuity_question_for, get_look_profile, is_food_scenario  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('continuity', 'realism', 'story', 'audio', 'payoff')
LUFS_TOLERANCE, MAX_TRUE_PEAK = PREREVIEW_TOLERANCE_LUFS, PREREVIEW_MAX_TP_DB
QUIET_SHOT_GAP_DB = 12.0
CONTINUITY_QUESTION = get_look_profile('food')['continuityQuestion']
SUBJECT_QUESTION = get_look_profile('custom')['continuityQuestion']


def is_food_film(scenario):
    return is_food_scenario(scenario)


def ending_question(scenario):
    plan = scenario.get('plan') or {}
    shots = plan.get('shots') or []
    scene_state = shots[-1].get('sceneState') or {} if shots else {}
    ending = str(scenario.get('requestedEnding') or plan.get('payoff') or scene_state.get('after') or '').strip()
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


def motion_questions(scenario, checks, index):
    shot = scenario['plan']['shots'][index]
    scene_state = shot.get('sceneState') or {}
    action = str(scene_state.get('action') or '').strip()
    if action:
        return [f'Does this frame plausibly show the planned action underway: "{action[:180]}"?']
    return shot_questions(scenario, checks, index)


UTENSIL = re.compile(r"\b(?:teaspoons?|tablespoons?|spoons?|forks?|knives|knife|spatulas?|tongs|whisks?|ladles?|"
                     r"peelers?|graters?|chopsticks?|skewers?|rolling pins?|sieves?|sifters?|"
                     r"cookie cutters?|pastry brushes?|kitchen torches?)\b", re.I)


def utensil_for(shot):
    """Prefer the motion wording so decorative utensils do not override the moving one."""
    state = shot.get('sceneState') or {}
    for value in (state.get('action'), shot.get('motionPrompt'), shot.get('imagePrompt')):
        if match := UTENSIL.search(str(value or '')):
            return match.group(0).lower()
    return None


def utensil_timeline(start, end):
    # Include near-edge samples to catch an implausible entry or exit at either cut.
    return [round(start + (end - start) * f, 3) for f in (0.03, 0.18, 0.38, 0.58, 0.79, 0.97)]


def utensil_questions(shot, utensil):
    ordered = 'Six consecutive samples of one shot, read left to right, top row then bottom. '
    action = str((shot.get('sceneState') or {}).get('action') or shot.get('motionPrompt') or '')
    first_action = action.split('.', 1)[0][:100]
    return [
        ordered + f'Does the {utensil} keep one shape and follow a physically plausible path into, through and out of view, without jumping, reversing abruptly, duplicating or bending? If it stays in view, judge the visible path.',
        ordered + f'Planned action: {first_action}. Does the {utensil} visibly make the intended contact and cause the expected change at that spot? A nearby tool or a result without contact is insufficient.',
    ]


def check_utensil_motion(video, windows, shots, work, vision=None, cache=None):
    results = []
    for index, (shot, (start, end)) in enumerate(zip(shots, windows), 1):
        utensil = utensil_for(shot)
        if utensil is None:
            continue
        times = utensil_timeline(start, end)
        result = {'shot': index, 'utensil': utensil, 'sampleSeconds': times}
        if vision is None:
            result.update(status='unavailable', issues=['ordered-frame vision review was skipped'])
        else:
            try:
                frames = [grab(video, at, work / f'utensil-{index}-{sample}.png', width=270)
                          for sample, at in enumerate(times, 1)]
                labels = [f'{sample} · {at:.2f}s' for sample, at in enumerate(times, 1)]
                sheet = contact_sheet(frames, labels, work / f'utensil-{index}-sheet.png')
                result.update(ask(vision, sheet, utensil_questions(shot, utensil), cache))
            except (OSError, ValueError, RuntimeError) as error:
                result.update(status='unavailable', issues=[str(error)])
        results.append(result)
    return results


def audio_flags(integrated, true_peak, shot_means):
    flags = []
    if integrated is None:
        flags.append('loudness could not be measured')
    elif abs(integrated - TARGET_LUFS) > LUFS_TOLERANCE:
        flags.append(f'integrated loudness {integrated:.1f} LUFS is outside {TARGET_LUFS:g}±{LUFS_TOLERANCE:g}')
    if true_peak is not None and true_peak > MAX_TRUE_PEAK:
        flags.append(f'true peak {true_peak:.1f} dBTP is above {MAX_TRUE_PEAK:g}')
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
    columns = 3
    layout = '|'.join(f'{(i % columns) * 270}_{(i // columns) * 480}' for i in range(len(frames)))
    tiles = []
    for i, label in enumerate(labels):
        safe_label = re.sub(r'[^A-Z0-9 .:-]', '', label.upper())[:48]
        tiles.append(f'[{i}:v]scale=270:480,drawbox=x=0:y=0:w=iw:h=30:color=black@0.68:t=fill,'
                     f"drawtext=text='{safe_label}':fontcolor=white:fontsize=14:x=8:y=8[s{i}]")
    stack = ''.join(f'[s{i}]' for i in range(len(frames))) + f'xstack=inputs={len(frames)}:layout={layout}'
    result = ffmpeg('-y', *inputs, '-filter_complex', ';'.join(tiles) + ';' + stack, target)
    if result.returncode:
        plain_tiles = [f'[{i}:v]scale=270:480[s{i}]' for i in range(len(frames))]
        result = ffmpeg('-y', *inputs, '-filter_complex', ';'.join(plain_tiles) + ';' + stack, target)
    if result.returncode or not Path(target).is_file():
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
    try:
        sheet = contact_sheet(samples, sample_labels, video.with_suffix('.contact.png'))
    except RuntimeError:
        sheet = None
    integrated, peak = loudness(video)
    means = [shot_mean_volume(video, a, b) for a, b in windows]
    audio = audio_flags(integrated, peak, means)
    motion = [shot_motion(video, a, b) for a, b in windows]
    shot_results, payoff, continuity = [], None, None
    expected_ending = ending_question(scenario)
    vision = None if args.skip_vision else load_vision()
    cache = video.parent / 'prereview-cache'
    if vision is not None:
        middle_questions = [motion_questions(scenario, checks, index) for index in range(len(windows))]
        # Middle frame: the shot's action is under way. An action that completes (an oven door closing)
        # legitimately hides the subject by the last frame, so only the final shot is checked at its end.
        for index, frame in enumerate(mids):
            shot_results.append(ask(vision, frame, middle_questions[index], cache))
        payoff = ask(vision, ends[-1], [expected_ending], cache) if expected_ending else None
        if len(windows) > 1:
            continuity = ask(vision, side_by_side(starts[0], ends[-1], work / 'food.png'),
                             [continuity_question_for(scenario)], cache)
    utensil_motion = check_utensil_motion(video, windows, scenario['plan']['shots'], work, vision, cache)
    flags, unchecked = categorize(shot_results, payoff, continuity, audio)
    if sheet is None:
        unchecked.append('start/middle/end contact sheet could not be built')
    for result in utensil_motion:
        label = f"shot {result['shot']} {result['utensil']} motion"
        issue = f'{label}: {"; ".join(result["issues"])}'
        if result['status'] == 'unavailable':
            unchecked.append(issue)
        elif result['status'] != 'pass':
            flags['realism'].append(issue)
    if not expected_ending:
        unchecked.append('final frame: no explicit ending outcome in the plan')
    if len(starts) > 1:
        try:
            first = look_drift.frame_stats(starts[0])
            for number, frame in enumerate(starts[1:], 2):
                issue = look_drift.drift_issue('shot 1 start', first, f'shot {number} start', look_drift.frame_stats(frame))
                if issue:
                    flags['continuity'].append(issue)
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            unchecked.append(f'lighting drift between shots: {error}')
    for number, value in enumerate(motion, 1):
        if value is not None and value < MIN_MOTION:
            flags['realism'].append(f'shot {number} barely moves (motion {value}, real shots here measure 3.7-18.9): regenerate it for a new take')
    likely_low = [key for key in CATEGORIES if flags[key]]
    report = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'video': str(video),
        'videoSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
        'scenarioSha256': hashlib.sha256(args.scenario.read_bytes()).hexdigest(),
        'contactSheet': str(sheet) if sheet else None,
        'contactSheetSha256': hashlib.sha256(sheet.read_bytes()).hexdigest() if sheet else None,
        'sampleTimeline': timeline, 'loudnessLUFS': integrated, 'truePeakDBTP': peak,
        'shotMeanVolumeDB': means, 'shotMotion': motion, 'shots': shot_results, 'payoffFrame': payoff, 'foodContinuity': continuity,
        'visionChecked': not args.skip_vision, 'utensilMotion': utensil_motion,
        'flags': flags, 'likelyBelow4': likely_low, 'unchecked': unchecked,
        'notMachineChecked': ['story', 'same kitchen across shots (use the contact sheet)', 'narration naturalness', 'sound cue timing by ear', 'full-speed motion and tool realism between sampled frames'],
        'note': 'Advisory screen of the final file. It adds no score; a person must still watch and listen.',
    }
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Pre-review: {"clear" if not likely_low else "fix before review: " + ", ".join(likely_low)}')
    for key in CATEGORIES:
        for flag in flags[key]:
            print(f'  {key}: {flag}')
    for item in unchecked:
        print(f'  unchecked: {item}')
    if sheet:
        print(f'Contact sheet: {sheet}')
    print(f'Report: {output}')
    return 0 if not likely_low else 1


if __name__ == '__main__':
    sys.exit(main())
