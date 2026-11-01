# Shorts App (Billionaire Bites / Abdul Across America)

Node + TypeScript toolkit that turns a script and stills into a finished YouTube Short, then prepares metadata, QA, subtitles, thumbnails and an upload schedule. Built for the Billionaire Bites luxury-food channel; the same pipeline drives the Abdul Across America episodes.

## Requirements

- Node 20 or newer
- FFmpeg on PATH
- An ElevenLabs API key for new voice-overs (cached voice lines cost nothing to reuse)
- Optional: Google OAuth client for `yt-upload` (untested), Google Flow access for Abdul image generation

## Setup

```bash
npm install
cp .env.example .env     # then fill in your own values. Never commit .env
npm test                 # vitest
```

`.env` is git-ignored. Generated media (`out/`, `storage/`, videos, audio) is also ignored.

## Main commands

| Command | What it does |
|---|---|
| `npm run pipeline -- --spec episodes/<name>.assemble.json` | Full run: variation guard, assemble, QA, meta, pack |
| `npm run split-long` | Cut a long video into Shorts using a hooks file |
| `npm run meta-gen` | Title, description, tags, pinned comment, "Full story" bridge link |
| `npm run variation -- --spec ...` | Anti-template guard; exits 1 on same opener, closer or near-duplicate hook |
| `npm run qa-check` | Checks length, silence, black frames, frame-0 brightness |
| `npm run plan-schedule` | Regional peak-time slots (India, UK, US) |
| `npm run export-subs` | SRT and VTT subtitles |
| `npm run make-thumbs` | Thumbnails |
| `npm run yt-upload` | API upload (needs OAuth; unaudited apps upload as private only) |
| `npm run create-abdul` / `assemble-abdul` | Abdul episode generation and assembly |

## Episode spec

`episodes/*.assemble.json` describes scenes, voice lines and overlays. Useful flags:

- `tightOpen`: trims dead air before the first word
- `hookText`: on-screen hook shown from t=0 to 2.4 s

Hook scoring (v2) rewards tension, concrete prices and an opinion-gap closer, and penalises plain showcases.

## YouTube rules baked in

- AI-generated voice and visuals are disclosed in the description and the altered-content setting
- The variation guard avoids templated, mass-produced output (YouTube inauthentic-content policy)
- Facts should be checked against a primary source before publishing

## Notes

- Run commands on Windows through `cmd /c` or node scripts; PowerShell mangles nested quotes.
- Two legacy VideoPipelineService suites fail to load (missing `database/connection.js`); they are unrelated to the CLI tools.

See `QUICKSTART.md` for the original Abdul quickstart.
