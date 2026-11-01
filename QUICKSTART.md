# Abdul Across America — Quick Start

## First-time setup (one time)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's Chromium (browser generation path)
npx playwright install chromium

# 3. Copy environment config
cp .env.example .env
# Edit .env — at minimum set FLOW_PROJECT_ID (already filled in)
# Make sure your Google account is signed in to flow.google.com in Chrome
```

## Generate Chicago Episode 1

```bash
# Dry run first — see the full episode plan without generating any images
npm run create-abdul -- --episode episodes/chicago-ep1.json --dry-run

# Full run — generates all images + renders the complete video
npm run create-abdul -- --episode episodes/chicago-ep1.json

# With your own narration audio (best quality)
npm run create-abdul -- \
  --episode episodes/chicago-ep1.json \
  --audio path/to/narration.wav
```

Output: `./storage/episodes/chicago-ep1/chicago-ep1.mp4`

## Upload to YouTube

```bash
npm run upload-video -- --file ./storage/episodes/chicago-ep1/chicago-ep1.mp4
```

## Add a new episode

1. Copy `episodes/chicago-ep1.json` to `episodes/newyork-ep2.json`
2. Fill in title, location, lesson, narration, and 6 beats
3. Run: `npm run create-abdul -- --episode episodes/newyork-ep2.json`

See `episodes/README.md` for the full Season 1 roadmap.

## How it works

```
episodes/chicago-ep1.json          ← your episode script + visual storyboard
        ↓
createAbdulEpisode.ts              ← CLI: reads episode, orchestrates everything
        ↓
buildBeats()                       ← splits narration into phrase-aligned beats
        ↓
AbdulImageProvider                 ← builds Style Bible prompts → Google Flow
        ↓  (one image per beat, CONTINUITY auto-chained)
VideoRenderer + cinematic.ts       ← camera moves, xfades, color grade
        ↓
SubtitleBuilder                    ← word-level Poppins captions, lower-third safe zone
        ↓
SoundDesignService                 ← mood-matched music + SFX cues
        ↓
chicago-ep1.mp4                    ← ready to upload ✅
```

## Style Bible (locked in every prompt)

Every image Abdul appears in uses this character spec — you never need to repeat it:

> Pixar/Disney 3D animation, warm cinematic lighting.
> Abdul: 5-year-old Muslim boy, white kufi cap, round chubby face, big dark-brown eyes,
> black curly hair, medium-brown skin, colorful hoodie + blue jeans + white sneakers.
> 9:16 vertical portrait composition, NO text overlaid on image, child-safe, G-rated.

## If you have your Playwright browser bot running

Set in `.env`:
```
PLAYWRIGHT_WS_ENDPOINT=ws://localhost:3000
```
AbdulImageProvider will reuse the existing session — no new Chrome, same sign-in, faster startup.
