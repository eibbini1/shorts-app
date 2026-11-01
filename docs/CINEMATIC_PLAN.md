# Cinematic Shorts Plan

Goal: make every Short look and sound *produced* (not "stock slideshow + TTS") using the
existing pipeline, FFmpeg and free assets only. Each phase is independently shippable and
verified with `npm run render-demo` before touching live providers.

## Phase 1 — Done in this change (renderer-level, provider-agnostic)

| Area | Before | Now |
|---|---|---|
| Camera | Same linear push-in on every still | Per-scene eased moves (push-in, pull-out, drift L/R), hook punch-in, CTA pull-back, supersampled so slow moves don't jitter (`cinematic.ts`) |
| Video clips | Passed through | Subtle continuous dolly push so static stock still feels intentional |
| Transitions | One `fade` everywhere | Choreographed `xfade`: energetic slide out of the hook, rotating directions mid-body, `fadeblack` breath before the CTA |
| Grade | `eq` + vignette | S-curve (lifted blacks), teal/orange split-tone, highlight bloom, vignette, temporal film grain; optional `.cube` LUT via `GRADE_LUT_PATH` |
| Captions | 96px DejaVu, dead centre | Bundled Poppins Bold, lower-third safe zone (clear of Shorts UI), active-word accent highlight + pulse, emphasis words stay gold |
| Narration | Raw TTS | Rumble cut, de-mud, presence lift, compression |
| Master | `amix` with implicit gain loss | `amix normalize=0`, `loudnorm` to about -14 LUFS, true-peak limit, 48 kHz, `+faststart` |
| Music bed | 4s pad with fades (pulsed audibly) | Seamless 8s looping pad; real licensed tracks still preferred via `MUSIC_LIBRARY_DIR` |
| Tooling | none | `npm run render-demo` renders from any folder of stills/clips + a narration file, offline |

## Phase 2 — Real footage quality (next, highest impact)

1. Run `IMAGE_PROVIDER=pexels-video` as the default; stills only as fallback. Real motion beats any filter.
2. Use the existing Gemini frame check to also reject shaky or text-overlaid clips, and prefer clips that are 2.0-3.5s of usable length.
3. Cut on narration beats: align scene boundaries to sentence ends from `wordTimings` instead of an even 2s grid.
4. Pre-roll hook: first 1.5s uses the single best clip (highest relevance score) at the hook punch-in.

## Phase 3 — Sound design with real assets (free)

Drop free files into the existing library dirs (`MUSIC_LIBRARY_DIR`, `SFX_LIBRARY_DIR`):

- Music: YouTube Audio Library, Pixabay Music, Free Music Archive (check each licence; keep attribution notes in `docs/`).
- SFX: Kenney audio packs (CC0), Freesound CC0 filter. Tags: `whoosh`, `riser`, `ding`, `thud`.
- Add a `sizzle`/`chop` SFX tag for food scenes and trigger it from the visual brief's subject anchors.

## Phase 4 — Look-dev assets (free)

- Free `.cube` LUTs from GitHub (search "free cinematic LUT pack"); set `GRADE_LUT_PATH`. A/B with `render-demo`.
- Light-leak / film-dust overlays (CC0 video loops) blended with `blend=all_mode=screen` at 10-15% on the hook and CTA only.
- Extra caption fonts (Montserrat ExtraBold, Anton, Bebas Neue, all OFL): drop in `assets/fonts/`, set `CAPTION_FONT_NAME`.

## Phase 5 — Retention loops

- Hard CTA/hook echo with regeneration (listed as deferred in `current.md`).
- Seamless audio/visual loop: last frame crossfades into frame 0 and music tail matches the head.
- Use the `analytics_snapshots` table to compare retention per camera/transition/caption preset and keep the winners.

## Optional libraries (only if a phase needs them)

| Library | When | Notes |
|---|---|---|
| `ffmpeg-static` + `ffprobe-static` | Machines without a system FFmpeg | Pin to a build that includes `libass`, `xfade`, `loudnorm` |
| Remotion | Only if you outgrow FFmpeg graphs (animated lower-thirds, data cards) | Check its company licence terms first |
| `gl-transitions` | Exotic GLSL transitions | Needs an FFmpeg build with `gl-transition`; built-in `xfade` covers the useful set |

No new runtime dependency was required for Phase 1: everything uses FFmpeg filters already
available in 6.x (`curves`, `colorbalance`, `xfade`, `zoompan`, `loudnorm`, `ass`).

## Quality bar (check on every look-dev render)

- Hook moves in the first 0.3s; first caption visible by 0.5s.
- No two consecutive scenes share a camera move or transition.
- Captions sit at about 65% of frame height, never over the dish or subject.
- Integrated loudness about -14 LUFS, true peak at or below -1 dBTP.
- Watch it on a phone, muted and unmuted.
