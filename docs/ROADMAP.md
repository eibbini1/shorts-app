# Roadmap

Updated 2026-11-14. Read [AI_HANDOFF.md](AI_HANDOFF.md) for the active render and review branch.

| Phase | State | Evidence and next gate |
| --- | --- | --- |
| 0: inventory and baseline | Complete | 16-second Juuni Ban and 30-second hotel hot-dog baselines retained locally. |
| 1: continuity and captions | Verified on a prior 30-second film | Chained references, locked visual descriptors, phrase captions and quieter tails. Sampled review found continuity gains; rich physical action is still limited. |
| 2: chef | 2D composite verified; 3D on-plate prototype | Juuni Ban on-plate placement sampled. The pipeline option now requires an explicit placement check. General per-shot tracking and occlusion remain open. |
| 3: mastering | Partly verified | 1080 export, measured loudness, dissolves and a common film grade. Full one-command final export and listening review remain open. Native 720 motion remains the default. |
| 4: trend intelligence | Implemented; source validation ongoing | Wikipedia and YouTube signals rank together, including YouTube-only topics. A signal is an idea lead, not proof of a trend or rights to reuse footage/music. |
| 5: full local film | In progress | Byakuya nine-shot render, exact 30-second final cut, final-file QA, picture/sound and editorial review. Hotel hot dog follows. |

## Native resolution benchmark

On the 16 GB M1, a 25-frame 1024×1920 MLX LTX output took 657 seconds. A 97-frame clip is estimated near 40 minutes, and six clips near four hours. This was visibly sharper than a Lanczos-upscaled 720p film, but remains opt-in. Compare a same-prompt result and total runtime before replacing FLUX, Gemma, Kokoro or LTX. Cloud generation remains optional and off by default.

## Next practical upgrades

1. Complete one edited Byakuya film and use its final-file QA plus human picture/sound review as the release gate.
2. Integrate duration-preserving speed ramps and music ducking only after a measured test keeps narration and captions in sync.
3. Improve action variety and reference consistency shot by shot. A new video model should first win a same-prompt benchmark on this Mac.
