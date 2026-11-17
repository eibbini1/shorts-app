#!/usr/bin/env python3
"""Render an Arabic recipe Reel from data/recipes/<id>.json (local, free, resumable).

Stages: voice -> assets (FLUX stills + qwen gate + LTX motion) -> assemble -> qa.
Existing assets are never regenerated. Usage:
  python3 scripts/render-arabic-recipe.py data/recipes/avocado-egg-salad-ar.json [--stage all|voice|assets|assemble|qa]
"""
import argparse, json, re, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLUX_PY = ROOT / "storage/tools/mflux/.venv/bin/python"
LTX = ROOT / "storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"
SOF = ROOT / "storage/tools/sofelia"
CAPTION_SH = ROOT / "scripts/arabic-caption-png.sh"
MUSIC = ROOT / "assets/music/wholesome-kevin-macleod-60s.ogg"
AMBIENT = ROOT / "assets/foley/public-domain/ambient-kitchen.ogg"
CUTLERY = ROOT / "assets/foley/public-domain/wood-and-cutlery.ogg"
CAPTION_Y = 1480
LTX_FRAMES = 65


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def sh(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


def ffprobe_dur(p):
    r = sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p])
    return float(r.stdout.strip())


def strip_ar(t):
    t = re.sub(r"[\u064B-\u065F\u0670]", "", t)
    return re.sub(r"[^\w]", "", t)


