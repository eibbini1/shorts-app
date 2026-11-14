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
