#!/usr/bin/env python3
"""Make a blind comparison: copy each shot's clips from every backend (plus the
current Mac output, if given) to anonymised names and write a key + score sheet.
Usage: blind_sheet.py OUT_DIR [--baseline DIR_WITH_sNN.mp4]
"""
import argparse, csv, json, random, shutil
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("out_dir")
ap.add_argument("--baseline", default="")
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
root = Path(a.out_dir)
rnd = random.Random(a.seed)
sources = {p.name: p for p in root.iterdir() if p.is_dir() and p.name != "blind"}
if a.baseline:
    sources["mac-baseline"] = Path(a.baseline)
shots = sorted({c.stem for d in sources.values() for c in d.glob("s*.mp4")})
blind = root / "blind"; blind.mkdir(exist_ok=True)
key, rows = {}, []
for shot in shots:
    have = [(n, d / f"{shot}.mp4") for n, d in sources.items() if (d / f"{shot}.mp4").exists()]
    rnd.shuffle(have)
    for i, (name, path) in enumerate(have):
        label = f"{shot}_{chr(65 + i)}"
        shutil.copy(path, blind / f"{label}.mp4")
        key[label] = name
    rows.append([shot] + [""] * 5)
(root / "blind_key.json").write_text(json.dumps(key, indent=2))
with (root / "score_sheet.csv").open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["shot", "best_label", "worst_label", "motion_1to5", "food_realism_1to5", "notes"])
    w.writerows(rows)
print(f"{len(key)} clips in {blind}; score in score_sheet.csv; do not open blind_key.json until done")
