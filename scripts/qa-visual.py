#!/usr/bin/env python3
"""Cheap visual QA for a finished film (CPU, ffmpeg + pure Python; no ML models).

Inspired by VBench's dimensions (temporal flickering, dynamic degree, subject/background consistency) but these are
PIXEL-LEVEL PROXIES, not VBench's DINO/CLIP metrics, and are not validated against human ratings. Use to compare
renders of the same dish (A/B), not as an absolute quality score.

Usage: scripts/qa-visual.py --video FILM.mp4 [--scenario S.json] [--json]
"""
import argparse, json, re, statistics, subprocess, sys
from pathlib import Path


def frame_diffs(video):
    """Mean absolute luma difference between consecutive frames (0-255), at 12 fps, 160 px wide."""
    cmd = ['ffmpeg', '-v', 'error', '-i', str(video), '-vf',
           'fps=12,scale=160:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
           '-an', '-f', 'null', '-']
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return [float(x) for x in re.findall(r'YAVG=([0-9.]+)', out)][1:]


def thumb(video, t, n=24):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.2f}', '-i', str(video), '-frames:v', '1', '-vf', f'scale={n}:{n}',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return list(raw)


def hist(px, bins=4):
    h = [0] * bins ** 3
    for i in range(0, len(px) - 2, 3):
        r, g, b = (px[i] * bins) // 256, (px[i + 1] * bins) // 256, (px[i + 2] * bins) // 256
        h[r * bins * bins + g * bins + b] += 1
    n = sum(h) or 1
    return [x / n for x in h]


def overlap(a, b):
    return sum(min(x, y) for x, y in zip(a, b))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--scenario', type=Path)
    p.add_argument('--json', action='store_true')
    a = p.parse_args()
    d = frame_diffs(a.video)
    if len(d) < 10:
        sys.exit('could not read frame differences')
    med = statistics.median(d)
    cuts = [i for i, x in enumerate(d) if x > max(12 * med, 18)]           # shot cuts / dissolves
    body = [x for i, x in enumerate(d) if all(abs(i - c) > 3 for c in cuts)]
    med = statistics.median(body)
    # flicker proxy: how jumpy frame-to-frame change is inside shots (second difference relative to motion level)
    jerk = [abs(body[i + 1] - body[i]) for i in range(len(body) - 1)]
    flicker = statistics.mean(jerk) / (med + 0.5)
    spikes = sum(1 for x in body if x > 4 * med + 2)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(a.video)], capture_output=True, text=True).stdout or 15)
    secs = [dur / 3] * 3
    if a.scenario:
        secs = [s['seconds'] for s in json.loads(a.scenario.read_text())['plan']['shots']]
    t, mids = 0.0, []
    for s in secs:
        mids.append(t + s / 2); t += s
    hs = [hist(thumb(a.video, m)) for m in mids]
    pair = [overlap(hs[i], hs[i + 1]) for i in range(len(hs) - 1)]
    res = dict(video=a.video.name,
               motionLevel=round(med, 2),            # dynamic-degree proxy: <0.6 reads as a near-still slideshow
               flicker=round(flicker, 3),            # lower is steadier; compare A/B on the same dish
               spikes=spikes,                        # sudden in-shot jumps (morphing / pops)
               cutsDetected=len(cuts),
               shotColourConsistency=[round(x, 2) for x in pair],  # 0-1 palette overlap between neighbouring shots
               notes=[])
    if med < 0.6: res['notes'].append('very little motion: reads as a slideshow')
    if spikes > 3: res['notes'].append('several sudden in-shot jumps: check for morphing')
    if pair and min(pair) < 0.45: res['notes'].append('palette shifts between shots: set/lighting continuity is weak')
    if pair and min(pair) > 0.9: res['notes'].append('shots look nearly identical: little visual progression')
    if a.json:
        print(json.dumps(res, indent=2))
    else:
        print(res)


if __name__ == '__main__':
    main()
