# Arabic recipe Reel through the local ArtCraft finish

Status: **implementation pilot, not a finished recipe film** (2026-11-16). This work is isolated on `feature/arabic-artcraft-recipe`; Claude's active checkout and GPU render were not changed.

## What is ready

- `examples/recipes/avocado-egg-salad-ar-60.json` defines six contiguous scenes, the same warm kitchen, exact ingredients, Arabic narration, food-action checks, and draft captions. The visual and audio paths are an inventory of assets still needed.
- `scripts/arabic_recipe.py` checks scene duration and resolution, footage and voice streams, the 60-second kitchen sound bed, commercial-use status, and captions synced to the reviewed voice. With complete inputs, it stages six clips and a voice timeline, then calls the existing `artcraft-finish.py`. It blocks an existing output. It does not synthesize a voice, generate footage, or silently use optional music.
- `scripts/arabic_reel_captions.py` creates top-safe, right-to-left 1080×1920 ASS captions with the bundled OFL Cairo font. A 1-second rendered frame was visually checked: Arabic joining, punctuation, and safe placement appeared correct. Draft timing is deliberately rejected for final rendering.
- The FilmCraft exporter can select 30 fps and sizes each portrait source to fit 1080×1920. An existing 10-second two-shot film was re-exported at 1080×1920, 30 fps, 300 frames, 10.005 seconds. Its source motion was 24 fps, so this check proves the export format, not 30-fps motion detail or recipe quality.

## Fastest route to this film

1. Record or license six recipe clips matching the scene times in the JSON and save them at `assets/recipes/avocado-egg-salad-ar/scene-01.mp4` through `scene-06.mp4`. Favor real preparation footage for chopping, pouring, and mixing; do not ask LTX to invent irreversible food actions. Use the same bowl, hands, counter, ingredients and light throughout. Original 1080×1920 30-fps footage avoids upscaling or duplicated frames.
2. Record a natural Jordanian female presenter speaking each line as `voice-01.wav` through `voice-06.wav`. Listen to pronunciation and check the recording/license for commercial use. This Mac has no verified local Jordanian female TTS. The installed Kokoro English voices and macOS male Arabic `say` voice do not meet the requirement.
3. Record or license a 60-second kitchen sound bed, `kitchen-bed-60.wav`, with relevant chopping, bowl, lemon and spoon sounds. The bed and any music must have verified commercial-use rights. This first adapter does not mix a separate music file; it blocks one rather than ignoring it.
4. Review each voice line and adjust `captionCues` to the actual speech. Then set `captionTimingStatus` to `verified-against-recorded-voice`, `voice.approvalStatus` to `verified-by-listening-and-rights-review`, and `soundBed.licenseStatus` to `verified-commercial-use`. These fields record completed reviews; do not flip them before the review.
5. Run `npm run recipe:arabic:check`. It reports all missing or mismatched inputs. When ready, run `npm run recipe:arabic:render -- outputs/avocado-egg-salad-ar-60-artcraft.mp4`. For another recipe, use `python3 scripts/arabic_recipe.py --spec PATH --output NEW_OUTPUT.mp4`.
6. Run final-file technical QA, inspect a contact sheet and all six action transitions, watch the full 60 seconds, and listen to the full mix before release. The current adapter does not yet run those release checks automatically, so a completed export alone is not a ready verdict.

The existing finish uses **PhotoCraft** upstream for optional still preparation, **SoundCraft** for voice processing and mastering, **EffectCraft** for an optional title, and **FilmCraft** for the video timeline and export. This recipe uses real footage where possible, so PhotoCraft need not run. The recipe requests no title, so EffectCraft need not run. FFmpeg remains a low-level utility to build the voice timeline and transparent captions; FilmCraft is the video editor. ArtCraft cannot manufacture realistic chopping footage or a licensed Jordanian voice by itself.

No paid API was used. Windows ArtCraft and Arabic font behavior are untested here; the available Mac FilmCraft CLI is the tested platform.
