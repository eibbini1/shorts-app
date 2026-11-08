# Local Shorts pipeline (Mac, free to run)

One command turns a reviewed plan into a captioned 720x1280 Short with an upload pack. Everything runs on your Mac: Gemma plans, FLUX makes the stills, LTX animates them, Kokoro speaks, ffmpeg assembles.

## Quick start

```bash
# 1. Plan: asks for a subject, writes drafts/generated/ID.local-scenario.json, then asks before rendering
bash scripts/make-local-video.sh

# 2. Or render a plan you already have
bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json

# 3. Watch progress from another terminal
bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --watch --preview
```

Options for `--scenario`:

| Option | What it does |
|---|---|
| `--stills FOLDER` | Use `shot-01.png` ... `shot-NN.png` (jpg, webp also fine) from the folder instead of FLUX stills. Use for a recurring character (e.g. Flow stills for Dr. Tod). Missing shots fall back to FLUX. |
| `--chain-images` | Passed to the renderer to chain shot images (see `scripts/render-any-local.py --help`). |
| `--allow-repeat` | Render even when the topic repeats a published or scheduled Short. |

## What runs, in order

| Step | Script | Time | What it does |
|---|---|---|---|
| 1 Environment check | `scripts/check-env.py` | 1 s | Tools, models, ffmpeg captions filter, free disk (15 GB). FAIL lines say how to fix. |
| 2 Pre-render check | `scripts/preflight-short.py` | 1 s | Repeat topic (blocks), hook score, length, non-USD money, missing claims (warn). |
| 3 Render | `scripts/render-any-local.py` | about 25-30 min for 30 s | Stills, motion, voice, soundtrack, assembly, loudness. Reuses finished shots when their inputs are unchanged. |
| 4 Finish | `finish-local-video.py`, `qa-local-video.py` | 5 s | Captions, SRT, upload pack, media QA. |

The timer line at the end (and `timingsSeconds` in the pack) shows where the time went.

## Outputs (in `outputs/`)

- `ID-DATE.mp4` raw video and `ID-DATE.captioned.mp4` with captions (upload this one)
- `ID-DATE.srt` captions file, `ID-DATE.provenance.json` how it was made
- `ID-DATE.pack.json` title, description, tags, claims to check, `qa` block and `timingsSeconds`. Nothing is uploaded automatically.

## The checks

**Pre-render (`preflight-short.py`)**: reads `episodes/channel-performance.json` (published and scheduled Shorts with views).
- Repeat topic: two or more shared subject words with an existing Short. Blocks. Override: `--allow-repeat`.
- Hook score: rough 0-100 from the first narration line. Number or price +20, banned/illegal angle +15, contrast word +10, 12 words or fewer +10. Under 60 warns. It is a heuristic, not a prediction.
- Length 20-35 s, narration under 3.2 words per second, no yen/dirham/pound in the first line, claims listed.

**Post-render (`qa-local-video.py`)**: black frames (0.5 s), frozen picture (2.5 s), loudness -19 to -13 LUFS and peak under -0.5 dB, silence under 1.5 s, length, narration starts within 1 s. A failure prints a warning and marks the pack; it never deletes the video.

## Hybrid route for characters (best quality, tested)

1. Make 6 stills in Google Flow (Nano Banana) from one character sheet; download as 1K.
2. Save them as `shot-01.png` ... `shot-06.png` in a folder.
3. `bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json --stills FOLDER`

Flow is used for hero shots only; motion, voice and captions stay local.

## Channel rules the checks enforce

- One new topic per Short; none repeated within 30 days.
- Formats that did best: same-item price contrast, banned/illegal food, gold on a luxury item, would-you-rather.
- Dollars, number in the first line, 20-35 s, claims with a source.
- After upload, add views and average viewed % to `episodes/channel-performance.json` at 24 h and 7 days so the checks learn.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `FAIL ... missing storage/...` | Run the matching `scripts/setup-*.sh`. |
| `Preflight blocked this scenario` | Pick a new topic or `--allow-repeat`. |
| A shot looks wrong | Edit that shot's `imagePrompt` in the scenario and run again; the render reuses work it has already finished when the inputs are unchanged. |
| Captions missing | `ffmpeg -filters | grep subtitles` must list it; `brew reinstall ffmpeg`. |
| Run died midway | Run the same command again; finished work is reused when its inputs are unchanged. |
