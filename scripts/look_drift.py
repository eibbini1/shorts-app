"""Pixel proxy for lighting/palette drift between two frames of one film.

LTX can change time of day or palette between shots (a rainy night became a bright sunset). A vision
model is not reliable for this, so compare mean brightness and saturation measured by ffmpeg.
This is an advisory flag, never a quality score.
"""
import re
import subprocess
from pathlib import Path

MAX_BRIGHTNESS_SHIFT = 40.0   # on ffmpeg's 0-255 luma scale
MAX_SATURATION_SHIFT = 35.0


def frame_stats(path):
    """Return {'luma': mean Y, 'sat': mean saturation} for one image or video frame via ffmpeg signalstats."""
    result = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-frames:v', '1',
         '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'],
        capture_output=True, text=True, check=True)
    text = result.stdout + result.stderr
    luma = re.search(r'lavfi\.signalstats\.YAVG=([0-9.]+)', text)
    sat = re.search(r'lavfi\.signalstats\.SATAVG=([0-9.]+)', text)
    if not luma or not sat:
        raise ValueError(f'could not measure {Path(path).name}')
    return {'luma': float(luma.group(1)), 'sat': float(sat.group(1))}


def drift_issue(label_a, stats_a, label_b, stats_b):
    """Return an advisory sentence when the two frames differ strongly in brightness or saturation, else None."""
    brightness = abs(stats_a['luma'] - stats_b['luma'])
    saturation = abs(stats_a['sat'] - stats_b['sat'])
    parts = []
    if brightness > MAX_BRIGHTNESS_SHIFT:
        parts.append(f'brightness changes by {brightness:.0f}/255')
    if saturation > MAX_SATURATION_SHIFT:
        parts.append(f'colour saturation changes by {saturation:.0f}')
    if not parts:
        return None
    return f'{label_a} vs {label_b}: {" and ".join(parts)} (lighting or palette may have changed)'
