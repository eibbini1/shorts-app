# GPU motion-model bench (24 GB pod)

Goal: decide LTX-2.5 vs Wan 2.2 (FP8 + 4-step lightning LoRA) vs HunyuanVideo 1.5 on the same 10 food shots, with cost, time and memory measured. Stills stay FLUX.2 klein 4B.

## Before you start the pod
- Use your own Runpod account. Budget cap about $5 (about 5 h at $0.89/h Secure, more at $0.34/h Community).
- Pick an RTX 4090 pod with at least 64 GB system RAM (LTX-2 peaked near 45-50 GB RAM) and a 100-150 GB volume for weights.
- Make 10 keyframes with the current Mac stills model (one per shot, `s01.png`..`s10.png`, 9:16) and copy them to the pod. Also copy the current Mac LTX clips as `baseline/sNN.mp4` for the blind test.

## On the pod
1. `git clone` the repo branch, `cd scripts/gpu-bench`.
2. Install ComfyUI or each model's own CLI and download weights (each model card has the steps; check the licence file first).
3. `cp config.example.json config.json`; replace each backend `command` with a shell command that renders one clip. Placeholders: `{prompt} {keyframe} {out} {seconds}`. Set `hourly_usd` to the pod's real rate.
4. Dry run: `python3 bench.py config.json --dry-run`.
5. Real run: `python3 bench.py config.json --keyframes /path/to/keyframes --seconds 5`. The first clip of each backend is the cold load.
6. `python3 summarize.py storage/gpu-bench/results.jsonl`.
7. `python3 blind_sheet.py storage/gpu-bench --baseline /path/to/baseline`, then score `score_sheet.csv` without opening `blind_key.json`.
8. Stop the pod. Download `storage/gpu-bench` before deleting the volume.

## Decision rule (proposed)
Move the motion backend only if the blind test prefers it on at least 6 of 10 shots against the Mac baseline AND cost per kept 5 s clip stays under about $0.15 with peak VRAM under 24 GB. Otherwise keep LTX and use the pod only for speed.
