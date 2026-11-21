#!/usr/bin/env python3
"""Time motion backends on the same shots and log cost, VRAM and RAM.

Backends are shell command templates from a config file, so no model API is
assumed here. Each command must write a video to {out}.
Usage: bench.py CONFIG [--shots s01,s02] [--seconds 5] [--keyframes DIR] [--dry-run]
"""
import argparse, json, os, shlex, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent


def sample_peaks(stop, peaks):
    """Poll nvidia-smi (VRAM) and /proc/meminfo (system RAM) until stop is set."""
    while not stop.is_set():
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5).stdout.split()
            if out:
                peaks["vram_mb"] = max(peaks["vram_mb"], max(int(v) for v in out))
        except Exception:
            pass
        try:
            mem = dict(l.split(":", 1) for l in Path("/proc/meminfo").read_text().splitlines())
            used = (int(mem["MemTotal"].split()[0]) - int(mem["MemAvailable"].split()[0])) // 1024
            peaks["ram_mb"] = max(peaks["ram_mb"], used)
        except Exception:
            pass
        stop.wait(1.0)


def run_one(cmd, timeout):
    peaks = {"vram_mb": 0, "ram_mb": 0}
    stop = threading.Event()
    t = threading.Thread(target=sample_peaks, args=(stop, peaks), daemon=True)
    t.start()
    start = time.time()
    try:
        proc = subprocess.run(cmd, shell=True, timeout=timeout, capture_output=True, text=True)
        rc, tail = proc.returncode, (proc.stderr or proc.stdout)[-400:]
    except subprocess.TimeoutExpired:
        rc, tail = -1, "timeout"
    elapsed = time.time() - start
    stop.set(); t.join(timeout=3)
    return rc, elapsed, peaks, tail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--shots", default="")
    ap.add_argument("--seconds", type=int, default=5)
    ap.add_argument("--keyframes", default="")
    ap.add_argument("--timeout", type=int, default=1200)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    cfg = json.loads(Path(a.config).read_text())
    shots = json.loads((HERE / "prompts.json").read_text())["shots"]
    if a.shots:
        want = set(a.shots.split(","))
        shots = [s for s in shots if s["id"] in want]
    out_dir = Path(cfg.get("out_dir", "storage/gpu-bench"))
    results = out_dir / "results.jsonl"
    out_dir.mkdir(parents=True, exist_ok=True)
    rate = float(cfg["hourly_usd"])

    for b in cfg["backends"]:
        if b["command"].startswith("REPLACE"):
            print(f"skip {b['name']}: command not configured", file=sys.stderr)
            continue
        for first, s in enumerate(shots):
            clip = out_dir / b["name"] / f"{s['id']}.mp4"
            clip.parent.mkdir(parents=True, exist_ok=True)
            kf = str(Path(a.keyframes) / f"{s['id']}.png") if a.keyframes else ""
            cmd = b["command"].format(prompt=shlex.quote(s["prompt"]), keyframe=shlex.quote(kf),
                                      out=shlex.quote(str(clip)), seconds=a.seconds)
            if a.dry_run:
                print(f"[{b['name']}/{s['id']}] {cmd}")
                continue
            rc, elapsed, peaks, tail = run_one(cmd, a.timeout)
            row = {"backend": b["name"], "shot": s["id"], "ok": rc == 0 and clip.exists(),
                   "seconds": round(elapsed, 1), "first_in_run": first == 0,
                   "cost_usd": round(elapsed / 3600 * rate, 4),
                   "peak_vram_mb": peaks["vram_mb"], "peak_ram_mb": peaks["ram_mb"],
                   "gpu": cfg.get("gpu_label", ""), "error": "" if rc == 0 else tail}
            with results.open("a") as f:
                f.write(json.dumps(row) + "\n")
            print(row)


if __name__ == "__main__":
    main()
