#!/usr/bin/env python3
"""Per-backend summary of results.jsonl: median s/clip, cold load, peaks, $/Short (8 clips x 3 tries)."""
import json, statistics, sys
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else "storage/gpu-bench/results.jsonl")]
by = defaultdict(list)
for r in rows: by[r["backend"]].append(r)
print("backend | ok/total | cold s | median warm s | peak VRAM GB | peak RAM GB | $/clip | $/Short (8 clips x3 tries, 2x busy)")
for name, rs in by.items():
    ok = [r for r in rs if r["ok"]]
    warm = [r["seconds"] for r in ok if not r["first_in_run"]] or [r["seconds"] for r in ok] or [0]
    cold = next((r["seconds"] for r in ok if r["first_in_run"]), 0)
    clip = statistics.median(r["cost_usd"] for r in ok) if ok else 0
    print(f"{name} | {len(ok)}/{len(rs)} | {cold} | {statistics.median(warm)} | "
          f"{max((r['peak_vram_mb'] for r in rs), default=0)/1024:.1f} | "
          f"{max((r['peak_ram_mb'] for r in rs), default=0)/1024:.1f} | {clip:.3f} | {clip*8*3*2:.2f}")
