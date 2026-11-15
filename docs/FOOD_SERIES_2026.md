# Six food series and the current creation path

Checked 2026-11-15. These are editorial experiments, not a measured global ranking or a guarantee of views. The BB channel was not connected to vidIQ when this brief was prepared, so the app has no channel-specific retention or audience data.

Run `npm run ideas:series:food` for all six series and `npm run ideas:recipes:2026` for ten candidate recipes. Both commands are read-only and require no model or GPU. Series definitions live in `data/food-series.json`.

`npm run ideas:bank` now lists evidence-tagged hooks, montage and sound patterns from a bounded vidIQ scan, plus ten original production ideas. See `docs/CREATIVE_BANK.md` for source depth and limits. `npm run brief:local -- --idea miso-butter-potato-pave` preloads one bank idea into the director questions; you can change every answer before Gemma drafts the story.

For your own 30–60 second story, use the guided command after this branch is merged. The new director brief asks for the exact dish, style, one set, first visible hook, must-show action, obstacle, technique, ending, sound mode, duration and orientation. Optional answers may be left blank for the local model. Give it a concrete ending, such as “the chef cracks the crust and serves one steaming slice,” to keep the middle shots connected.

```bash
cd /Users/eibbini/Documents/shorts-app
npm run brief:local -- --model gemma-local
# Review the printed drafts/generated/ID.local-scenario.json: title, all shot actions, props and ending.
bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json --best-of-3-stills
# In another Terminal while it renders:
bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --watch
```

Replace `ID` with the actual filename printed by the draft command. `--best-of-3-stills` is optional and slower. The current interactive builder supports **10–60 seconds**; wide format currently requires 60 seconds. Beyond one minute, plan separate connected chapters and edit them together; there is no verified one-command feature-length story path. A passing technical gate still requires watching the final footage and listening to its mix.

`npm run make:any:mac -- --draft-only` uses the same director brief and prints the shot plan. The brief is saved as `drafts/generated/ID.brief.json` next to the scenario, so you can see exactly which answers the local model received. For repeatable smoke tests, `python3 scripts/director-brief.py --answers my-answers.json --dry-run` validates an answer file without calling Gemma or using the GPU.

The six template formats also accept a local Ollama visual refinement in the one-command film path. A single `qwen3:8b` call revises each shot's still prompt, moving action and sound while keeping the template's narration, duration, prices and ending fixed. `--offline-template` selects deterministic prompts for troubleshooting. The template may take `--slot visual_set='sunlit walnut kitchen'`, `--slot surface='wooden board'`, `--slot pan='cast-iron skillet'`, `--slot hand='bare hand'`, and `--slot visual_style='warm realistic food film'`. The model refinement is code-tested with a mocked local response; a real model call and rendered comparison remain pending.

```bash
bash scripts/make-film.sh process-reveal \
  --slot 'item=roasted garlic bread' \
  --slot 'time_or_effort=one hour' \
  --slot 'source=your checked recipe source' \
  --slot 'visual_set=sunlit walnut kitchen' \
  --draft-only
```

Review the saved scenario and source any stated time, price or record before rendering. Four price-driven templates intentionally fail the evidence gate if they contain only a placeholder amount; a number needs a sourced basket or documented record.

## Evidence used

