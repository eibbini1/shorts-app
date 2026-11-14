# AI handoff

Updated: 2026-11-14. Review branch: `feature/unified-shorts-pipeline`, based on `feature/phase4-trend-intelligence` at `2d7b162`. This branch lives in an isolated worktree under `/Users/eibbini/Documents/Codex/2026-11-06/python-3-12-is-already-installed/shorts-app-unify`. The original checkout is `/Users/eibbini/Documents/shorts-app`; do not switch it while other agents may use it.

Draft pull request: [#17](https://github.com/eibbini1/shorts-app/pull/17). The branch includes commit `52a94a4`; the 10-second presentation-mode work is still local until its real render passes.

## Verified state

- Juuni Ban 16-second local film and on-plate chef prototype exist in ignored `storage/p5` and `storage/p6`. The chef placement looked consistent in sampled frames. Technical QA of the plate film passed, but editorial review and listening to the audio are still required. Its score is 50/100 because the human editorial component has no verdict.
- The local stack is Gemma for story drafting, FLUX.2 Klein for stills, MLX LTX for motion, Kokoro for voice, and FFmpeg/Remotion for finishing. The 1080 export upscales 720-native motion.
- Phase 4 trend signal code is on the base branch. This branch also retains YouTube-only topics in rankings. Live trend claims still require dated source review.
- All six filled templates now pass schema validation, strict preflight and story audit; 16 focused Python tests pass. The `process-reveal` duration mismatch is fixed.
- `make-film.sh` checks exact duration and technical quality after each edited stage, including the final MP4. A failed technical check stops the command. It saves a QA report for each file; editorial scoring points at the final export.
- Opening brand text is suppressed because the first caption contains the hook; the closing seal remains. The full one-command final edit path passed on the 30-second hotel hot dog, including final-file QA.
- `--crumb-on-plate` is opt-in, restricted to the Juuni Ban shot anchors, and stops for a placement review. It is not a general food placement model.
- Byakuya script claims were checked against [Guinness World Records' record](https://www.guinnessworldrecords.com/world-records/731181-most-expensive-of-ice-cream) and [its 2023 feature](https://www.guinnessworldrecords.com/news/2023/5/worlds-most-expensive-ice-cream-will-set-you-back-more-than-a-family-holiday-would): $6,696 was the recorded price on 25 March 2023, and the feature describes Alba truffle, Parmigiano Reggiano, sake lees, gold leaf, an Osaka chef and more than 1.5 years of development. The narration should be understood as the documented record, not a live 2026 menu price.
- Byakuya and the hotel hot dog each have an exact 30-second final MP4 in this worktree's `outputs/`. Both final files pass all six technical QA checks, with 50/100 quality reports because editorial picture/sound review is not entered. Their revised scenarios are in `examples/local-scenarios/`.
- The November trend-inspired film, `The Cinnamon Ribbon`, has three of six motion clips safely cached. It was paused to prioritize the user's 10-second cocoa prototype. See [the ten-Short review](FOOD_SHORTS_REVIEW_20261114.md) for the sampled hook references and their limits.
- The user selected [a cozy movie-night cocoa Short](https://www.youtube.com/shorts/F3x5u2ntqtY) as a creative reference. An original two-shot chocolate-shell prototype is now rendering from `examples/local-scenarios/first-cold-night-10.local-scenario.json`. The presentation selector chooses ASMR without Kokoro or captions for a 10-second two-shot tactile reveal. Source footage, music and branding are not reused.
- [A pomegranate-pineapple ASMR Short](https://www.youtube.com/shorts/CVRQZvbyFxM) is the next creative reference after cocoa: dark backdrop, one glass, close hand action, bright color change. No scenario is rendered yet.

## Active film and next actions

1. Let the 10-second cocoa prototype finish. Its log is `/private/tmp/first-cold-night-10.log`. Run final-file QA and inspect the actual visual opening and sound. Confirm that no voice or captions were added.
2. Resume cinnamon after cocoa, using its three cached clips and the remaining still. Do not run both GPU jobs at once. Its log is `/private/tmp/cinnamon-film-run.log`.
3. Ask the owner to review the Byakuya and hot-dog final files and enter an editorial score before calling either ready for publication. Their reports deliberately say `review-needed`.
4. Commit and push this branch, open a reviewable PR, and record its URL here. Do not commit generated media, model weights or credentials.

## Useful commands

```bash
python3 -m unittest scripts.test_template_to_scenario scripts.test_trend_and_templates
bash -n scripts/make-film.sh
bash scripts/make-film.sh guess-the-price --slot 'item=Juuni Ban hot dog with foie gras, truffle and caviar' --slot 'price=$169' --slot 'rarity_fact=Guinness World Records listed it in 2014' --slot 'source=Guinness World Records' --draft-only
python3 scripts/trend_signals.py --top 10
```

Do not commit generated media, model weights, credentials or scratch outputs. Source and licence review is still necessary for publication.

## 2026-11-15 01:07 +03 — Codex handoff, isolated evidence branch

- Branch: `feature/evidence-gates-local`, code commit `c4dd0e6`, based on `a367942`. This worktree is under `/Users/eibbini/Documents/Codex/2026-11-06/python-3-12-is-already-installed/shorts-app-evidence`; the original `/Users/eibbini/Documents/shorts-app` remains on `feature/unify-asmr-and-quick-film` with Claude's uncommitted render work. Do not switch or edit the original checkout while its queues run. Two tracked Python bytecode caches modified by smoke tests are excluded from the PR.
- VERIFIED: `PYTHONPATH=scripts python3 -m unittest scripts.test_food_series scripts.test_evidence_gate scripts.test_select_still_local scripts.test_template_to_scenario scripts.test_trend_and_templates scripts.test_presentation_mode` passed 26 tests. Bash syntax checks for both film scripts and Node syntax check for story drafting passed. The 20-second brown-butter shallot and roasted garlic bread scenario passed schema validation, strict preflight, story audit and evidence gate. The repriced kebab Levels draft passed schema/story/evidence checks earlier. No finished film came from this branch yet.
- VERIFIED: vidIQ checked the owner's garlic-bread reference and reported five visual beats in about 20 seconds with no voice or background music; natural kitchen sound leads. Its recent outlier examples are channel-relative evidence, not a forecast for BB. The BB channel was not connected to vidIQ. Five series with 15 episode concepts and ten 2026 editorial recipe leads are in `data/food-series.json` and `data/recipe-ideas-2026.json`; `npm run ideas:series:food` works.
- IMPLEMENTED BUT UNTESTED ON A REAL RENDER: master prompt pack in Gemma story drafting; evidence/price/Guinness/variety gate in local film commands; AI disclosure and price sources in upload packs; release score blocks when published history is empty; optional three-still Qwen vision selection. Unit and structure tests do not establish visual or audio quality. The first garlic-bread film is still a scenario, not an MP4. No assistant has heard any local film audio.
- RUNNING ELSEWHERE: Claude's original checkout GPU queue had charcoal-lamb-kebab-wrap at 6/7 motion clips when checked. Queue-g should run a native-size ladder afterward into `storage/p9/hires/results.tsv`; queue-o then rerenders kebab Levels. Do not launch a competing GPU job. The table was absent at this check, so no default size change or recommendation yet. The wrap film was absent, so showcase reel A and frame review are pending.
- BLOCKERS: actual BB upload signatures are needed in `data/published-signatures.json` before a release can pass the variety check. Real frame inspection and full audio listening are needed for any 90+ editorial score. Metal access was unavailable in this isolated sandbox shell; the local film render needs a Mac Terminal run after the existing GPU queue clears. A true animated 3D storybook path is not implemented; `scripts/trend-fx.py comic` transforms only the first frame.
- NEXT: push this branch as one reviewable PR, let the existing GPU queues finish, inspect wrap frames and build reel A if usable, read resolution benchmark results without changing the default, then render the garlic-bread film through final QA. Compare a 3D storybook sample and a same-prompt LTX revision on the Mac before adopting either. Keep 95/100 as an editorial target, never an automatic claim of achieved quality.

## 2026-11-15 01:11 +03 — Codex follow-up

- Branch `feature/evidence-gates-local`; HEAD `093143a` at the start of this follow-up. Draft [PR #19](https://github.com/eibbini1/shorts-app/pull/19) is open, mergeable, and includes the code and 01:07 handoff. Current source working tree: this handoff and `docs/FOOD_SERIES_2026.md` have follow-up edits; two test-generated tracked `.pyc` files remain unstaged. Local media under `outputs/` is ignored.
- VERIFIED: original checkout's `storage/p9/charcoal-lamb-kebab-wrap-15s.mp4` landed at 15.004 s, 1080x1920 export. Its contact sheet was inspected: actual food motion and a coherent charcoal setting, with repetitive skewer/wrap framing and some dish-state inconsistency between shots. Do not call it a 95/100 or publication-ready film. Audio has not been heard. The script's pixel proxy reports motionLevel 11.1, flicker 0.461, 2 spikes and 0 detected cuts; these do not establish editorial quality.
- VERIFIED: a silent 8.958 s `outputs/showcase-reel-a.mp4` was built from wrap/chocolate/wrap segments and visually checked. A first version included baked noodle captions over its reel label and was replaced. `outputs/charcoal-wrap-comic-opening.mp4` is a checked first-frame comic-opening demonstration, not animated 3D storybook footage. These are local review artifacts, not uploaded or in the PR.
- IMPLEMENTED BUT UNTESTED: the guided 30–60 s terminal workflow is documented; the full new garlic-bread film remains unrendered. The best-of-three vision selector and master prompts have no real-film comparison yet.
- BENCHMARK: `storage/p9/hires/results.tsv` appeared but was still being written. The 768x1280 FLUX still row succeeded in 59 s; direct 1080x1920 still failed immediately because the FLUX command requires dimensions divisible by 16. Do not infer a memory or quality limit from that invalid-size row. No default-size recommendation until the full motion ladder and visual samples are available.
- NEXT: push this follow-up to the same PR, keep the queued GPU jobs serialized, inspect all benchmark rows and final audio with a human, then render the garlic bread scenario from this branch. Enter real published-film signatures before any release pass. Continue a true 3D storybook path as a separate sample and measure it before automating ten films.
