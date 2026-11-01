# Make a luxury food Short with your app (step by step)

Result: a 30-40 second vertical video with cinematic stills, a deep narrator,
gold word-by-word captions, original music and an end card.
Example episodes already in the app: `saffron-ep1`, `hottest-ep1`.

## One-time setup (already done on this PC)
- ffmpeg installed (`winget install Gyan.FFmpeg`)
- `npm install` run in the app folder
- `.env` contains `ELEVENLABS_API_KEY=...` (never share this key or paste it in chats)

## Step 1. Open the app in cmd
```
cd C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app
```

## Step 2. Pick a topic and check the facts
- One idea per video, e.g. "the world's most expensive spice".
- Verify every claim on a reliable site before writing it. Skip exact prices.
- Write 6 short lines, about 75-90 words in total (about 30-35 seconds):
  1. Hook (a surprising claim, 8-10 words)
  2-5. One fact or place each
  6. Closing line and a follow request

## Step 3. Make 6 portrait pictures in Google Flow (free)
- Go to flow.google.com, create a new project, use IMAGE generation only (0 credits).
- Ask for 9:16 portrait, photoreal, dark moody luxury food photography, no text, no faces.
- Save them here, named exactly `scene1.jpg` ... `scene6.jpg`:
  `storage\episodes\<your-episode>\stills\`

## Step 4. Create the episode file
Copy an existing one and edit it:
```
copy episodes\saffron-ep1.assemble.json episodes\myfood-ep1.assemble.json
notepad episodes\myfood-ep1.assemble.json
```
Change: `output`, `kicker`, each scene's `image` path and `text`.
The 6 `text` lines are what the narrator says and what the captions show.

## Step 5. Generate the voice (uses ElevenLabs credits, once)
```
npx tsx src/cli/voiceOnly.ts episodes\myfood-ep1.assemble.json
```
Voices are cached. Re-running does not spend credits again unless you change a line.
Free plan is roughly 10,000 characters a month; one video uses about 450.

## Step 6. Build the video
```
npm run assemble-abdul -- --spec episodes\myfood-ep1.assemble.json
```
Output: `storage\episodes\myfood-ep1\myfood-ep1-final.mp4` (takes 1-2 minutes).

## Step 7. Watch and fix
- Wrong word? Edit that line's `text`, run Step 5 and Step 6 again.
- Captions or end card overlapping the picture? Tell Claude, or adjust positions in
  `src/media/assemble/stillsEpisode.ts`.

## Step 8. Upload (do this yourself or ask Claude)
- YouTube Studio > Create > Upload.
- Keep the AI-generated content label ON.
- "Made for kids": choose **No** for adult food videos.
- Title: short and curious. Description: one line, the facts, and "Follow for more".
- Check the video plays before publishing.

## Troubleshooting
- `ffmpeg not found`: close cmd and open a new one (PATH refreshes).
- `ELEVENLABS_API_KEY is not set`: add it to `.env`, save, rerun.
- `Cannot find module`: run `npm install`.
- A scene looks wrong: regenerate only that still in Flow and rerun Step 6.
