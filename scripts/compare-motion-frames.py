#!/usr/bin/env python3
"""Measure visual change between the first and last frames of a local motion clip."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory


def run(*command):
    return subprocess.run(command, capture_output=True, check=True)


DEFAULT_CROP = (0.2, 0.2, 0.6, 0.6)


def parse_crop(value):
    try:
        x, y, width, height = map(float, value.split(','))
    except ValueError as error:
        raise argparse.ArgumentTypeError('Use four fractions: x,y,width,height.') from error
    if (not all(math.isfinite(n) for n in (x, y, width, height))
            or min(x, y) < 0 or min(width, height) <= 0 or x + width > 1 or y + height > 1):
        raise argparse.ArgumentTypeError('The crop must fit within the frame and have positive area.')
    return x, y, width, height


def extract(clip, seconds, target, crop):
    x, y, width, height = crop
    crop_filter = f'crop=iw*{width}:ih*{height}:iw*{x}:ih*{y},scale=160:160'
    run('ffmpeg', '-v', 'error', '-ss', str(seconds), '-i', str(clip), '-frames:v', '1',
        '-vf', crop_filter, str(target))


def histogram(image):
    pixels = run('ffmpeg', '-v', 'error', '-i', str(image), '-pix_fmt', 'rgb24',
                 '-f', 'rawvideo', '-').stdout
    if not pixels:
        raise ValueError('Could not read the subject crop.')
    return Counter((r >> 5, g >> 5, b >> 5) for r, g, b in zip(pixels[::3], pixels[1::3], pixels[2::3]))


def compare(clip, crop=DEFAULT_CROP):
    with clip.open('rb') as source:
        clip_sha256 = hashlib.file_digest(source, 'sha256').hexdigest()
    duration = float(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                         '-of', 'csv=p=0', str(clip)).stdout)
    with TemporaryDirectory() as directory:
        start, end = (Path(directory) / f'{name}.png' for name in ('start', 'end'))
        last = max(0, duration - 0.15)
        extract(clip, 0, start, crop)
        extract(clip, last, end, crop)
        left, right = histogram(start), histogram(end)
        overlap = sum((left & right).values()) / max(left.total(), right.total())
        log = run('ffmpeg', '-hide_banner', '-i', str(start), '-i', str(end),
                  '-lavfi', 'ssim', '-f', 'null', '-').stderr.decode()
        score = re.search(r'All:([-0-9.]+)', log)
        if score is None:
            raise ValueError('Could not measure structural similarity.')
    return {
        'measurementVersion': 'frame-comparison-v1', 'clip': str(clip), 'clipSha256': clip_sha256,
        'firstSeconds': 0, 'lastSeconds': round(last, 3),
        'crop': 'center 60% of width and height' if crop == DEFAULT_CROP else 'specified subject region',
        'cropBounds': dict(zip(('x', 'y', 'width', 'height'), crop)),
        'histogramOverlap': round(overlap, 4),
        'ssim': float(score[1]),
        'interpretation': 'Advisory pixel measurements. Pose, camera, light, and framing can change these values.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('clip', type=Path)
    parser.add_argument('--crop', type=parse_crop, default=DEFAULT_CROP,
                        help='Optional subject box in normalized x,y,width,height coordinates.')
    args = parser.parse_args()
    try:
        print(json.dumps(compare(args.clip, args.crop), indent=2))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Could not compare motion frames: {error}\n')
