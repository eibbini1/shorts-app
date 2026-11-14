# AI Project Context (shared by Claude and ChatGPT)
Goal: grow shorts-app into a cinematic AI video studio for the "Billionaire Bites" luxury-food channel (benchmark film: "The Chocolate Heist", original 2D-rigged chef "Crumb" over realistic food footage; 3D upgrade path kept).
Rules: see Project Instructions. Status labels: VERIFIED / IMPLEMENTED BUT UNTESTED / PLANNED / BLOCKED.
Decisions (user, 2026-11-14): Crumb = 2D rig first; cloud generation optional, OFF by default, needs explicit approval + per-film spend cap; priority = shot continuity > visual quality > animation > mastering; trend intelligence stays in roadmap, must not delay the benchmark; no push/merge/delete without approval, except one PR once tests pass and a new film beats the baseline.
Hardware: Apple M1, 16 GB. Local models in storage/models (FLUX.2 Klein 4B q4, Gemma text, LTX-2.3 MLX q4 with --low-ram).
Existing docs not duplicated here: LOCAL_DIRECTOR.md, LOCAL_PIPELINE.md, QUALITY_RELEASE_GATE.md, MOTION_SHOT_RECIPE.md, CINEMATIC_PLAN.md.
Licences: Remotion free for individuals/teams<=3; FLUX.2 klein 4B Apache-2.0; LTX-2.3 licence text must be read at source before commercial reliance (sources conflict). Seedance/cloud prices unverified.
Baseline: storage/baselines/hotel-hot-dog-20261114/ (sha256 in SHA256SUMS, FINDINGS.md). Score 45/100.