class Ctx:
    def __init__(self, spec_path):
        self.spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
        self.id = self.spec["id"]
        self.W = ROOT / "storage/arabic-recipe" / self.id
        for d in ("stills", "motion", "voice", "clips", "caps", "final", "gate", "rejected"):
            (self.W / d).mkdir(parents=True, exist_ok=True)
        self.manifest_p = self.W / "manifest.json"
        self.manifest = json.loads(self.manifest_p.read_text()) if self.manifest_p.exists() else {"shots": {}, "timing": {}}

    def save(self):
        self.manifest_p.write_text(json.dumps(self.manifest, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- voice
def silences(wav):
    r = sh(["ffmpeg", "-hide_banner", "-i", wav, "-af", "silencedetect=noise=-35dB:d=0.10", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [(float(a), float(b)) for a, b in re.findall(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", r.stderr)]
    out, ends_l = [], ends
    for i, s in enumerate(starts):
        e = ends_l[i][0] if i < len(ends_l) else None
        out.append((s, e))
    return out


def stage_voice(c):
    for sc in c.spec["scenes"]:
        raw = c.W / "voice" / f"{sc['id']}-raw.wav"
        wav = c.W / "voice" / f"{sc['id']}.wav"
        if not wav.exists():
            r = sh([SOF / ".venv/bin/python", "speak.py", sc["tts"], "1.0", raw], cwd=SOF / "model")
            if not raw.exists():
                raise SystemExit(f"voice failed {sc['id']}: {r.stderr[-400:]}")
            sh(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-ar", "48000", "-ac", "1", "-af",
                "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse", wav])
            log("voice", sc["id"], round(ffprobe_dur(wav), 2), "s")
        d = ffprobe_dur(wav)
        sil = silences(wav)
        s0 = sil[0][1] if sil and sil[0][0] < 0.01 and sil[0][1] else 0.0
        end = d
        if sil and sil[-1][1] is None:
            end = sil[-1][0]
        # caption boundaries: proportional by letters, comma boundaries snap to nearest pause
        caps = sc["captions"]
        counts = [max(1, len(strip_ar(x))) for x in caps]
        total = sum(counts)
        span = end - s0
        pauses = [(a + (b if b else a)) / 2 if False else ((a + b) / 2 if b else a) for a, b in sil if a > s0 + 0.2 and a < end - 0.2]
        starts, cum = [s0], 0
        for i in range(len(caps) - 1):
            cum += counts[i]
            est = s0 + span * cum / total
            if re.search(r"[،.]$", caps[i]) and pauses:
                best = min(pauses, key=lambda p: abs(p - est))
                if abs(best - est) <= 0.7:
                    est = best
            starts.append(est)
        c.manifest["timing"][sc["id"]] = {"duration": round(d, 3), "speech_start": round(s0, 3), "speech_end": round(end, 3),
                                         "caption_starts": [round(x, 3) for x in starts]}
    c.save()
    log("voice stage done")


# ---------------------------------------------------------------- assets
def gen_still(c, shot):
    out = c.W / "stills" / f"{shot['id']}.png"
    if out.exists():
        return out
    prompt = f"{shot['prompt']} {c.spec['style']}"
    for k in range(3):
        seed = shot["seed"] + 100 * k
        for f in (out, out.with_suffix(".json"), out.with_suffix(".png.json")):
            if f.exists():
                f.unlink()
        t0 = time.time()
        r = sh([FLUX_PY, "scripts/create-flux-image.py", "--prompt", prompt, "--seed", seed, "--width", 576, "--height", 1024, "--output", out], cwd=ROOT)
        if not out.exists():
            log("FLUX failed", shot["id"], r.stderr[-300:])
            continue
        g = sh(["python3", "scripts/check-still-vision.py", "--image", out, "--prompt", prompt,
                "--question", f"Does the image clearly show {shot['must_show']}?", "--cache-dir", c.W / "gate"], cwd=ROOT)
        ok = g.returncode == 0
        c.manifest["shots"].setdefault(shot["id"], {}).update({"seed": seed, "attempt": k + 1, "gate": "pass" if ok else "fail",
                                                              "gate_note": (g.stdout + g.stderr)[-300:], "still_seconds": round(time.time() - t0)})
        c.save()
        log("still", shot["id"], "attempt", k + 1, "gate", "PASS" if ok else "FAIL", round(time.time() - t0), "s")
        if ok:
            return out
        shutil.copy(out, c.W / "rejected" / f"{shot['id']}-a{k + 1}.png")
    if not out.exists():
        raise SystemExit(f"FLUX produced no image for {shot['id']} after 3 attempts (Metal/GPU?). Re-run the assets stage to resume.")
    log("WARNING gate never passed for", shot["id"], "- keeping last still, flagged for review")
    c.manifest["shots"].setdefault(shot["id"], {})["gate"] = "failed-accepted"
    c.save()
    return out


def gen_motion(c, shot, still):
    out = c.W / "motion" / f"{shot['id']}.mp4"
    if out.exists():
        return out
    model = Path(ROOT / "storage/setup/ltx-model-dir.txt").read_text().strip()
    gemma = Path(ROOT / "storage/setup/gemma-model-dir.txt").read_text().strip()
    t0 = time.time()
    r = sh([LTX, "generate", "--model", model, "--gemma", gemma, "--distilled", "--low-ram", "--no-audio", "--seed", shot["seed"] + 1,
            "--image", still, "0", "1.0", "--prompt", shot["motion"], "-H", 1024, "-W", 576, "-f", LTX_FRAMES, "--frame-rate", 24, "-o", out],
           cwd=ROOT, timeout=3600)
    c.manifest["shots"].setdefault(shot["id"], {})["motion_seconds"] = round(time.time() - t0)
    if not out.exists():
        log("LTX failed", shot["id"], r.stderr[-300:])
        c.manifest["shots"][shot["id"]]["motion"] = "failed-fallback-kenburns"
    else:
        log("motion", shot["id"], round(time.time() - t0), "s")
    c.save()
    return out


def stage_assets(c):
    for sc in c.spec["scenes"]:
        for shot in sc["shots"]:
            if shot["kind"] == "existing":
                continue
            still = gen_still(c, shot)
            if shot["kind"] == "motion":
                gen_motion(c, shot, still)
    log("assets stage done")


# ---------------------------------------------------------------- assemble
def timeline(c):
    """Absolute per-shot and per-caption times."""
    t, shots, caps = 0.0, [], []
    for sc in c.spec["scenes"]:
        tm = c.manifest["timing"][sc["id"]]
        off = sc.get("voice_offset", 0.5)
        local = []
        for i, sh_ in enumerate(sc["shots"]):
            if i == 0:
                st = 0.0
            elif "at_phrase" in sh_:
                st = off + tm["caption_starts"][sh_["at_phrase"]]
            elif sh_.get("at") == "voice_end":
                st = min(off + tm["speech_end"] + 0.35, sc["seconds"] - 1.5)
            else:
                st = local[-1] + sh_.get("seconds", 2.0)
            if local and st < local[-1] + 1.2:
                st = local[-1] + 1.2
            local.append(st)
        for i, sh_ in enumerate(sc["shots"]):
            end = local[i + 1] if i + 1 < len(local) else sc["seconds"]
            shots.append({"scene": sc["id"], "shot": sh_, "start": t + local[i], "end": t + end})
        cs = tm["caption_starts"]
        for i, txt in enumerate(sc["captions"]):
            a = t + off + cs[i] - 0.05
            b = t + off + (cs[i + 1] - 0.05 if i + 1 < len(cs) else tm["speech_end"] + 0.3)
            caps.append({"scene": sc["id"], "text": txt, "start": round(max(t, a), 3), "end": round(min(t + sc["seconds"], b), 3)})
        t += sc["seconds"]
    return shots, caps


def make_clip(c, item):
    shot, fps = item["shot"], c.spec["fps"]
    d = round((item["end"] - item["start"]) * fps) / fps
    n = round(d * fps)
    out = c.W / "clips" / f"{shot['id']}.mp4"
    W, H = c.spec["width"], c.spec["height"]
    enc = ["-c:v", "libx264", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", "-r", str(fps), "-an"]
    mp = c.W / "motion" / f"{shot['id']}.mp4"
    if shot["kind"] == "existing":
        mp = ROOT / shot["file"]
    if shot["kind"] in ("motion", "existing") and mp.exists():
        cd = ffprobe_dur(mp)
        slow = min(max(d / cd, 1.0), shot.get("max_slow", 1.35)) if d > cd else 1.0
        vf = f"scale={W}:{H}:flags=lanczos,setpts=PTS*{slow:.4f},fps={fps},tpad=stop_mode=clone:stop_duration=3,trim=end_frame={n},setpts=PTS-STARTPTS"
        r = sh(["ffmpeg", "-y", "-loglevel", "error", "-i", mp, "-vf", vf, *enc, out])
    else:
        still = c.W / "stills" / f"{shot['id']}.png"
        mv = shot.get("move", "push")
        z = {"push": f"1.0+0.13*on/{n}", "pull": f"1.13-0.13*on/{n}", "panr": "1.12", "panl": "1.12"}[mv]
        x = {"panr": f"(iw-iw/zoom)*on/{n}", "panl": f"(iw-iw/zoom)*(1-on/{n})"}.get(mv, "iw/2-(iw/zoom/2)")
        vf = f"scale=1620:2880:flags=lanczos,zoompan=z='{z}':x='{x}':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps},unsharp=5:5:0.4"
        r = sh(["ffmpeg", "-y", "-loglevel", "error", "-i", still, "-vf", vf, "-frames:v", n, *enc, out])
    if not out.exists():
        raise SystemExit(f"clip failed {shot['id']}: {r.stderr[-400:]}")
    return out


def stage_assemble(c):
    fps = c.spec["fps"]
    shots, caps = timeline(c)
    c.manifest["timeline"] = {"shots": [{"id": s["shot"]["id"], "start": round(s["start"], 2), "end": round(s["end"], 2)} for s in shots], "captions": caps}
    for f in (c.W / "clips").glob("*.mp4"):
        f.unlink()
    lst = []
    for s in shots:
        lst.append(f"file '{make_clip(c, s)}'")
    (c.W / "clips" / "list.txt").write_text("\n".join(lst))
    base = c.W / "final" / "base-nocaps.mp4"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", c.W / "clips" / "list.txt", "-c", "copy", base])
    log("base video", round(ffprobe_dur(base), 2), "s")
    # captions
    pngs = []
    for i, cp in enumerate(caps):
        p = c.W / "caps" / f"c{i:02d}.png"
        subprocess.run(["/bin/zsh", str(CAPTION_SH), cp["text"], str(p)], capture_output=True)
        pngs.append(p)
    # audio
    voice_in, filt = [], []
    for i, sc in enumerate(c.spec["scenes"]):
        voice_in += ["-i", c.W / "voice" / f"{sc['id']}.wav"]
    start_t, delays = 0.0, []
    for sc in c.spec["scenes"]:
        delays.append(int((start_t + sc.get("voice_offset", 0.5)) * 1000)); start_t += sc["seconds"]
    fc = "".join(f"[{i}:a]adelay={d}|{d}[v{i}];" for i, d in enumerate(delays))
    fc += "".join(f"[v{i}]" for i in range(len(delays))) + f"amix=inputs={len(delays)}:normalize=0,apad=pad_dur=60,atrim=0:60[vo]"
    voice_all = c.W / "final" / "voice-all.wav"
    sh(["ffmpeg", "-y", "-loglevel", "error", *voice_in, "-filter_complex", fc, "-map", "[vo]", "-ar", "48000", voice_all])
    cues = [s["start"] for s in shots if s["scene"] == "s3"] + [sum(x["seconds"] for x in c.spec["scenes"][:3]) + 0.2]
    sin = []
    for _ in cues:
        sin += ["-i", CUTLERY]
    sfc = "".join(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,adelay={int(t*1000)}|{int(t*1000)},volume=0.35[x{i}];" for i, t in enumerate(cues))
    sfc += "".join(f"[x{i}]" for i in range(len(cues))) + f"amix=inputs={len(cues)}:normalize=0,apad=pad_dur=60,atrim=0:60[sf]"
    sfx = c.W / "final" / "sfx.wav"
    sh(["ffmpeg", "-y", "-loglevel", "error", *sin, "-filter_complex", sfc, "-map", "[sf]", sfx])
    mix_raw, mix = c.W / "final" / "mix-raw.wav", c.W / "final" / "mix.wav"
    mfc = ("[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55,afade=t=in:st=0:d=1.5,afade=t=out:st=57:d=3[m0];"
           "[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.22,afade=t=in:st=0:d=1,afade=t=out:st=58:d=2[amb];"
           "[3:a]aformat=channel_layouts=stereo[sf];[0:a]aformat=channel_layouts=stereo,asplit=2[vm][vs];"
           "[m0][vs]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[md];"
           "[vm][md][amb][sf]amix=inputs=4:normalize=0,atrim=0:60,asetpts=N/SR/TB[mix]")
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", voice_all, "-i", MUSIC, "-ss", "40", "-t", "62", "-i", AMBIENT, "-i", sfx,
        "-filter_complex", mfc, "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s16le", mix_raw])
    rr = sh(["ffmpeg", "-hide_banner", "-i", mix_raw, "-af", "ebur128=peak=true", "-f", "null", "-"])
    L = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", rr.stderr)[-1])
    gain = round(-16.0 - L, 2)
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", mix_raw, "-af", f"volume={gain}dB,alimiter=limit=0.84:level=disabled", "-ar", "48000", "-c:a", "pcm_s16le", mix])
    log("audio mix raw", L, "LUFS gain", gain)
    # final: captions + grade + audio
    cin, chain, prev = [], "", "0:v"
    for i, (cp, p) in enumerate(zip(caps, pngs)):
        cin += ["-i", p]
        chain += f"[{prev}][{i+2}:v]overlay=(W-w)/2:{CAPTION_Y}-h/2:enable='between(t,{cp['start']},{cp['end']})'[o{i}];"
        prev = f"o{i}"
    chain += f"[{prev}]eq=contrast=1.04:saturation=1.08,format=yuv420p[v]"
    final = c.W / "final" / f"{c.id}.mp4"
    r = sh(["ffmpeg", "-y", "-loglevel", "error", "-i", base, "-i", mix, *cin, "-filter_complex", chain, "-map", "[v]", "-map", "1:a", "-t", "60",
            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])
    if not final.exists():
        raise SystemExit("final encode failed: " + r.stderr[-500:])
    thumb = c.W / "final" / "thumbnail-candidate.jpg"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-ss", "56.5", "-i", base, "-frames:v", "1", "-q:v", "2", thumb])
    credits = c.W / "final" / "credits.txt"
    credits.write_text("Music credits (required, CC BY 4.0):\n" + (ROOT / "assets/music/SOURCES.md").read_text() + "\nSound: public-domain foley per assets/foley/public-domain/SOURCES.md\nVoice: Sofelia TTS 82M (Apache-2.0 per model card), AI-generated. Disclose AI use on upload.\n")
    c.save()
    log("final", final)


# ---------------------------------------------------------------- qa
def stage_qa(c):
    final = c.W / "final" / f"{c.id}.mp4"
    rep = {}
    r = sh(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,duration", "-of", "json", final])
    rep["streams"] = json.loads(r.stdout)["streams"]
    rep["black"] = re.findall(r"black_start:([\d.]+).*?black_duration:([\d.]+)", sh(["ffmpeg", "-i", final, "-vf", "blackdetect=d=0.2:pix_th=0.10", "-an", "-f", "null", "-"]).stderr)
    fz = sh(["ffmpeg", "-i", final, "-vf", "freezedetect=n=-60dB:d=1.0", "-an", "-f", "null", "-"]).stderr
    rep["frozen_segments"] = re.findall(r"freeze_start: ([\d.]+)", fz)
    ae = sh(["ffmpeg", "-hide_banner", "-i", final, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    rep["loudness_lufs"] = re.findall(r"I:\s+(-?[\d.]+) LUFS", ae)[-1]
    rep["true_peak_dbfs"] = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", ae)[-1]
    rep["gate_failures"] = [k for k, v in c.manifest["shots"].items() if v.get("gate") != "pass"]
    rep["motion_failures"] = [k for k, v in c.manifest["shots"].items() if v.get("motion", "").startswith("failed")]
    caps = c.manifest["timeline"]["captions"]
    rep["caption_overlaps"] = [i for i in range(len(caps) - 1) if caps[i]["end"] > caps[i + 1]["start"] + 0.001]
    (c.W / "final" / "qa-report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2))
    ts = ",".join(f"{t:.2f}" for t in [2, 7, 10, 15, 19, 22, 26, 31, 35, 39, 44, 48, 52, 55, 58])
    for i, t in enumerate(ts.split(",")):
        sh(["ffmpeg", "-y", "-loglevel", "error", "-ss", t, "-i", final, "-frames:v", "1", "-vf", "scale=270:-1", c.W / "final" / f"q{i:02d}.png"])
    sh(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "1", "-i", c.W / "final" / "q%02d.png", "-vf", "tile=5x3:padding=4", "-frames:v", "1", c.W / "final" / "contact-sheet.png"])
    log("qa", json.dumps(rep, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--stage", default="all")
    a = ap.parse_args()
    c = Ctx(a.spec)
    st = ["voice", "assets", "assemble", "qa"] if a.stage == "all" else [a.stage]
    for s in st:
        {"voice": stage_voice, "assets": stage_assets, "assemble": stage_assemble, "qa": stage_qa}[s](c)
    log("ALLDONE", a.stage)


if __name__ == "__main__":
    main()
