# Roadmap

Updated 2026-11-14. Read [AI_HANDOFF.md](AI_HANDOFF.md) for the active render and review branch. See [the food Short review](FOOD_SHORTS_REVIEW_20261114.md) for sampled hooks and their evidence limits.

For tool choices, see [the local montage assessment](MONTAGE_TOOLS_20261114.md).

| Phase | State | Evidence and next gate |
| --- | --- | --- |
| 0: inventory and baseline | Complete | 16-second Juuni Ban and 30-second hotel hot-dog baselines retained locally. |
| 1: continuity and captions | Verified on a prior 30-second film | Chained references, locked visual descriptors, phrase captions and quieter tails. Sampled review found continuity gains; rich physical action is still limited. |
| 2: chef | 2D composite verified; 3D on-plate prototype | Juuni Ban on-plate placement sampled. The pipeline option now requires an explicit placement check. General per-shot tracking and occlusion remain open. |
| 3: mastering | Technical path verified | 1080 export, measured loudness, dissolves and a common film grade. One-command final export and final-file QA passed on the 30-second hotel hot dog. Listening review remains open. Native 720 motion remains the default. |
| 4: trend intelligence | Implemented; source validation ongoing | Wikipedia and YouTube signals rank together, including YouTube-only topics. A signal is an idea lead, not proof of a trend or rights to reuse footage/music. |
| 5: full local film | In progress | Byakuya and hotel hot dog each have an exact 30-second technically passing final cut. Editorial review remains open. November cinnamon loaf is rendering. |

## Native resolution benchmark

On the 16 GB M1, a 25-frame 1024×1920 MLX LTX output took 657 seconds. A 97-frame clip is estimated near 40 minutes, and six clips near four hours. This was visibly sharper than a Lanczos-upscaled 720p film, but remains opt-in. Compare a same-prompt result and total runtime before replacing FLUX, Gemma, Kokoro or LTX. Cloud generation remains optional and off by default.

## Next practical upgrades

1. Finish the cinnamon film, inspect its final picture/sound and compare its opening to the Byakuya and hot-dog cuts. Require final-file QA plus owner editorial review as the release gate.
2. Integrate duration-preserving speed ramps and music ducking only after a measured test keeps narration and captions in sync.
3. Improve action variety and reference consistency shot by shot. A new video model should first win a same-prompt benchmark on this Mac.
4. Compare the automatic 10-second ASMR prototype against a voiced treatment. Keep captions off when there is no voice, and score a visible opening rather than a spoken hook.

## Faster runs without weaker gates

The render now prepares Kokoro narration and the original soundtrack concurrently; both finish and the silence gate runs **before** the first model clip. `--cache-only` reuses approved stills and clips and fails on a cache miss rather than unexpectedly starting a long model job. This is useful for changing narration and timing while retaining the shot prompts. The dominant cost remains MLX LTX motion generation, which runs one clip at a time on the 16 GB unified-memory Mac. FLUX stills are also sequential when `--chain-images` is used because each still depends on the previous one. Parallel FLUX/LTX jobs may cause memory pressure and retry costs, so the next speed work is measuring per-shot elapsed time and a same-prompt test of fewer frames or faster settings before changing the default. Final-file QA and story checks remain mandatory.

## ArtCraft finishing path (2026-11-16)

- VERIFIED: `--editor artcraft` = PhotoCraft still prep, SoundCraft master, 1080 caption layer, FilmCraft 1080x1920 export. Details and evidence: `docs/ARTCRAFT_LOCAL_INTEGRATION.md`.
- NEXT: (1) owner judges voiced red-curry and the still-prep A/B; (2) SoundCraft voice chain + three-track mix; (3) EffectCraft captions animation and price counter; (4) stub-CLI tests and version pin; (5) make ArtCraft the default only after one voiced and one silent film are approved.
- ArtCraft does not generate footage or shorten FLUX/LTX time.
