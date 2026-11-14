# Local video director

Run `npm run direct:mac` in the project folder. The guide asks for a subject, visible ending, style, runtime, and orientation. Choose **AI** to draft an original six-beat story with local Gemma or Ollama, review each physical action, then render FLUX images, LTX motion, Kokoro narration, sound effects, captions, and a quality report. Choose **montage** to edit original moving clips you already have; this is much faster because it skips image and motion generation.

The AI path always saves a scenario first. A strict story gate checks timing, hook, title, subject, visible action, prompt repetition, and requested ending, then estimates the remaining LTX minutes. The guided path generates a six-image FLUX storyboard before motion; check the same subject and location, chronological actions, and final payoff. If cooking is already plated before the plating beat, revise the prompts and regenerate the storyboard. It allows narration gaps for ASMR and fills them with the shot's sound design. For a saved scenario, run `npm run direct:mac -- --mode ai --scenario drafts/generated/NAME.local-scenario.json --check-only` to validate without rendering. Then omit `--check-only` to generate stills, review them, and render.

The guided path now uses FLUX.2 Klein's image editing to carry the previous approved frame into the next shot. Both the storyboard and final render use the same `--chain-images` setting, so their image cache and continuity match. A local Qwen3-VL review flags visible changes in food shape, location, and chronology before LTX starts. It is advisory: inspect the contact sheet yourself. If an edit preserves too much of the prior cooking stage, revise that shot's `imagePrompt` and regenerate. Direct `make-local-video.sh` still accepts `--chain-images` explicitly. The power and Metal checks run before storyboard generation, so a low battery or inaccessible GPU stops early.

For this 16 GB Mac, keep the installed quantized FLUX.2 Klein 4B as the default until an alternative wins a same-prompt, same-size benchmark on this machine. MFLUX also supports Z-Image, Qwen Image, and newer FLUX models, but a larger download or model name alone does not establish better speed, continuity, or prompt accuracy. ComfyUI remains available for targeted inpainting and custom workflows after a contact-sheet review. A supplied folder of your own stills remains the fastest image path: `bash scripts/make-local-video.sh --scenario drafts/generated/NAME.local-scenario.json --stills /absolute/path/to/stills`.

For source research, `npm run research:popular:mac -- --query 'luxury food shorts' --min-views 1000000 --recent-days 90 --limit 10 --output drafts/research/popular-food.json` checks public YouTube metadata. Add `--urls path/to/links.txt` for public links from other platforms. This reads titles, dates, durations and cumulative public view counts; it does not download creators' footage. Search access and view counts vary by platform. A million lifetime views is not proof of a current trend, and no production setting can guarantee a million views. Watch candidates, identify craft choices, then make an original story and footage. For a fresh Google Trends niche snapshot, use `npm run trend:brief:mac -- --niche 'fine dining food'`.

## Example: original 30-second scallop film

```sh
cd /Users/eibbini/Documents/shorts-app
npm run direct:mac
# Choose ai; subject: one sea scallop cooked and served to one guest.
# Ending: the guest cuts the scallop, reveals a moist center, and takes a bite.
# Style: photoreal food film, warm tungsten light, macro lens.
# Length: 30; format: vertical. Review the plan before choosing y to render.
```

The reference lesson is concrete camera framing, one plausible moving action per shot, consistent props and light, a visual obstacle and payoff, synchronized sound, and review after each render. The local application uses its installed models; it does not import ChatGPT or Sora model weights.

## Make another video yourself from Terminal

```sh
cd /Users/eibbini/Documents/shorts-app
npm run direct:mac
```

Choose `ai`, then answer the guided questions with concrete actions. For example: subject `a chef sears one Wagyu sausage, assembles one long brioche hot dog, and serves one guest`; title `The Hotel Hot Dog`; visible ending `the guest bites the finished hot dog, revealing the crisp bun and juicy sausage`; style `photoreal luxury food cinema, warm hotel kitchen, 100mm macro lens, copper pan`; admired craft `quick sizzling hook, close food textures, one clear cooking sequence, audible bite`; length `30`; format `vertical`. Answer the optional trend and YouTube research questions `y` if you want current public signals, or `n` to skip them. Research is advisory and may find no verified trend.

The command prints a path such as `drafts/generated/guided-YYYYMMDD-HHMMSS.local-scenario.json`. Read the six beats and the exact ending. If a shot changes subject, dish, setting, or cooking order, edit that JSON before rendering:

```sh
nano drafts/generated/guided-YYYYMMDD-HHMMSS.local-scenario.json
npm run direct:mac -- --mode ai --scenario drafts/generated/guided-YYYYMMDD-HHMMSS.local-scenario.json --check-only
npm run direct:mac -- --mode ai --scenario drafts/generated/guided-YYYYMMDD-HHMMSS.local-scenario.json
```

In `nano`, refine each `imagePrompt` with the same identifiable subject, same location and props, its current cooking stage, and a composition that can move. Refine each `motionPrompt` to describe one plausible physical action and camera move. Keep shot durations adding to 30 seconds and ensure the last shot visibly delivers the requested ending. Press `Ctrl+O`, Enter, then `Ctrl+X` to save. The check-only command validates the revised draft without starting FLUX or LTX. The final command checks power and GPU, creates the chained image storyboard, runs an optional local vision review, then asks you to inspect the sheet and decide whether to spend time on motion. Answer `n` if the images are wrong; revise the JSON and rerun. Answer `y` to both review prompts only when the frames form one story. The finished MP4 is under `outputs/` and receives video QA and a quality report. For a quick cut of clips you filmed or generated elsewhere, choose `montage` at the first question and give a real folder containing MP4/MOV files in story order.

## Optional 3D mini chef over real food

The `mini-chef-studio` Remotion composition layers a small animated Three.js chef over **moving vertical food footage**. It keeps the footage and its audio as the main film. React Three Fiber drives frame-accurate poses, while Drei and VRM packages are installed for a later rigged character. The chef is a procedural prototype with a wave, point, blink, expression, and body bob; it can later be replaced by a rigged GLB/VRM while retaining the same timeline and footage layer. Keep it small enough that the plated food remains visible.

```sh
npm run chef:overlay:mac -- --input outputs/your-finished-food-video.mp4 --output outputs/your-food-video-chef.mp4
```

The wrapper checks that the input exists and is vertical, copies it to the ignored Remotion `public/food.mp4`, renders locally, and runs video QA. It adds no licensed stock footage or paid service. The optional Remotion layer is separate from FLUX/LTX generation, so it can also dress a fast montage of your own real camera clips.

After rendering, use the [90/100 release gate](QUALITY_RELEASE_GATE.md) and `npm run quality:history:mac` to monitor improvement. PySceneDetect measures actual cut positions; the final visual and audio score remains a real review of the exported film.
