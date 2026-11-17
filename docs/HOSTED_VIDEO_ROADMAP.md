# Hosted video roadmap: local MLX to hosted GPU (Wan / open models)

Status: PLANNED. Owner approved all phases on 2026-11-17; each paid or install step still needs its own spend cap and go-ahead.
Evidence: research report "Hosted Wan GPU video pipeline" (2026-11-17). Items marked INFERENCE are arithmetic or reasoning, not measurements.

## Findings that shape the plan
- Wan 2.2 (Apache 2.0, Jul 2025) is the newest self-hostable Wan. Wan 2.5 to 3.0 are API-only. Open-weights arena leaders are MiniMax H3 and LTX-2.5, not Wan.
- 40-step Wan 2.2 A14B on one B200 is about 373 s per 5 s 720p clip: roughly $23-30 per 60 s video (INFERENCE). Hosted fal Wan 2.2 is about $14.58 at 3 tries per clip. Only a 4-step distilled runtime makes self-hosting cheaper (projected $1.25-2.50, UNMEASURED).
- >=128 GB VRAM is not required: FP8 distilled experts are about 15 GB each and fit 80-96 GB cards.
- No source ranks any model on hands, knives, liquids or food. Our own blind test is the gate.
- Owner is in Jordan: licence territory exclusions of MiniMax H3 and HunyuanVideo 1.5 do not appear to apply (not legal advice; GPU region and H3 branding clause still to read).

## Architecture rule
One `MotionEngine` contract (shot spec in, MP4 + manifest out) with `local-ltx` first and `remote-*` later. Mac controller owns job state, SQLite spend ledger, finishing. Remote worker is stateless, scale-to-zero, reached only via the provider queue, never an exposed ComfyUI. Media moves through R2 presigned URLs, never base64.

## Phases and gates
| Phase | Work | Cost | Exit gate |
|---|---|---|---|
| 0 | Fixed 10-shot blind food test set, 9:16, FLUX.2 Klein first (and last) frames, local LTX-2.3 baseline, scoring sheet | none | Baseline scored; test set frozen |
| 1 | `MotionEngine` interface + ledger + manifest; pilot hosted Wan 2.2 (fal standard/Turbo) and Wan 3.0 on the same set | cap about $15 per video standard, $4 Turbo; needs approval per run | Know if Wan 2.2 beats local LTX on the set |
| 2 | Pinned Docker worker (ComfyUI native I2V/FLF2V or diffusers) with LightX2V 4-step FP8, on 80-96 GB serverless; A/B MiniMax H3 and LTX-2.5 | about $50/month trigger; target under $2.50 per video | Distilled matches 40-step in blind scoring; measured cost under target |
| 3 | H200/B200 or multi-GPU only for a named need (BF16 no offload, longer clips, resident multi-model, latency) | per need | Benchmark ourselves; no published H200 Wan numbers |

## Scoring (Phase 0)
Per shot, 0-3 each: finger/hand integrity, object permanence through the action, liquid plausibility, texture fidelity, prompt adherence. Blind: reviewer sees shot ids only. Record model, seed, prompt, time, cost in a manifest next to each MP4.

## Rules
Never expose ComfyUI publicly; no ComfyUI-Manager in the image; pin custom nodes by commit; keys in Keychain or gitignored `.env`; controller-side budget ledger (provider caps are weak); no paid call without per-run approval.

## Open decisions
1. Provider and monthly cap for Phase 1 (fal vs Alibaba vs both).
2. Meaning of ">128" (VRAM per GPU vs GPU count).
3. Whether to evaluate MiniMax H3 (read full licence, GPU region, branding clause).
