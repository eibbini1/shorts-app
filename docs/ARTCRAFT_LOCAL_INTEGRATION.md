# ArtCraft integration plan for the local Shorts app

## Current example: five-shot garlic bread film (2026-11-16)

The local example `outputs/shallot-garlic-bread-20-v6-artcraft.mp4` uses a PhotoCraft-prepped still for **one** of five LTX-generated motion shots, recorded Foley mixed through SoundCraft, a three-second EffectCraft title, and a FilmCraft shot timeline/export. The final file is 1080×1920, 480 frames, 20.01 seconds, and passed all six final-file technical checks (−15.52 LUFS, −1.79 dBTP). The ArtCraft finishing pass reported 14.6 seconds, excluding original still and motion generation. The source motion was generated below 1080; the export is an upscale. Frame review found recipe continuity weaknesses, including whole garlic in the pan where the scenario calls for shallots, so this is a technical demonstration and **not release approved**. No assistant has listened to the full audio.

To make a new film from a reviewed scenario, run `npm run video:local -- --scenario path/to/film.local-scenario.json --editor artcraft --title 'Optional Film Title'`. Omit `--title` if the picture should open without text. The command checks the local ArtCraft CLI versions and story gates before rendering, prepares each new still with PhotoCraft, generates motion with local models, then finishes and checks the exact final export. The optional title is limited to 48 characters and requires ArtCraft. A complete cold run with this new title argument is still to be verified; the title stage and full finishing path were exercised on the five-shot example separately. The [pilot report](reports/artcraft-pipeline-pilot-2026-11-16.docx) records the comparison and limitations.

Status on 2026-11-16: the user installed the ArtCraft Launcher and four desktop apps. The installed app bundles report PhotoCraft 0.23.1, FilmCraft 0.20.1, EffectCraft 0.24.1 and SoundCraft 0.20.1. The launcher marks all four up to date. The separate macOS headless CLIs are **not on PATH or installed in /Applications**. A checksum-verified FilmCraft 0.20.1 CLI was unpacked temporarily and a flattened-film export pilot succeeded (results below). This is **not yet** the shot-level pipeline integration. The working local FLUX.2 Klein, Gemma/Ollama, MLX LTX, Kokoro and FFmpeg path remains the production baseline. Check availability with `npm run artcraft:check:mac`.

## Which ArtCraft tools fit

| Tool | Proposed job in Shorts app | Cost and integration boundary |
| --- | --- | --- |
| **FilmCraft** | Headless timeline assembly; real transitions, per-shot color grade, audio tracks and ducking, captions, H.264/ProRes export; native project for human refinement | Free open-source desktop editor and separate macOS `filmcraft-cli`. It is alpha. Run a controlled Mac benchmark before making it a default. |
| **PhotoCraft** | Review and retouch FLUX stills, make masked corrections to food/utensils, and export a consistent color reference or layered title card | Desktop app is installed. A separate `photocraft-cli` is needed for unattended batch edits; visual edits still need approval from frame review. |
| **EffectCraft** | Optional branded hooks, animated ingredient labels, 2D/3D graphic overlays and chef/avatar composites | Free open-source compositor with a separate macOS CLI. Use only for overlays that clarify the story. Benchmark transparent export and frame timing. |
| **SoundCraft** | Optional multitrack sound edit of real cooking recordings, voice, licensed music and foley; save an editable mix session | Desktop app is installed. Verify the matching `soundcraft-cli` bounce and actual audio before making it an automated stage. It does not synthesize authentic kitchen recordings. |
| **AniCraft** | Later optional stylized character and storybook animation | Not among the four installed apps; keep it outside the first benchmark. |
| **ArtCraft Studio** | Optional interactive scene layout, reference images, posing and 3D staging | Open-source app, but hosted model generations use credits. Local FLUX/LTX integration is not established for this app, so do not route the zero-cost default through its hosted generation API. |

