# AbdulImageProvider — Integration Guide

## What it does

`AbdulImageProvider` is a drop-in `ImageProvider` for the `VideoPipelineService` that generates
**Abdul Across America** animated stills instead of downloading Pexels stock footage.

Every image is generated with the **Abdul Style Bible** baked into the prompt, so Abdul looks
identical across every scene, every episode — same white kufi, same colorful hoodie, same
chubby Pixar face — without you having to re-specify the character on every prompt.

The ScenePlan's `objective`, `mustShow`, and `avoid` fields flow directly into the prompt,
so the LLM's scene-planning work (already running in your pipeline) controls what Imagen3
actually generates.

---

## Two generation paths

| Path | Set via | Cost | Speed | Notes |
|---|---|---|---|---|
| `browser` (default) | `ABDUL_PROVIDER=browser` | **Free** (Nano Banana 2.1) | 15–30s/image | Requires a Playwright browser signed into the Flow account |
| `api` | `ABDUL_PROVIDER=api` | Paid (Imagen3 credits) | ~10s/image | Requires a Google Cloud API key with Imagen3 enabled |

The browser path is recommended: Nano Banana 2.1 in Google Flow is completely free, images
auto-save to the project gallery for your records, and it's the same model already proven
for Chicago Ep1.

---

## .env additions

```bash
# Which provider path to use
ABDUL_PROVIDER=browser          # or api

# Google Flow project ID (browser path)
FLOW_PROJECT_ID=e29453e7-d786-4fe0-9f75-57a3076f5b91

# If you have a running Playwright WS endpoint (e.g. your general browser bot):
PLAYWRIGHT_WS_ENDPOINT=ws://localhost:3000

# Playwright user-data dir (where Chrome cookies/sign-in live)
# Default: ~/.config/google-chrome
PLAYWRIGHT_USER_DATA_DIR=/path/to/your/chrome-profile

# Imagen3 REST API key (api path only)
IMAGEN3_API_KEY=your-key-here

# Where to save generated images (defaults to ./storage/visuals/abdul)
ABDUL_OUTPUT_DIR=./storage/visuals/abdul

# Episode label injected into every prompt
ABDUL_EPISODE=Chicago Ep1

# Tell the pipeline to use AbdulImageProvider
IMAGE_PROVIDER=abdul-flow
```

---

## Wiring into VideoPipelineService

In your factory / DI root (e.g. `src/cli/createShort.ts` or wherever you construct
the pipeline):

```typescript
import { AbdulImageProvider } from '../media/images/AbdulImageProvider.js';
import { PexelsVideoProvider } from '../media/images/PexelsVideoProvider.js';

const images =
  process.env.IMAGE_PROVIDER === 'abdul-flow'
    ? new AbdulImageProvider({
        episode: process.env.ABDUL_EPISODE,
        provider: (process.env.ABDUL_PROVIDER as 'browser' | 'api') ?? 'browser',
      })
    : new PexelsVideoProvider(
        process.env.PEXELS_API_KEY!,
        `${storageRoot}/visuals`,
      );

const pipeline = new VideoPipelineService(llm, tts, images, videosRepo, jobsRepo, storageRoot);
```

That's it — the rest of the pipeline (beats, ScenePlanner, VideoRenderer, cinematic grading,
captions, loudnorm) runs unchanged.

---

## How prompt-building works

For each narration beat the `ScenePlanner` produces:

```
beat.text         → "Abdul spots kids flying kites at the lakefront"
plan.objective    → "Abdul (5yo) runs toward three children flying colorful kites at Chicago lakefront."
plan.mustShow     → ["kite", "lakefront", "children playing"]
plan.avoid        → ["cars", "text overlays"]
```

`AbdulImageProvider` wraps these into a Style Bible prompt:

```
STYLE: Pixar/Disney 3D animation, warm cinematic lighting. Abdul: 5-year-old Muslim boy,
white kufi cap, round chubby face, big dark-brown eyes, black curly hair, medium-brown skin,
colorful hoodie + blue jeans + white sneakers. 9:16 vertical portrait composition,
NO text overlaid on image, child-safe, G-rated.
CONTINUITY: Abdul just arrived at Navy Pier and waved to the seagulls.
LOCATION: Chicago — Chicago Ep1.
SCENE: Abdul (5yo) runs toward three children flying colorful kites at Chicago lakefront.
Visible elements: kite, lakefront, children playing.
LESSON: Abdul spots kids flying kites at the lakefront
MOOD: curious
AVOID: cars, text overlays.
```

The CONTINUITY line is automatically updated after each beat so each image connects
naturally to the previous scene without you having to manage state manually.

---

## CONTINUITY chaining

`AbdulImageProvider` keeps a `lastSceneDesc` string that is automatically set to the previous
beat's `objective` after each successful generation. This means images chain naturally:

```
Beat 0: [no continuity — first image]
Beat 1: CONTINUITY: Abdul arrived at Chicago Midway and looked at the planes.
Beat 2: CONTINUITY: Abdul (5yo) runs toward three children flying colorful kites at Chicago lakefront.
…
```

No manual tracking needed.

---

## Connecting your existing Playwright browser bot

If you already have your general-purpose browser bot running (at `/areas/general-browser-bot.md`),
point `PLAYWRIGHT_WS_ENDPOINT` at it and `AbdulImageProvider` will re-use the existing
browser session instead of launching a new one — faster startup, same signed-in cookies,
no duplicate Chrome processes.

---

## Running the tests

```bash
npm run test -- AbdulImageProvider
```

The unit tests cover prompt-building only (offline, no API calls). For a live end-to-end
smoke test with real image generation:

```bash
IMAGE_PROVIDER=abdul-flow ABDUL_EPISODE="Chicago Ep1" npm run render-demo
```
