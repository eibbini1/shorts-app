# AI Project Context (shared by Claude and ChatGPT)
Goal: grow shorts-app into a cinematic AI video studio for the "Billionaire Bites" luxury-food channel (benchmark film: "The Chocolate Heist", original 2D-rigged chef "Crumb" over realistic food footage; 3D upgrade path kept).
Rules: see Project Instructions. Status labels: VERIFIED / IMPLEMENTED BUT UNTESTED / PLANNED / BLOCKED.
Decisions (user, 2026-11-14): Crumb = 2D rig first; cloud generation optional, OFF by default, needs explicit approval + per-film spend cap; priority = shot continuity > visual quality > animation > mastering; trend intelligence stays in roadmap, must not delay the benchmark; no push/merge/delete without approval, except one PR once tests pass and a new film beats the baseline.
STANDING DIRECTION (user, 2026-11-22; every assistant follows this):
- Goal of all app work = realism and doing exactly the user's idea, so the result matches what a human expects to see.
- Every feature must run on the CURRENT Mac (Apple M1, 16 GB) now; a faster device later adds SPEED only, with no rebuild. Slow quality options (more seeds, larger stills, full-step model) stay opt-in and simply get faster later.
- Motion model stays local LTX 2.3 q4 (blind test 2026-11-21: no case to switch or rent a GPU). Start motion from a real FLUX still, never text-only. Avoid or split hand-tool contact actions (flip, toss, cut).
- Hardware later: Mac Studio is the no-rebuild upgrade; an NVIDIA box only if GPU prices fall or CUDA-only models become necessary. Not before the app's quality work shows rendering time is the real limit.
- Details and evidence: docs/AI_HANDOFF.md (2026-11-22 entry) and docs/research/2026-11-realistic-motion-food-shorts.md.
Hardware: Apple M1, 16 GB. Local models in storage/models (FLUX.2 Klein 4B q4, Gemma text, LTX-2.3 MLX q4 with --low-ram).
Existing docs not duplicated here: LOCAL_DIRECTOR.md, LOCAL_PIPELINE.md, QUALITY_RELEASE_GATE.md, MOTION_SHOT_RECIPE.md, CINEMATIC_PLAN.md.
Licences: Remotion free for individuals/teams<=3; FLUX.2 klein 4B Apache-2.0; LTX-2.3 licence text must be read at source before commercial reliance (sources conflict). Seedance/cloud prices unverified.
Baseline: storage/baselines/hotel-hot-dog-20261114/ (sha256 in SHA256SUMS, FINDINGS.md). Score 45/100.

- 2026-11-16: Owner wants the four installed ArtCraft tools (PhotoCraft, FilmCraft, EffectCraft, SoundCraft) used for finishing, plus better voices and the existing Lora gold-word captions. A full 10-second `--editor artcraft` run passed final-file technical QA; `auto` now selects it on a Mac with matching CLIs, with `--editor ffmpeg` as an explicit fallback. See `docs/ARTCRAFT_LOCAL_INTEGRATION.md`. Generation (FLUX/LTX) is unchanged.

- 2026-11-17 Studio (local web app, `npm run studio`, http://127.0.0.1:8787): owner wants a ChatGPT-like page for prompt -> plan -> first frames -> render -> video, with no wasted time. Decisions: non-food looks (Cartoon, Night cartoon, Custom) must not inherit the food-kitchen defaults; pictures are checked before motion; the Studio keeps a learning log (storage/studio-learning/runs.jsonl) that feeds the time estimate. It does NOT retrain models. Timing facts (M1 16 GB, plugged in, measured): about 4.5 min per 5 s clip, still about 25 s, finishing about 65 s; fox 10 s video took 10:17.

- 2026-11-24: Sound: accents, hit points, music bed, recorded crunch (add-sfx.py) and end stills (render-any-local.py) are implemented; licensed music candidates are in `assets/music/` (YouTube Audio Library, see SOURCES.md). The vision gate logs rejections and recipes to `storage/learning/`. Owner wants a free, trend-shaped sound for food ads, shipped as a music preview and a Foley-only export; "trending" means matched by shape, never copied.

