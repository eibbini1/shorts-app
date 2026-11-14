# AI handoff

Updated: 2026-11-14. Review branch: `feature/unified-shorts-pipeline`, based on `feature/phase4-trend-intelligence` at `2d7b162`. The original checkout at `/Users/eibbini/Documents/shorts-app` is rendering Byakuya; this branch lives in a separate worktree under `/Users/eibbini/Documents/Codex/2026-11-06/python-3-12-is-already-installed/shorts-app-unify`. Do not switch the original checkout during its render.

## Verified state

- Juuni Ban 16-second local film and on-plate chef prototype exist in ignored `storage/p5` and `storage/p6`. The chef placement looked consistent in sampled frames. Technical QA of the plate film passed, but editorial review and listening to the audio are still required. Its score is 50/100 because the human editorial component has no verdict.
- The local stack is Gemma for story drafting, FLUX.2 Klein for stills, MLX LTX for motion, Kokoro for voice, and FFmpeg/Remotion for finishing. The 1080 export upscales 720-native motion.
- Phase 4 trend signal code is on the base branch. This branch also retains YouTube-only topics in rankings. Live trend claims still require dated source review.
- All six filled templates now pass schema validation, strict preflight and story audit; 16 focused Python tests pass. The `process-reveal` duration mismatch is fixed.
- `make-film.sh` checks exact duration and technical quality after each edited stage, including the final MP4. A failed technical check stops the command. It saves a QA report for each file; editorial scoring points at the final export.
- Opening brand text is suppressed because the first caption contains the hook; the closing seal remains. A 16-second Juuni Ban seal smoke render succeeded. The full one-command edited path remains to be verified on Byakuya.
- `--crumb-on-plate` is opt-in, restricted to the Juuni Ban shot anchors, and stops for a placement review. It is not a general food placement model.

## Active film and next actions

1. Let the original checkout finish `drafts/generated/byakuya.local-scenario.json` (nine motion clips; 32-second scenario). Do not compete for the GPU.
2. Review the rendered picture and audio. If sound and action tolerate it, run `python3 scripts/tighten-shot-tails.py --scenario drafts/generated/byakuya.local-scenario.json --video INPUT.mp4 --trim 2=1 --trim 5=1 --output OUTPUT.mp4 --scenario-output OUTPUT.local-scenario.json` to make an exact 30-second cut. Check actual duration and content; adjust trims if needed.
3. Copy the cut into this worktree's ignored `outputs/` directory. Finish it with `bash scripts/make-film.sh story --scenario OUTPUT.local-scenario.json --from-video outputs/OUTPUT.mp4 --pack /Users/eibbini/Documents/shorts-app/outputs/ORIGINAL.pack.json --qa-work-dir /Users/eibbini/Documents/shorts-app/storage/any-local/byakuya.local-scenario --no-crumb`. This applies dissolve, grade and seal, checking each stage and the **final** MP4 against the revised 30-second scenario. A passing technical report is not editorial approval.
4. Revisit the separate 30-second hotel hot-dog render after Byakuya. It is not currently active. Review facts, footage, audio and sources before calling it ready.
5. Commit and push this branch, open a reviewable PR, and update this handoff with the resulting commit, film paths and test results.

## Useful commands

```bash
python3 -m unittest scripts.test_template_to_scenario scripts.test_trend_and_templates
bash -n scripts/make-film.sh
bash scripts/make-film.sh guess-the-price --slot 'item=Juuni Ban hot dog with foie gras, truffle and caviar' --slot 'price=$169' --slot 'rarity_fact=Guinness World Records listed it in 2014' --slot 'source=Guinness World Records' --draft-only
python3 scripts/trend_signals.py --top 10
```

Do not commit generated media, model weights, credentials or scratch outputs. Source and licence review is still necessary for publication.
