"""Fail-fast checks on the first still and first motion clip of a local render.

  python3 scripts/first_checks.py still IMAGE.png
  python3 scripts/first_checks.py clip CLIP.mp4

Exit 1 with a plain reason when the picture is blank, flat, too dark, black or frozen.
"""
import re
import subprocess
import sys
from pathlib import Path


def gray_pixels(source, at=0.0):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(at), '-i', str(source), '-frames:v', '1',
           '-vf', 'scale=96:-1,format=gray', '-f', 'rawvideo', '-']
    data = subprocess.run(cmd, capture_output=True).stdout
    if not data:
        raise ValueError(f'could not read a frame from {source}')
    return data


def frame_stats(source, at=0.0):
    data = gray_pixels(source, at)
    mean = sum(data) / len(data)
    spread = (sum((p - mean) ** 2 for p in data) / len(data)) ** 0.5
    return mean, spread


def picture_problem(source, at=0.0):
    mean, spread = frame_stats(source, at)
    if mean < 25:
        return f'picture is almost black (brightness {mean:.0f} of 255, minimum 25)'
    if spread < 12:
        return f'picture is flat or blank (contrast {spread:.0f}, minimum 12)'
    return None


def log(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True).stderr


def longest_freeze(path):
    """Longest frozen stretch in seconds. ffmpeg prints no duration when the freeze runs to the end, so count that from the start time."""
    text = log(['-i', str(path), '-vf', 'freezedetect=n=-55dB:d=1.5', '-an', '-f', 'null', '-'])
    total = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                 capture_output=True, text=True).stdout.strip() or 0)
    starts = [float(x) for x in re.findall(r'freeze_start: ([\d.]+)', text)]
    ends = [float(x) for x in re.findall(r'freeze_end: ([\d.]+)', text)]
    longest = max(map(float, re.findall(r'freeze_duration: ([\d.]+)', text)), default=0)
    if len(starts) > len(ends):
        longest = max(longest, total - starts[-1])
    return longest


def check_still(path):
    return picture_problem(path)


def check_clip(path):
    problem = picture_problem(path)
    if problem:
        return 'first frame: ' + problem
    black = max(map(float, re.findall(r'black_duration:([\d.]+)', log(['-i', str(path), '-vf', 'blackdetect=d=0.3:pix_th=0.10', '-an', '-f', 'null', '-']))), default=0)
    if black >= 0.5:
        return f'clip has {black:.1f} s of black'
    frozen = longest_freeze(path)
    if frozen >= 2.5:
        return f'motion model returned a still picture for {frozen:.1f} s'
    return None


if __name__ == '__main__':
    kind, target = sys.argv[1], Path(sys.argv[2])
    problem = check_still(target) if kind == 'still' else check_clip(target)
    print(f'FAIL {kind}: {problem}' if problem else f'ok {kind}: {target.name}')
    sys.exit(1 if problem else 0)
