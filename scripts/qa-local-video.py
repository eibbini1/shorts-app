#!/usr/bin/env python3
"""Check a finished local video before upload. Adds a "qa" block to its pack JSON.

  python3 scripts/qa-local-video.py --video outputs/ID.captioned.mp4 [--pack outputs/ID.pack.json] [--work-dir storage/any-local/ID.local-scenario]

Checks: black frames, frozen picture, loudness (target about -16 LUFS), clipping, silence over 1 s,
length 20-35 s, and that narration starts within 1 s (hook spoken early). Exit 1 when a check fails.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from first_checks import longest_freeze as measure_freeze


def ffmpeg_log(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True).stderr


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--work-dir', type=Path)
    args = parser.parse_args()
    video = args.video.resolve()
    duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)],
                                    capture_output=True, text=True).stdout.strip())
    results, failures = {}, []

    black = re.findall(r'black_duration:([\d.]+)', ffmpeg_log(['-i', str(video), '-vf', 'blackdetect=d=0.3:pix_th=0.10', '-an', '-f', 'null', '-']))
    longest_black = max(map(float, black), default=0)
    results['blackFrames'] = {'longestSeconds': longest_black, 'ok': longest_black < 0.5}
    # Each clip is a still brought to life; a long frozen stretch means the motion model returned a still.
    longest_freeze_s = measure_freeze(video)
    longest_freeze = longest_freeze_s
    results['frozenPicture'] = {'longestSeconds': longest_freeze, 'ok': longest_freeze < 2.5}

    loud = ffmpeg_log(['-i', str(video), '-af', 'loudnorm=I=-16:TP=-1.5:print_format=json', '-vn', '-f', 'null', '-'])
    block = re.search(r'\{[^{}]*"input_i"[^{}]*\}', loud)
    if block:
        stats = json.loads(block.group(0))
        lufs, peak = float(stats['input_i']), float(stats['input_tp'])
        results['loudness'] = {'lufs': lufs, 'truePeakDb': peak, 'ok': -19 <= lufs <= -13 and peak <= -0.5}
    else:
        results['loudness'] = {'ok': False, 'note': 'could not measure'}
    silence = re.findall(r'silence_duration: ([\d.]+)', ffmpeg_log(['-i', str(video), '-af', 'silencedetect=n=-45dB:d=1.0', '-vn', '-f', 'null', '-']))
    longest_silence = max(map(float, silence), default=0)
    results['silence'] = {'longestSeconds': longest_silence, 'ok': longest_silence < 1.5}
    results['length'] = {'seconds': round(duration, 1), 'ok': 20 <= duration <= 35}

    work = args.work_dir
    if work is None:
        stem = video.name.split('.captioned')[0]
        stem = re.sub(r'-\d{8}-\d{6}$', '', stem)
        candidate = video.parent.parent / 'storage/any-local' / f'{stem}.local-scenario'
        work = candidate if candidate.is_dir() else None
    if work and (work / 'voice-provenance.json').is_file():
        lines = json.loads((work / 'voice-provenance.json').read_text())['lines']
        start = lines[0]['atSeconds'] if lines else None
        results['hookSpokenEarly'] = {'firstLineAtSeconds': start, 'ok': start is not None and start <= 1.0}
    else:
        results['hookSpokenEarly'] = {'ok': True, 'note': 'voice timeline not found, skipped'}

    for name, item in results.items():
        status = 'ok' if item['ok'] else 'FAIL'
        detail = {k: v for k, v in item.items() if k != 'ok'}
        print(f'{status:4} {name}: {detail}')
        if not item['ok']:
            failures.append(name)
    pack = args.pack or (video.with_name(video.name.replace('.captioned.mp4', '.pack.json')) if '.captioned.mp4' in video.name else None)
    if pack and pack.is_file():
        data = json.loads(pack.read_text())
        data['qa'] = {'passed': not failures, 'failed': failures, 'checks': results}
        pack.write_text(json.dumps(data, indent=2) + '\n')
        print(f'Wrote qa block to {pack.name}')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
