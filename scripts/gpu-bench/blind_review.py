#!/usr/bin/env python3
"""Blind review of motion backends on the shots every backend produced.

Takes the flat clip folders from the pod and the Mac baseline, keeps only shots that ALL backends have
(a fair comparison), strips audio and metadata so nothing gives the model away, then shuffles and
anonymises the clips and writes a key + score sheet. Do not open blind_key.json until you have scored.

Usage: blind_review.py OUT_DIR --pod DIR --mac DIR [--seed 7]
  pod DIR holds wan_sNN.mp4 and ltx_sNN.mp4; mac DIR holds ltx23_sNN.mp4
"""
import argparse, csv, json, random, re, subprocess, sys
from pathlib import Path

BACKENDS = [("wan22-5b", "pod", "wan_"), ("ltx25-fp8", "pod", "ltx_"), ("ltx23-q4-mac", "mac", "ltx23_")]


def find(folder, prefix):
    out = {}
    for p in Path(folder).glob(f"{prefix}s[0-9][0-9].mp4"):
        m = re.fullmatch(rf"{re.escape(prefix)}(s\d\d)\.mp4", p.name)
        if m and p.stat().st_size > 0:
            out[m.group(1)] = p
    return out


def strip(src, dst):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:v:0", "-c:v", "copy", "-an",
                        "-map_metadata", "-1", "-fflags", "+bitexact", "-movflags", "+faststart", str(dst)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ffmpeg failed on {src}: {r.stderr.strip()[:200]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--pod", required=True)
    ap.add_argument("--mac", required=True)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    dirs = {"pod": a.pod, "mac": a.mac}
    found = {name: find(dirs[where], prefix) for name, where, prefix in BACKENDS}
    for name, clips in found.items():
        print(f"{name}: {len(clips)} clips ({', '.join(sorted(clips)) or 'none'})")
    shots = sorted(set.intersection(*(set(c) for c in found.values())))
    if not shots:
        sys.exit("No shot exists for every backend yet; wait for the missing clips.")
    skipped = sorted(set.union(*(set(c) for c in found.values())) - set(shots))
    if skipped:
        print("skipped (not produced by every backend):", ", ".join(skipped))
    root = Path(a.out_dir)
    blind = root / "blind"
    blind.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(a.seed)
    key, rows = {}, []
    for shot in shots:
        order = [name for name, _, _ in BACKENDS]
        rnd.shuffle(order)
        for i, name in enumerate(order):
            label = f"{shot}_{chr(65 + i)}"
            strip(found[name][shot], blind / f"{label}.mp4")
            key[label] = name
        rows.append([shot] + [""] * 5)
    (root / "blind_key.json").write_text(json.dumps(key, indent=2))
    with (root / "score_sheet.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["shot", "best_label", "worst_label", "motion_1to5", "food_realism_1to5", "notes"])
        w.writerows(rows)
    print(f"{len(shots)} shots, {len(key)} anonymised clips in {blind}. Score score_sheet.csv, then open blind_key.json.")


if __name__ == "__main__":
    main()
