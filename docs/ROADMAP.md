# Roadmap
Phase 0 (in progress): inventory, tests, baseline, docs, handover. 
Phase 1 VERIFIED (2026-11-14): shot continuity (locked subject/prop descriptors + reference stills + end-frame chaining), caption phrase boundaries, hero shot + end card, audio tail trim. Gate: new film beats baseline 45/100 with inspected frames.
Phase 2 VERIFIED (2D rig + colour-matched composite; mini-chef-studio/src/Crumb.tsx, scripts/composite-crumb.sh): Crumb 2D rig composited over footage with contact shadow/occlusion.
Phase 3 PARTLY VERIFIED (scripts/master-export.sh = 1080p export only; scripts/bench-ltx-hires.sh benchmark; loudness change awaits owner OK): mastering (loudness, grade LUT, native-res/two-stage upscale benchmark on 16 GB).
Phase 4 PLANNED: trend intelligence (branch feature/trend-feed-templates reviewed, not merged).
Optional: cloud generation, disabled by default, spend-capped.

## Native high-res benchmark (VERIFIED 2026-11-14, M1 16 GB)
`--distilled` is already LTX's two-stage path (half-res + upscale + refine). `--two-stage` needs a dev transformer this pack lacks; `--dfr` is LTX 2.5 only.
25 frames at -H 1920 -W 1080 -> output 1024x1920 (width rounds to 64): 657 s wall, 2.97 GB max RSS (excludes GPU-wired memory). A 97-frame clip would be roughly 40 min, a 6-shot film roughly 4 h vs 29 min now. Visibly sharper detail than lanczos-upscaled 720p. Opt-in only; default pipeline unchanged.
