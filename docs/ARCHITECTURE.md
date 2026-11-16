# Architecture (verified by reading files, 2026-11-14)
1. TypeScript platform `src/`: VideoPipelineService -> VideoRenderer (zoompan/xfade/grade, src/media/video/cinematic.ts, 1080x1920@30), SQLite (node:sqlite), YouTube publish, QualityGateService.
2. Mac local film path `scripts/`: director-local.sh -> story (Gemma/Qwen) -> gates -> FLUX.2 Klein stills (MFLUX) -> Qwen3-VL review -> LTX-2.3 MLX motion (720x1280, 97 frames, 24 fps) -> Kokoro TTS (ElevenLabs optional, paid) -> Foley -> captions (finish-local-video.py) -> qa-local-video.py -> score-local-video.py (90/100 gate).
3. mini-chef-studio: Remotion + React Three Fiber, 70-line procedural chef (prototype).
4. Legacy: create_video.py, PowerShell worker, Flow/Playwright.
Known gaps: no cross-shot identity/prop locking; captions split mid-phrase; resolution is 720p native.

## Finishing editors (added 2026-11-16)
`scripts/make-local-video.sh --editor ffmpeg|artcraft|filmcraft|auto` (default `ffmpeg`). `artcraft` = `render-any-local.py --prep-stills` (PhotoCraft) + `scripts/artcraft-finish.py` (SoundCraft master, caption/title overlays, FilmCraft 1080x1920 export). CLIs live outside Git in `storage/tools/artcraft/`. `filmcraft` = Codex's single-clip `scripts/filmcraft-finish.py`.
