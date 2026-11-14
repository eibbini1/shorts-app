# Five food series and the current creation path

Checked 2026-11-15. These are editorial experiments, not a measured global ranking or a guarantee of views. The BB channel was not connected to vidIQ when this brief was prepared, so the app has no channel-specific retention or audience data.

Run `npm run ideas:series:food` for all five series and `npm run ideas:recipes:2026` for ten candidate recipes. Both commands are read-only and require no model or GPU. Series definitions live in `data/food-series.json`.

For your own 30–60 second story, use the guided command after this branch is merged. The draft asks for subject, visual style, the change at the end, duration and orientation. Give it a concrete ending, such as “the chef cracks the crust and serves one steaming slice,” to keep the middle shots connected.

```bash
cd /Users/eibbini/Documents/shorts-app
bash scripts/make-local-video.sh --draft-only --model gemma-local
# Review the printed drafts/generated/ID.local-scenario.json: title, all shot actions, props and ending.
bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json --best-of-3-stills
# In another Terminal while it renders:
bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --watch
```

Replace `ID` with the actual filename printed by the draft command. `--best-of-3-stills` is optional and slower. The current interactive builder supports **10–60 seconds**; wide format currently requires 60 seconds. Beyond one minute, plan separate connected chapters and edit them together; there is no verified one-command feature-length story path. A passing technical gate still requires watching the final footage and listening to its mix.

## Evidence used

- vidIQ reviewed the [user's garlic bread reference](https://www.youtube.com/shorts/LV3mChwupF8) on 2026-11-15: about 20 seconds, five visual beats, no voice and no background music reported, with natural kitchen sounds prominent. This is a reference for pacing and sound, not footage to copy.
- vidIQ's recent garlic bread outlier search returned several independent 16–21 second examples with high channel-relative performance. Outlier status does not predict performance on BB. Its recent VPH snapshot lacked a comparable historical baseline, so trend acceleration is unconfirmed.
- [Pinterest Predicts 2026](https://business.pinterest.com/en-ca/pdf/pinterest-predicts/2026-trend-report/), [TikTok Next 2026](https://ads.tiktok.com/business/en-US/next), and [Whole Foods Market's 2026 forecast](https://www.wholefoodsmarket.com/company-info/newsroom/news-releases/whole-foods-market-forecasts-the-top-food-and-beverage-trends-for-2026) support broad ingredient and format leads. They do not verify the exact recipes or forecast views.

## Five series

| Series | Story engine | Default presentation |
| --- | --- | --- |
| The Crave Lab | Finished texture → preparation → fresh texture payoff | Natural cooking ASMR; no voice or subtitles unless needed |
| One Pan, One Transformation | Raw ingredient → heat problem → one visible technique → final texture | Pan sound; a short explanatory voice line only when useful |
| Honest Luxury Levels | Same dish → sourced ingredient upgrades → final plate | Kitchen sound, readable price labels; optional licensed music |
| Guess the Basket | Finished dish → ingredient clues → sourced retail basket reveal | Tactile sound; text for question and amount |
| Tiny Technique, Big Result | Food failure → small correction → observable improvement | Brief voice with matched captions when instruction adds value |

These five concepts use four editorial format families. A change of dish, set, hook, actions and pacing is still required for variety. YouTube's [inauthentic content policy](https://support.google.com/youtube/answer/1311392?hl=en) does not prescribe a particular number of formats.

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