- vidIQ reviewed the [user's garlic bread reference](https://www.youtube.com/shorts/LV3mChwupF8) on 2026-11-15: about 20 seconds, five visual beats, no voice and no background music reported, with natural kitchen sounds prominent. This is a reference for pacing and sound, not footage to copy.
- vidIQ's recent garlic bread outlier search returned several independent 16–21 second examples with high channel-relative performance. Outlier status does not predict performance on BB. Its recent VPH snapshot lacked a comparable historical baseline, so trend acceleration is unconfirmed.
- [Pinterest Predicts 2026](https://business.pinterest.com/en-ca/pdf/pinterest-predicts/2026-trend-report/), [TikTok Next 2026](https://ads.tiktok.com/business/en-US/next), and [Whole Foods Market's 2026 forecast](https://www.wholefoodsmarket.com/company-info/newsroom/news-releases/whole-foods-market-forecasts-the-top-food-and-beverage-trends-for-2026) support broad ingredient and format leads. They do not verify the exact recipes or forecast views.

## Six series

| Series | Story engine | Default presentation |
| --- | --- | --- |
| The Crave Lab | Finished texture → preparation → fresh texture payoff | Natural cooking ASMR; no voice or subtitles unless needed |
| One Pan, One Transformation | Raw ingredient → heat problem → one visible technique → final texture | Pan sound; a short explanatory voice line only when useful |
| Honest Luxury Levels | Same dish → sourced ingredient upgrades → final plate | Kitchen sound, readable price labels; optional licensed music |
| Guess the Basket | Finished dish → ingredient clues → sourced retail basket reveal | Tactile sound; text for question and amount |
| Tiny Technique, Big Result | Food failure → small correction → observable improvement | Brief voice with matched captions when instruction adds value |
| Close-Up Recipe Guide | Finished spoonful → measured ingredients entering one dish → cooking-time cut → serving | Kokoro voice, aligned subtitles, and low recorded kitchen ambience |

These six concepts use four editorial format families. A change of dish, set, hook, actions and pacing is still required for variety. YouTube's [inauthentic content policy](https://support.google.com/youtube/answer/1311392?hl=en) does not prescribe a particular number of formats.

## First film

The original `Brown-Butter Shallot & Roasted Garlic Bread` plan is in `examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json`. It has four five-second motion shots in one warm copper kitchen. The recipe adds browned butter, shallot and thyme. It is a creative recipe draft, not a cooked or taste-tested claim. Its first frame and cuts must be reviewed before publication.

```bash
cd /Users/eibbini/Documents/shorts-app
npm run ideas:series:food
node scripts/bb-local-scenario.mjs --validate examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json
python3 scripts/preflight-short.py examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json --strict
python3 scripts/audit-local-story.py examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json
bash scripts/make-local-video.sh --scenario examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json --best-of-3-stills
```

Use the branch containing this work after the PR is merged; the original checkout will not see these files before then. The optional best-of-three still selector adds generation time and requires a working local Qwen vision endpoint. It does not replace human inspection. The active Mac GPU queue must finish before a new local film render starts.

## Storybook and comic version

`scripts/trend-fx.py comic` currently makes a comic panel from the first frame and dissolves to the live footage. It is a quick editorial variant, **not** a full animated 3D storybook. A true 3D storybook needs a scene/character bible, consistent poses and lighting, animation across every shot, then final technical and human visual/audio review. Treat that as a separate production path and compare a same-prompt sample before expanding it to all ten ideas.

## Tool candidates to benchmark, not install automatically

- Existing local [MLX LTX port](https://github.com/dgrauet/ltx-2-mlx): installed checkout at `747b30e` dated 2026-11-01, model path points to LTX-2.3 q4. Its upstream README includes 16 GB guidance. Compare new revisions on the same prompt, output dimensions, duration, and power conditions before changing the pinned version.
- Existing [Remotion transitions](https://www.remotion.dev/docs/transitions/): choose a transition to motivate a change of time or action. Hard cuts remain appropriate for fast recipe ASMR. Avoid transition effects that obscure food motion.
- [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2): Apache-2.0 small model could help depth-aware chef/prop compositing; benchmark edge quality and runtime on real food frames. Its larger models have noncommercial licenses.
- [Beat This](https://github.com/CPJKU/beat_this): MIT beat tracking could align licensed music to cuts. The garlic reference has no reported music, so this is optional for other formats.

The next quality jump is measured continuity and final-cut review, including hand/tool contact, food state changes, sound placement and exact final duration. A numerical quality score cannot prove those by itself. No local film's audio has been heard by this assistant.

The current `add-sfx.py` renderer makes original synthesized Foley approximations. Its cue mapping now separates spoon scraping/spreading from an actual plate clink, and uses the explicit shot sound line before fallback prompt text. This was smoke-tested on the garlic-bread scenario. It has **not** been auditioned as natural kitchen audio. Prefer original or properly licensed real recordings where available, then listen to the finished mix and compare voice/no-voice versions using the channel's own retention data before calling either the best performer.

## Smoky Jalapeño Double Smash Burger, 35 seconds

The user's nine-shot ASMR brief is in `examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json`. It locks the finished-food bun press at 0–2 seconds, griddle actions at 2–14, assembly at 14–27, and cut/cross-section at 27–35. The only on-screen text is the two-second `Can you bite this?` hook. Music, voice and subtitles are disabled. Local Qwen3 8B reviewed the shot plan against the master food, shot and montage prompts; its comments are advisory, and the final pixels still need inspection. vidIQ's free script guidance was consulted; no vidIQ click or performance score is claimed for this burger.

The audio plan uses two declared public-domain field recordings for frying and dry crunch, documented in `assets/foley/public-domain/SOURCES.md`. Other sound cues remain local synthesized approximations. A technical sound audit and a buffer smoke test passed; no assistant has heard the finished mix.

```bash
cd /Users/eibbini/Documents/Codex/2026-11-06/python-3-12-is-already-installed/shorts-app-evidence
node --input-type=module -e 'import fs from "node:fs"; import {verifyScenario,scenarioSettings} from "./scripts/scenario-schema.mjs"; const s=JSON.parse(fs.readFileSync("examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json")); verifyScenario(s.plan,scenarioSettings(s.settings)); console.log("schema passed")'
python3 scripts/preflight-short.py examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json --strict
python3 scripts/audit-local-story.py examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json
bash scripts/make-local-video.sh --scenario examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json --best-of-3-stills
```

The first `qwen3-vl:4b` still review ran out of response tokens without returning JSON. The selector now marks that choice unverified and keeps rendering with a candidate that passed only the blank/dark check. Human frame review is essential; this fallback is not a best-of-three quality verdict.

For a repeatable burger render, use the nine visually selected local FLUX stills saved outside Git:

```bash
bash scripts/make-local-video.sh \
  --scenario examples/local-scenarios/smoky-jalapeno-double-smash-burger-35.local-scenario.json \
  --stills storage/approved-stills/smoky-jalapeno-double-smash-burger-35
```

The 2026-11-15 revised run produced `outputs/smoky-jalapeno-double-smash-burger-35-20261115-125551.sfx.captioned.mp4`. Final-file technical QA passed at 35.0 seconds, no detected long silence, no black or frozen picture, and measured loudness −16.94 LUFS. The sound path now writes an exact silent music bed when the scenario says `none`, adds continuous low kitchen room tone between action cues, and audits ASMR coverage before GPU rendering. This is a **review copy**: the assistant inspected sampled frames but has not heard the audio. A brief patty morph during shot three and the final cross-section's fused-looking meat layers remain visual concerns. The editorial release gate remains blocked because there is no recorded full-video/full-audio review and the published-signatures history is empty. Do not treat the provisional 50/100 as a quality rating.

## One-Pan Red Curry Dumpling Bake preview (2026-11-15)

The new 30-second, eight-shot subtitled recipe scenario is `examples/local-scenarios/red-curry-dumpling-bake-30.local-scenario.json`. Its structured `recipeSequence` gate checks the ordered ingredients, one vessel and cooking-time cut before model work. The pack builder now includes the measured ingredient list, method and recipe inspiration source so a viewer can cook the dish. The source is [Marion’s Kitchen red curry dumplings](https://www.marionskitchen.com/one-pan-red-curry-dumplings/); the film is an AI demonstration, not a cooked or tasted kitchen test. A small vidIQ outlier sample supported the one-pan dumpling topic but does not predict views.

Two local FLUX 512×896 preview stills and one Nano Banana 2 768×1376 preview were compared. The Nano still showed a fuller pan of distinct dumplings and a more believable sauce surface. It came from the user’s Gemini app and was downloaded to `outputs/red-curry-dumpling-bake-nano-banana-2-preview-20261115.jpeg`. The Gemini app offers limited image creation, while the Gemini API image-generation pricing page lists no free tier for Nano Banana; do not assume the website can be used as a free automated backend. The current local renderer resizes supplied stills to 384×640 before LTX motion, so a better still is only a starting condition. A first two-second LTX pilot visibly morphed the lifted dumpling; a second pilot with a simpler upward spoon move preserved it across 49 sampled frames. The full 30-second render has now begun using the Nano still for shot one. Its remaining seven shots and final edit still need visual review.

The first voice pass found two silence gaps over 1.5 seconds and stopped before GPU work. Narration was tightened and a second voice-gap check passed. A 60-second CC BY 4.0 excerpt of Kevin MacLeod's *Wholesome* is in `assets/music/`; its attribution is written into the upload pack. The licensed-track path now checks metadata, file existence and duration. A 30-second voice/music preview is in `outputs/red-curry-dumpling-voice-music-preview-20261115.mp3`. No assistant has listened to it; the owner should judge the balance before release. The burger review copy was reported by the owner to have fake-sounding effects and an inaccurate patty flip. The burger scenario now avoids the lifting action and uses `recordings-only` sound policy with required scrape, crunch and slice cues. Its pre-render sound audit correctly **blocks** until matching real recordings are sourced. Do not rerender or call it ready based on the old technical score.
