#!/usr/bin/env python3
"""Check a finished local video before upload. Adds a "qa" block to its pack JSON.

  python3 scripts/qa-local-video.py --video outputs/ID.captioned.mp4 [--pack outputs/ID.pack.json] [--work-dir storage/any-local/ID.local-scenario]

Checks: black frames, frozen picture, loudness (target about -15 LUFS), clipping, silence over 1 s,
length 20-35 s, and that narration starts within 1 s (hook spoken early). Exit 1 when a check fails.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_standards import loudnorm_filter, qa_loudness_ok  # noqa: E402
from first_checks import parse_black_seconds, parse_freeze_seconds, picture_problem  # noqa: E402
from output_spec import OUTPUT_SPEC, check_output_file  # noqa: E402
from presentation_mode import choose as choose_presentation  # noqa: E402

_QA = OUTPUT_SPEC['qa']


def ffmpeg_log(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True).stderr


def analyze_media_single_pass(video, duration, has_audio=True):
    """Run blackdetect, freezedetect, loudnorm, and silencedetect in one FFmpeg decode pass.

    Uses asplit=2 so loudnorm and silencedetect both measure the raw, unmodified input audio.
    """
    if has_audio:
        graph = (
            '[0:v]blackdetect=d=0.3:pix_th=0.10,freezedetect=n=-55dB:d=1.5[vout];'
            f'[0:a]asplit=2[a1][a2];[a1]{loudnorm_filter(print_json=True)}[ao1];'
            '[a2]silencedetect=n=-45dB:d=1.0[ao2]'
        )
        raw = ffmpeg_log([
            '-i', str(video), '-filter_complex', graph,
            '-map', '[vout]', '-map', '[ao1]', '-map', '[ao2]',
            '-f', 'null', '-',
        ])
    else:
        raw = ffmpeg_log([
            '-i', str(video),
            '-vf', 'blackdetect=d=0.3:pix_th=0.10,freezedetect=n=-55dB:d=1.5',
            '-an', '-f', 'null', '-',
        ])
    longest_black = parse_black_seconds(raw)
    longest_freeze = parse_freeze_seconds(raw, duration)
    block = re.search(r'\{[^{}]*"input_i"[^{}]*\}', raw)
    loudness_stats = None
    if block:
        stats = json.loads(block.group(0))
        loudness_stats = (float(stats['input_i']), float(stats['input_tp']))
    silence = re.findall(r'silence_duration: ([\d.]+)', raw)
    longest_silence = max(map(float, silence), default=0.0)
    return {
        'longestBlack': longest_black,
        'longestFreeze': longest_freeze,
        'loudness': loudness_stats,
        'longestSilence': longest_silence,
    }


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    t_start = time.monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--report', type=Path, help='Write QA results for this exact final file')
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--expected-seconds', type=float, help='Require the final duration to match the scenario, within 0.15 s')
    parser.add_argument('--scenario', type=Path, help='Use its presentation mode for voiced or visual hook QA')
    args = parser.parse_args()
    video = args.video.resolve()
    video_sha256 = file_sha256(video)
    scenario_data = json.loads(args.scenario.read_text(encoding='utf-8-sig')) if args.scenario else None
    scenario_format = ((scenario_data or {}).get('settings') or {}).get('format')
    expected_orientation = ('wide' if scenario_format in ('long', 'wide') else 'vertical') if scenario_format else None
    results, failures = {}, []

    t_spec = time.monotonic()
    spec_result = check_output_file(video, orientation=expected_orientation)
    probe_ms = round((time.monotonic() - t_spec) * 1000)
    results['videoSpec'] = {
        'ok': spec_result['ok'],
        'specVersion': spec_result['specVersion'],
        'issues': spec_result['issues'],
    }
    duration = spec_result.get('metrics', {}).get('durationSeconds')
    if duration is None:
        duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)],
                                        capture_output=True, text=True).stdout.strip())
    has_audio = bool(spec_result.get('metrics', {}).get('hasAudio', True))

    t_analysis = time.monotonic()
    analysis = analyze_media_single_pass(video, duration, has_audio=has_audio)
    analysis_ms = round((time.monotonic() - t_analysis) * 1000)

    longest_black = analysis['longestBlack']
    results['blackFrames'] = {'longestSeconds': longest_black, 'ok': longest_black < _QA['maxBlackSeconds']}
    # Each clip is a still brought to life; a long frozen stretch means the motion model returned a still.
    longest_freeze = analysis['longestFreeze']
    results['frozenPicture'] = {'longestSeconds': longest_freeze, 'ok': longest_freeze < _QA['maxFreezeSeconds']}

    if analysis['loudness'] is not None:
        lufs, peak = analysis['loudness']
        results['loudness'] = {'lufs': lufs, 'truePeakDb': peak, 'ok': qa_loudness_ok(lufs, peak)}
    else:
        results['loudness'] = {'ok': False, 'note': 'could not measure'}
    longest_silence = analysis['longestSilence']
    results['silence'] = {'longestSeconds': longest_silence, 'ok': longest_silence < _QA['maxSilenceSeconds']}
    expected = args.expected_seconds
    results['length'] = ({'seconds': round(duration, 2), 'expectedSeconds': expected,
                          'ok': abs(duration - expected) <= _QA['durationToleranceSeconds']} if expected is not None else
                         {'seconds': round(duration, 1), 'ok': _QA['defaultMinSeconds'] <= duration <= _QA['defaultMaxSeconds']})

    work = args.work_dir
    if work is None:
        stem = video.name.split('.captioned')[0]
        stem = stem.removesuffix('.sfx')
        stem = re.sub(r'-\d{8}-\d{6}$', '', stem)
        candidate = video.parent.parent / 'storage/any-local' / f'{stem}.local-scenario'
        work = candidate if candidate.is_dir() else None
    presentation = choose_presentation(scenario_data) if scenario_data else {'mode': 'voiced'}
    if presentation['mode'] == 'asmr':
        problem = picture_problem(video, at=0.2)
        results['visualHookEarly'] = {'firstFrameAtSeconds': 0.2, 'ok': problem is None,
                                      'note': problem or 'visible opening; speech intentionally absent'}
    elif work and (work / 'voice-provenance.json').is_file():
        lines = json.loads((work / 'voice-provenance.json').read_text())['lines']
        start = lines[0]['atSeconds'] if lines else None
        results['hookSpokenEarly'] = {'firstLineAtSeconds': start, 'ok': start is not None and start <= _QA['maxFirstVoiceSeconds']}
    else:
        results['hookSpokenEarly'] = {'ok': False,
                                      'note': 'voice timeline not found; cannot verify early spoken hook'}

    for name, item in results.items():
        status = 'ok' if item['ok'] else 'FAIL'
        detail = {k: v for k, v in item.items() if k != 'ok'}
        print(f'{status:4} {name}: {detail}')
        if not item['ok']:
            failures.append(name)
    timings_ms = {
        'probeSpec': probe_ms,
        'mediaAnalysis': analysis_ms,
        'total': round((time.monotonic() - t_start) * 1000),
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'video': str(video), 'videoSha256': video_sha256, 'passed': not failures,
                                           'failed': failures, 'checks': results, 'timingsMs': timings_ms}, indent=2) + '\n')
    pack = args.pack or (video.with_name(video.name.replace('.captioned.mp4', '.pack.json')) if '.captioned.mp4' in video.name else None)
    if pack and pack.is_file():
        data = json.loads(pack.read_text())
        data['qa'] = {'video': str(video), 'videoSha256': video_sha256,
                      'passed': not failures, 'failed': failures, 'checks': results, 'timingsMs': timings_ms}
        pack.write_text(json.dumps(data, indent=2) + '\n')
        print(f'Wrote qa block to {pack.name}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
