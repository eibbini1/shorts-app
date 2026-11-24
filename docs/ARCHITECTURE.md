# Architecture (verified by reading files, 2026-11-14)
1. TypeScript platform `src/`: VideoPipelineService -> VideoRenderer (zoompan/xfade/grade, src/media/video/cinematic.ts, 1080x1920@30), SQLite (node:sqlite), YouTube publish, QualityGateService.
2. Mac local film path `scripts/`: director-local.sh -> story (Gemma/Qwen) -> gates -> FLUX.2 Klein stills (MFLUX) -> Qwen3-VL review -> LTX-2.3 MLX motion (720x1280, 97 frames, 24 fps) -> Kokoro TTS (ElevenLabs optional, paid) -> Foley -> captions (finish-local-video.py) -> qa-local-video.py -> score-local-video.py (90/100 gate).
3. mini-chef-studio: Remotion + React Three Fiber, 70-line procedural chef (prototype).
4. Legacy: create_video.py, PowerShell worker, Flow/Playwright.
Known gaps: no cross-shot identity/prop locking; captions split mid-phrase; resolution is 720p native.

## Finishing editors (added 2026-11-16)
`scripts/make-local-video.sh --editor ffmpeg|artcraft|filmcraft|auto` (default `ffmpeg`). `artcraft` = `render-any-local.py --prep-stills` (PhotoCraft) + `scripts/artcraft-finish.py` (SoundCraft master, caption/title overlays, FilmCraft 1080x1920 export). CLIs live outside Git in `storage/tools/artcraft/`. `filmcraft` = Codex's single-clip `scripts/filmcraft-finish.py`.

## Studio web app (added 2026-11-17, IMPLEMENTED, partly verified)
- `scripts/studio-server.mjs`: dependency-free Node server on 127.0.0.1:8787. Spawns `scripts/make-local-video.sh` (kinds: draft, stills, render), streams state over SSE, serves media with Range support from allowlisted roots, persists chats in `storage/studio-sessions/*.json`.
- Endpoints: POST /api/draft, /api/stills, /api/regen (bumps a per-shot seed in `storage/any-local/<scenario>/refs/seed-bumps.json`), /api/render, /api/cancel, /api/feedback, /api/sessions(/rename|/delete); GET /api/state, /api/events, /api/sessions, /api/live-files (stills and clips made so far), /api/videos, /api/learning, /media.
- UI: Vite + React in `studio/` (`studio/src/App.jsx`, `studio/src/extras.jsx`). Features: chat history by day, Look cards (Food, Cartoon, Night cartoon, Custom) with example ideas, idea helper, themes (Studio, Night navy+cream, White navy+white), First frames review with Regenerate, Behind-the-scenes panel, render timer, player with loop/speed/frame step, side-by-side and blind compare, rating box.
- Pipeline changes: `render-any-local.py --stills-only` (stills + vision check, no motion) and `seed-bumps.json`; `make-local-video.sh --stills-only`; non-food looks skip the food prompt score via `SHORTS_MIN_PROMPT_SCORE=0` (set by the server); `audit-local-story.py` ACTION verb list widened for non-food actions.
- Known food-only gates still applying to other looks: the ASMR sound-cue list in `add-sfx.py` (paw pats, chime, room tone only) and the prompt score. Time model: clips = sum(ceil(seconds/5)); estimate = 10 s + clips x 274 s + 70 s (range 240-315 s per clip).

## Sound, end stills and still lessons (added 2026-11-24)
- `scripts/add-sfx.py`: per-shot Foley, plus optional `audioPlan.accents` (impact, riser-impact, stinger, swell, breath, recorded), shot `hit` offsets and a licensed `music` bed with a drop aligned to a film time; mix is ducked under narration and loudness-normalised.
- `scripts/render-any-local.py`: a shot may set `endStill` or `endImagePrompt`; the final LTX part is anchored to it (`--image PATH 96 1.0`).
- `scripts/still_lessons.py`: vision-gate rejections and passing prompts append to `storage/learning/*.jsonl`; `prompt-lint.py` prints them per shot type.

