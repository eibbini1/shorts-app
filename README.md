# Shorts App

A Node + TypeScript toolkit that turns a script and still images into a finished vertical short-form video, then prepares metadata, QA checks, subtitles, thumbnails and an upload schedule. It is channel-agnostic: bring your own scripts, voices and visuals.

## Requirements

- Node 20 or newer
- FFmpeg on PATH
- A text-to-speech API key (ElevenLabs is supported; cached voice lines cost nothing to reuse)
- Optional: a Google OAuth client for `yt-upload`, and an image provider for generated visuals

## Setup

```bash
npm install
cp .env.example .env     # fill in your own values; never commit .env
npm test                 # vitest
```

`.env` is git-ignored, as is generated media (`out/`, `storage/`, video and audio files).

## Main commands

| Command | What it does |
|---|---|
| `npm run pipeline -- --spec episodes/<name>.assemble.json` | Full run: variation guard, assemble, QA, metadata, pack |
| `npm run split-long` | Cut a long video into shorts using a hooks file |
| `npm run meta-gen` | Title, description, tags, pinned comment and a link back to the full video |
| `npm run variation -- --spec ...` | Anti-template guard; exits 1 on a repeated opener, closer or near-duplicate hook |
| `npm run qa-check` | Checks length, silence, black frames and first-frame brightness |
| `npm run plan-schedule` | Suggests publish slots at regional peak times |
| `npm run export-subs` | SRT and VTT subtitles |
| `npm run make-thumbs` | Thumbnails |
| `npm run yt-upload` | API upload (needs OAuth; unaudited apps can only upload as private) |
| `npm run create-abdul` / `assemble-abdul` | Example character-episode generation and assembly |

## Episode spec

`episodes/*.assemble.json` describes scenes, voice lines and overlays. Useful flags:

- `tightOpen`: trims dead air before the first word
- `hookText`: on-screen hook shown from 0 to 2.4 seconds

Hook scoring rewards tension, concrete prices or numbers and an opinion-gap closer, and penalises plain showcases.

## Platform-policy safeguards

- AI-generated voice and visuals are disclosed in the description and the platform's altered-content setting.
- The variation guard avoids templated, mass-produced output (YouTube inauthentic-content policy).
- Verify facts against a primary source before publishing.

## Notes

- On Windows, run commands through `cmd /c` or node scripts; PowerShell mangles nested quotes.
- Two legacy VideoPipelineService suites fail to load (missing `database/connection.js`); they are unrelated to the CLI tools.

See `QUICKSTART.md` for the original quickstart.
