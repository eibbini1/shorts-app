# ArtCraft integration plan for the local Shorts app

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

## Integration in one terminal command

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
