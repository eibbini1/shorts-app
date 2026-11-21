#!/usr/bin/env python3
"""Cheap CPU video metrics for A/B comparison of local films (no model downloads).

Inspired by the VBench dimensions (temporal flickering, dynamic degree, imaging quality, consistency), but these are
simple pixel proxies, NOT the VBench metrics (which use DINO/CLIP/MUSIQ models). Uncalibrated: use them only to compare
two renders of the same dish, and always confirm by watching. Measured on the picture area above the captions.

Run with the mflux venv python (has numpy):
  storage/tools/mflux/.venv/bin/python scripts/video-metrics.py A.mp4 B.mp4 [--shots 3] [--skip 0.0] [--json]
"""
import json, subprocess, sys
import numpy as np

W, H, FPS = 180, 320, 12


def frames(path):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={FPS},scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32)
    return a[:, int(H * 0.12):int(H * 0.62)]  # picture area: below any top title, above lower-third captions


def lap_var(g):
    l = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(l.var())


def hist(f):
    h, _ = np.histogramdd(f.reshape(-1, 3), bins=(6, 6, 6), range=((0, 256),) * 3)
    return h.ravel() / h.sum()


def measure(path, shots=3, skip=0.0):
    a = frames(path)[int(skip * FPS):]
    g = a.mean(-1)
    n = len(g)
    d1 = np.abs(np.diff(g, axis=0)).mean((1, 2))           # frame-to-frame change
    d2 = np.abs(g[2:] - 2 * g[1:-1] + g[:-2]).mean((1, 2))  # change that reverses next frame = flicker/shimmer
    edges = [round(i * n / shots) for i in range(shots + 1)]
    per, mids = [], []
    for i in range(shots):
        s, e = edges[i], edges[i + 1]
        m = slice(s + 3, e - 3)                             # ignore the cut/dissolve frames
        mid = a[(s + e) // 2]
        mids.append(hist(mid))
        per.append(dict(shot=i + 1, motion=round(float(d1[m].mean()), 2), flicker=round(float(d2[m.start:m.stop - 1].mean()), 2),
                        sharpness=round(float(np.mean([lap_var(g[k]) for k in range(s + 3, e - 3, 6)])), 1),
                        brightness=round(float(g[m].mean()), 1)))
    sim = [float(np.minimum(mids[i], mids[j]).sum()) for i in range(shots) for j in range(i + 1, shots)]
    return dict(file=path.split('/')[-1], seconds=round(n / FPS, 1), shots=per,
                motion=round(float(np.mean([p['motion'] for p in per])), 2),
                flicker=round(float(np.mean([p['flicker'] for p in per])), 2),
                flicker_ratio=round(float(np.mean([p['flicker'] / max(p['motion'], 0.01) for p in per])), 2),
                sharpness=round(float(np.mean([p['sharpness'] for p in per])), 1),
                palette_consistency=round(float(np.mean(sim)), 3) if sim else None)


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    opt = dict(zip(sys.argv[1:], sys.argv[2:]))
    if not args:
        sys.exit(__doc__)
    res = [measure(p, int(opt.get('--shots', 3)), float(opt.get('--skip', 0))) for p in args if p not in opt.values() or p.endswith('.mp4')]
    if '--json' in sys.argv:
        print(json.dumps(res, indent=2)); sys.exit()
    print('motion: higher = more movement (a near-zero clip is a frozen still).  flicker_ratio: lower = smoother.')
    print('sharpness: higher = crisper.  palette_consistency: 0-1, higher = shots share one look.  Proxies only.\n')
    for r in res:
        print(f"{r['file']}\n  motion {r['motion']}  flicker {r['flicker']}  flicker_ratio {r['flicker_ratio']}  sharpness {r['sharpness']}  palette_consistency {r['palette_consistency']}")
        for p in r['shots']:
            print(f"    shot {p['shot']}: motion {p['motion']}  flicker {p['flicker']}  sharpness {p['sharpness']}  brightness {p['brightness']}")
