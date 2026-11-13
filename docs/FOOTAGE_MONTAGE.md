# Fast footage montage on Mac

This route edits **existing moving footage**. It can finish in minutes because it does not run LTX to invent every frame. A fresh 30-second LTX film still takes longer on the 16 GB M1 Pro; the saved local runs took roughly 19–34 minutes, while a cached rerun took about five minutes. A montage only looks as good as its source clips and their story order.

## Prepare and check first

Put at least three clips in one folder, named in story order: `01-hook.mp4`, `02-goal.mp4`, `03-obstacle.mp4`, `04-solution.mp4`, `05-payoff.mp4`. Use original footage or clips you have permission to edit. Include more than 30 seconds of distinct moving footage if you want soft fades. The preflight checks the files, duration and cut plan before encoding; it refuses to silently repeat or freeze footage.

```sh
cd /Users/eibbini/Documents/shorts-app
npm run montage:footage:mac -- --footage assets/my-footage --seconds 30 --check
npm run montage:footage:mac -- --footage assets/my-footage --seconds 30 \
  --title 'The First Bite' \
  --story 'A tiny chef prepares a luxurious bite, faces a setback, then shares the finished dish.' \
  --music assets/my-licensed-music.wav --voice assets/my-narration.wav \
  --output outputs/the-first-bite.mp4
```

`--format wide` makes a 1280×720 export; vertical is 720×1280. Music and voice are optional. The export keeps source ambience, uses short crossfades when enough footage exists, otherwise clean cuts, gently grades the picture, shows the title over the opening, ducks ambience and music under narration, and normalizes the audio. A `.montage.json` file records the title, story, cut order, sources, and timing. Read the cut plan before the encode; the script cannot determine whether unrelated clips tell a coherent story.

## Strong prompt for each generated source clip

Use the same character and environment bible in every prompt. Generate a clip for one **physical action**, not a static pose or a camera move alone. Specify a start state, an action with visible change, an end state that can lead into the next clip, one camera move, lighting, lens feel, and a matching sound cue. Keep it one continuous take.

Example for the tiny chef idea:

> Original rounded 3D tiny chef in a cream apron, same copper kitchen and morning light as the other shots. In this 4-second continuous close shot, the chef lifts a glossy spoonful of warm chocolate, hesitates as one drop falls, catches it with the spoon, then smiles and turns toward the waiting plate. Camera tracks the moving spoon from counter height; shallow depth of field, rich edible texture, no cut, no text, no frozen pose. Sound: soft spoon clink, thick chocolate drip, small satisfied breath.

Plan six to twelve clips that move from **hook → goal → obstacle → changed approach → action → payoff**. Give each one a distinct visible event. Keep title, character design, props, and destination consistent; review the first still and first motion clip before generating the rest. A camera pan over an unmoving image is not a moving story shot.

## Research a trend before choosing a topic

```sh
npm run trend:brief:mac -- --region US --niche 'food cooking' --output storage/trends/food-brief.json
```

The brief fetches dated Google Trends RSS signals and shows only keyword matches to the niche. A snapshot older than 24 hours is rejected. A match is **search interest**, not proof of a TikTok or YouTube video trend; check those platforms separately before claiming a trend. If no niche topic matches, the command says so instead of inventing one. Use a matched topic as a research cue, then write an original story and footage prompts.
