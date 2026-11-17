#!/usr/bin/env python3
"""Phase 0 baseline: FLUX.2 Klein first+last stills and local LTX-2.3 motion for
data/benchmarks/food-motion-testset.json. Resumable (skips existing files).
Output: storage/benchmarks/food-motion-v1/{stills,motion,manifest.json,blind/}.
Local only; no paid APIs."""
import json, random, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLUX_PY = ROOT / "storage/tools/mflux/.venv/bin/python"
LTX = ROOT / "storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"
SPEC = ROOT / "data/benchmarks/food-motion-testset.json"
W = ROOT / "storage/benchmarks/food-motion-v1"
STYLE = ("photorealistic luxury food photography, macro lens, shallow depth of field, warm soft key light, "
         "dark moody kitchen background, sharp focus, natural textures, vertical 9:16 composition")
FRAMES = 65


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def sh(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


def main():
    spec = json.loads(SPEC.read_text())
    for d in ("stills", "motion", "blind"):
        (W / d).mkdir(parents=True, exist_ok=True)
    mf_path = W / "manifest.json"
    mf = json.loads(mf_path.read_text()) if mf_path.exists() else {"engine": "local-ltx-2.3", "shots": {}}
    model = (ROOT / "storage/setup/ltx-model-dir.txt").read_text().strip()
    gemma = (ROOT / "storage/setup/gemma-model-dir.txt").read_text().strip()
    # Stills first (fast), then motion (slow), so a crash never loses stills.
    for i, s in enumerate(spec["shots"]):
        for kind in ("first", "last"):
            out = W / "stills" / f"{s['id']}-{kind}.png"
            if out.exists():
                continue
            prompt = f"{s[kind + '_frame']}. {STYLE}"
            t0 = time.time()
            sh([FLUX_PY, "scripts/create-flux-image.py", "--prompt", prompt, "--seed", 5000 + i * 10 + (kind == "last"),
                "--width", 576, "--height", 1024, "--output", out], cwd=ROOT)
            if not out.exists():
                sys.exit(f"FLUX produced no image for {s['id']}-{kind}. Battery <5% or Metal issue? Re-run to resume.")
            mf["shots"].setdefault(s["id"], {})[f"still_{kind}_seconds"] = round(time.time() - t0)
            mf_path.write_text(json.dumps(mf, indent=1))
            log("still", s["id"], kind, round(time.time() - t0), "s")
    for i, s in enumerate(spec["shots"]):
        out = W / "motion" / f"{s['id']}.mp4"
        if out.exists():
            continue
        t0 = time.time()
        first = W / "stills" / f"{s['id']}-first.png"
        r = sh([LTX, "generate", "--model", model, "--gemma", gemma, "--distilled", "--low-ram", "--no-audio",
                "--seed", 7000 + i, "--image", first, "0", "1.0", "--prompt", f"{s['action']}. Smooth natural motion, realistic physics, steady camera.",
                "-H", 1024, "-W", 576, "-f", FRAMES, "--frame-rate", 24, "-o", out], cwd=ROOT, timeout=3600)
        e = mf["shots"].setdefault(s["id"], {})
        e["motion_seconds"] = round(time.time() - t0)
        e["seed"] = 7000 + i
        if not out.exists():
            e["motion"] = "failed"
            log("LTX failed", s["id"], r.stderr[-300:])
        mf_path.write_text(json.dumps(mf, indent=1))
        log("motion", s["id"], e["motion_seconds"], "s")
    # Blind copies: random codes, key kept separate.
    ids = [s["id"] for s in spec["shots"] if (W / "motion" / f"{s['id']}.mp4").exists()]
    codes = random.Random(42).sample(range(100, 999), len(ids))
    key = {}
    for sid, code in zip(ids, codes):
        dst = W / "blind" / f"local-ltx-{code}.mp4"
        if not dst.exists():
            dst.write_bytes((W / "motion" / f"{sid}.mp4").read_bytes())
        key[f"local-ltx-{code}"] = sid
    (W / "blind-key.json").write_text(json.dumps(key, indent=1))
    log("DONE", len(ids), "of", len(spec["shots"]), "clips")


if __name__ == "__main__":
    main()
