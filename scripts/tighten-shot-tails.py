#!/usr/bin/env python3
"""Remove selected seconds from shot tails while keeping picture, captions, and audio in sync."""
import argparse
import json
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--scenario-output', required=True, type=Path)
    p.add_argument('--trim', action='append', required=True, metavar='SHOT=SECONDS',
                   help='One-based shot number and seconds removed from its tail')
    a = p.parse_args()
    data = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    shots = data['plan']['shots']
    trims = {}
    for value in a.trim:
        try:
            number, seconds = value.split('=', 1)
            number, seconds = int(number), float(seconds)
        except ValueError:
            p.error(f'Invalid --trim {value!r}; use SHOT=SECONDS')
        if number < 1 or number > len(shots) or seconds <= 0 or number in trims:
            p.error(f'Invalid or repeated shot trim: {value}')
        trims[number] = seconds
    original = sum(shot['seconds'] for shot in shots)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                                               'format=duration', '-of', 'csv=p=0', str(a.video)], text=True))
    if abs(duration - original) > 0.25:
        p.error(f'Video is {duration:.2f}s but scenario is {original}s; check the input')
    ranges, position = [], 0.0
    for index, shot in enumerate(shots, 1):
        remaining = shot['seconds'] - trims.get(index, 0)
        if remaining < 2 or abs(remaining - round(remaining)) > 0.001:
            p.error(f'Shot {index} would have {remaining}s; keep at least two whole seconds')
        ranges.append((position, position + remaining))
        shot['seconds'] = int(round(remaining))
        position += remaining + trims.get(index, 0)
    target = sum(shot['seconds'] for shot in shots)
    data['settings']['seconds'] = target
    data['totalSeconds'] = target
    graph = []
    for index, (start, end) in enumerate(ranges):
        graph.append(f'[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{index}]')
        graph.append(f'[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a{index}]')
    graph.append(''.join(f'[v{i}][a{i}]' for i in range(len(ranges))) +
                 f'concat=n={len(ranges)}:v=1:a=1[v][a]')
    a.output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(a.video), '-filter_complex', ';'.join(graph),
                    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                    '-c:a', 'aac', '-b:a', '192k', str(a.output)], check=True)
    a.scenario_output.parent.mkdir(parents=True, exist_ok=True)
    a.scenario_output.write_text(json.dumps(data, indent=2) + '\n')
    print(f'Tightened {original}s to {target}s: {a.output}')
    print(f'Updated cut times: {a.scenario_output}')


if __name__ == '__main__':
    main()