Primary references: [FilmCraft product](https://getartcraft.com/apps/filmcraft), [FilmCraft agent/CLI guide](https://github.com/storytold/filmcraft/blob/main/docs/agents.md), [PhotoCraft CLI guide](https://github.com/storytold/photocraft/blob/main/book/src/automation/cli.md), [EffectCraft product](https://www.getartcraft.com/apps/effectcraft), [SoundCraft CLI guide](https://github.com/storytold/soundcraft/blob/main/docs/cli.md), [ArtCraft Studio repository](https://github.com/storytold/artcraft), [ArtCraft pricing](https://getartcraft.com/pricing).

## Current local editor selection (2026-11-16)

`npm run video:local -- --scenario examples/local-scenarios/first-cold-night-10.local-scenario.json` selects the local ArtCraft path on a Mac with all four matching CLIs in `storage/tools/artcraft`; `--editor ffmpeg` remains an explicit fallback. `--editor artcraft` requires the ArtCraft path. The app and CLI versions are checked **before** FLUX or LTX work; a missing or mismatched CLI stops the job. Hosted ArtCraft Studio generation is not called.

One actual 10-second, two-shot run through the single ArtCraft command completed in 9m13s: PhotoCraft prepared the two stills, local LTX generated both moving clips, SoundCraft mastered the Foley mix, and FilmCraft exported a 1080×1920 H.264/AAC video in an editable project. The final file passed six technical QA checks (10.01s, −15.54 LUFS, −3.41 dB true peak). This older smoke scenario has no `audioPlan` with field-recording sources, so its sound realism is unproven; it also lacks a creative variety signature and its full audio has not been heard. The release gate blocks it. The 1080 output is an upscale of lower-resolution generated motion; it is not new optical detail.

The voiced red-curry pilot separately exercised SoundCraft's narration chain (gate, EQ, de-esser, compressor, light saturation), the 1080 caption layer, and FilmCraft export. It passed six technical checks (30.02s, −16.94 LUFS, −1.36 dB true peak). The captions were moved to the top after sampled bottom captions covered the dish; sampled frames of the new 1080 export keep text off the food. A full listen and full-frame editorial review remain required. EffectCraft's optional title was tested on the shallot film, but it is not added to a Short that does not ask for a title.

## Integration in one terminal command

The staged design below is historical; the verified current behavior is recorded above.

`npm run video:local` stays the only creator entry point. Its existing brief, local story draft, preflight, still generation, LTX motion, Kokoro voice and sound provenance remain in place. Add optional editor and sound backends only after their baseline tests. The installed GUI apps can already be used for manual review; they do not by themselves make the terminal pipeline automatic. For macOS, the FilmCraft release ships its CLI as a separate zip, and the desktop `.app` contains only the GUI.

### First integration: FilmCraft editor

Add an optional `--editor filmcraft` after the baseline test:

1. Export a deterministic edit decision list from the scenario and clip manifest: shot file, source in/out, start frame, duration, transition, voice, music, field recordings, captions and attribution. The file must use frame counts, not rounded seconds.
2. Create a FilmCraft project through the matching-version headless CLI. Import the exact generated clips and audio; place them on separate tracks. Save the `.fcproj` and export an MP4. Never edit the same project in headless and GUI sessions simultaneously.
3. Apply one consistent color look, only motivated dissolves/wipes, restrained motion graphics and music ducking. Keep an editable project beside the MP4 so the owner can refine it in FilmCraft.
4. Run the **same final-file** QA and SHA-bound editorial release gate on the FilmCraft export. A failed export, missing media, changed duration, unsupported transition, caption timing error or new silence blocks release. Retain the FFmpeg baseline file for comparison and fallback.

The FilmCraft CLI can inspect the project/sequence, import media, run commands, render frames and export without an assistant. Its own scopes and audio meters improve technical review; they cannot judge whether a dumpling becomes a meatball, a hand morphs, a recipe step is missing, or the story feels complete. The existing visual/story review and a full human listen still matter.

### Second integration: image, effects and sound

1. Use PhotoCraft on **selected** FLUX stills that fail a visible hand, ingredient or continuity check. Keep originals and save the corrected layered source and export; rerender only affected LTX clips. Do not add a blanket retouch pass that changes every good frame.
2. Use EffectCraft for a short hook title, ingredient identifiers and one motivated reveal overlay, exported with alpha. Check that every graphic stays inside the 9:16 safe area, remains readable on a phone, and does not cover the food action. Integrate those overlays into the FilmCraft timeline after frame timing is stable.
3. Use SoundCraft to mix provenance-checked real kitchen audio with Kokoro narration and licensed music when the story needs them. Save stems and a session file. Measure the bounced mix and check it by listening; add an FFmpeg fallback if a CLI bounce fails. ASMR recipes may omit voice and music when their recordings carry the story.
4. All three stages must be optional, cacheable and disabled when their matching CLI is absent. The terminal command should report a clear missing-tool action before rendering, never silently substitute a different output.

## Acceptance benchmark before switching defaults

Use the verified 30-second red-curry dumpling review copy and its eight cached motion clips as the first comparison. Keep model prompts, clip files and audio identical between editors. Record:

- CLI download size and Mac compatibility; exact versions and checksums matching the installed GUI apps;
- export time, peak memory, output resolution, frame count and exact 30.0-second duration;
- visible transition frames, color matching and food texture in every shot;
- voice/music/foley timing, loudness, true peak and caption sync;
- whether a project reopens with all media linked and the export is reproducible;
- final-file QA, contact sheet, full watch and full listen.

Only promote FilmCraft to the default if the sample is at least as reliable and visibly better than FFmpeg on this Mac. Otherwise keep it optional and file the failing case. Then test PhotoCraft, EffectCraft and SoundCraft separately. No model update or hosted-credit spend is required for this benchmark.

## Pilot result (2026-11-16)

**Verified:** official `filmcraft-cli-0.20.1-macos-universal.zip` SHA-256 `1651d9defb54f853cbd69016428bb9f72a7bf26d56e4755b8e2a79535fd0ac82` matched the release checksums; `filmcraft-cli --version` returned 0.20.1. The CLI probed the baseline 720×1280, 24 fps, 30.000 s H.264/AAC film. It created a 720×1280, 24 fps project, imported that whole film as one timeline clip, applied a subtle contrast value of 6, rendered a review frame and exported 720 frames in 10.6 s with no offline media. The FilmCraft output is 30.016 s and 76.1 MB; the source is 30.000 s and 7.7 MB. With the original voice timeline supplied, final-file QA passed black/frozen frames, loudness (-16.12 LUFS, -1.24 dB true peak), silence, length tolerance and early voice. Contact-sheet inspection showed the same recipe sequence and warm lighting.

**Not yet verified:** FilmCraft has not assembled the eight separate motion clips, transitions, captions or sound stems. The exported pilot is a lightly graded copy of the finished film, so it does not prove better motion, realism, continuity, montage or audio quality. No one has listened to the full FilmCraft output. The existing dumpling geometry still varies between shots. The 16 ms audio/container tail and roughly 10× larger file need export-setting tests before a default switch. PhotoCraft, EffectCraft and SoundCraft have not been CLI-tested. The downloaded CLI and pilot files currently live under `/private/tmp/shorts-artcraft-tools`, outside Git.

**Next:** create a deterministic shot-level FilmCraft project from the eight clip manifest, reproduce exactly 30 s with the original voice/music/foley stems, then test one motivated dissolve and one matched color pass. Export and QA the exact final file; inspect every cut and listen to the whole mix. Only then wire `--editor filmcraft` into the creator command. The installed GUI apps remain available for manual work meanwhile.

## Working ArtCraft finish path (Claude, 2026-11-16, owner-approved direction)

Owner compared FFmpeg 720p (A), a FilmCraft dissolve edit (B) and the ArtCraft 1080 finish (C) on shallot v4 and chose C. Default editor is still `ffmpeg`; ArtCraft is opt-in until one voiced and one silent film are owner-approved.

One command: `bash scripts/make-local-video.sh --scenario X.local-scenario.json --editor artcraft`
- adds `--prep-stills` to the render (PhotoCraft), then after sound and captions runs `scripts/artcraft-finish.py`.

| Stage | Tool | What runs | Status |
|---|---|---|---|
| Still prep | PhotoCraft | `image.autoContrast` + `filter.sharpen.unsharpMask` on each still before LTX (`render-any-local.py --prep-stills`) | VERIFIED on one shot: blurdetect mean 8.57 -> 7.82 (lower is sharper); owner has not judged it. `image.autoTone` REJECTED: it removes the warm cast |
| Sound | SoundCraft | Finished mix through clip gain + Compressor/Limiter, gain searched to -16 LUFS / <= -1 dBTP, bounced | VERIFIED: -16.5 LUFS (silent film), -16.2 LUFS (voiced) |
| Captions | pipeline `.ass` + FFmpeg + FilmCraft | The same Lora gold-word captions drawn at 1080x1920 on a transparent ProRes 4444 layer, placed on V2 | VERIFIED on red curry 30 s |
| Title | EffectCraft | Optional `--title`, AE-style `script.run` text layer, ProRes 4444 alpha | VERIFIED; font falls back to sans (Lora not picked up); off unless asked |
| Edit/export | FilmCraft | 1080x1920 sequence, shots scaled 150 %, unsharp 30, hard cuts, overlays, export | VERIFIED: final-file QA 6/6 on both films; 16 s (20 s film), 33 s (30 s film) |

Findings to keep: cross dissolves between different scenes ghost and look worse than hard cuts; the raw `.sfx.wav` is about -33 LUFS and must be mastered; a lavfi `color` source needs `format=rgba` inside the source graph or the caption layer is opaque black; 1080 here is an upscale of 384x640-native footage.

PLANNED, not built: voice chain in SoundCraft (expander_gate, eq_7band, de_esser, compressor, saturator are installed) with separate voice/effects/music tracks; EffectCraft animated captions and Level up price counter; Lora in EffectCraft; unit test with stubbed CLIs; pin CLI versions. SoundCraft ids (clip 3, track 2) are assumed for a fresh one-file session.
