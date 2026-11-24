# Top 10 enhancements (Claude → Codex, 2026-11-23)

Goal: move the local Studio (FLUX.2 klein stills → LTX 2.3 motion, M1 16 GB) closer to Seedance-class Shorts.
Ranked by expected quality gain per hour of work. Status labels follow project rules. Every item ends with an owner-rated render; passing tests is not proof of cinematic quality.

Before starting: read `docs/AI_HANDOFF.md`; do not disturb a running Studio job; no paid APIs, installs, model downloads or pushes without owner approval. Prerequisites the owner controls: merge PRs #35/#36, approve pushing branch `fix/nonfood-shot-normalize`.

## 1. Best-of-N motion seeds per shot (PLANNED)
- Why: motion is where the "AI look" appears (identity drift by ~4 s in the hero test; burger shot 1 ignored the flip). One bad clip costs ~15 min; a choice of takes is the cheapest quality lever.
- Build: opt-in per shot, up to 3 seeds from the same approved first frame, reusing `scripts/motion_takes.py` (take seeds and cache already exist). Add a cheap pre-filter (item 3) to rank takes; the owner picks.
- Take state rule (review R1): a requested take is *pending* until every segment finishes. `motion_takes.py` must record pending separately from completed takes; `highest` advances only on success; on failure or cancel the previous selection is restored and the take count is not consumed. Same rule for the final-render retake route. Batch mode must never treat `highest` as proof that a clip exists.
- Preview rule (review R2): the Studio shows the *selected* take, resolved from the take manifest (shot, take, segment) returned by the API, never the newest file by modification time.
- Ranking rule (review R3): ranking combines technical flags and the item-3 identity measurement, reported separately; until item 3 is calibrated, the ranking is labelled advisory.
- Done when: a 2-shot film can be rendered with 3 takes on one shot, ranked by technical + identity evidence, switched without re-render, and assembled from the chosen take; the preview always matches the selected take; a failed or cancelled take leaves the previous selection intact and does not use up a take. Measured wall time recorded.

## 2. Reference-image identity lock for recurring characters (PLANNED)
- Why: characters and costumes drift between shots (hero test: emblem and costume changed).
- Build: let the owner save an approved still as a named character reference; pass it as the FLUX anchor for every shot's first frame (`--anchor-image` already exists in the sequence flow) and record its hash in the scenario.
- Done when: a 3-shot film with one saved character keeps face, hair and outfit across all first frames in the owner's review.

## 3. First-vs-last-frame identity check (PLANNED)
- Why: `scripts/look_drift.py` only checks luma and saturation; it cannot see a face or costume change.
- Build: start free and local: crop the subject region (centre or a box from the plan) and compare first vs last frame with colour histogram + SSIM; flag above a threshold. An embedding model (CLIP/DINO) is a later option that needs download approval.
- Done when: the check flags the known hero-test drift and passes the red-dress shot 1 clip if the owner says it held; thresholds tuned on at least 10 owner-labelled clips.

## 4. Non-food planner reliability (IMPLEMENTED IN PART)
- Why: the hero idea failed planning repeatedly (refiner static endings, fragment hooks, scene-state chain errors).
- Build: run refiner output through the same gates as the planner before saving (static-ending and fragment-hook repair, using `story-draft-utils.mjs`); add regression fixtures from the failed hero drafts.
- Done when: 5 different non-food ideas plan successfully within 3 attempts, with fixtures in tests.

## 5. Pack-aware motion rules (PLANNED)
- Why: `data/topic-packs.json` lists safe and risky motions per category, but nothing enforces them.
- Build: detect the pack from the brief; inject its safe motions into the shot prompt; have `preflight-short.py` warn on that pack's risky verbs (extend `HARD_CONTACT`).
- Done when: a red-pack idea (knife work, fights) gets a clear warning before render, with unit tests per pack.

## 6. Owner rating loop and golden set (IMPLEMENTED IN PART)
- Why: no local vision model judges realism (qwen3-vl rated everything 5); the owner's ratings are the only real judge. The golden set has 12 rows.
- Build: a one-tap per-clip rating in the Studio (identity held / action happened / looks real, 1–5) saved to the ledger and the golden set; a report of which gates agree with the owner.
- Golden-set rule (review R4): ratings saved in `storage/studio-learning/runs.jsonl` must be exported or synced, reproducibly and bound to the clip's sha256, into `outputs/golden/golden-set-v0.jsonl`, and joined with the gate results recorded for the same clip.
- Done when: ratings save from the UI, appear in the golden set with the clip hash, the golden set reaches 50+ rows, and a script reports per-gate agreement with the owner, clips missing gate evidence, and the thresholds used.

## 7. Topic-pack benchmarks (PLANNED, blocked on render time)
- Why: pack colours are hypotheses.
- Build: 3 clips each for object transformation, stylized mini-story and gadget reveal, using the same prompt structure; frame review + technical QA + owner rating; update colours in `data/topic-packs.json`.
- Done when: each of the three packs has three rated clips and an evidence-backed colour.

## 8. Muted-first hook in the final video (PLANNED)
- Why: the hook bank (`data/hook-bank.json`) has on-screen text per pattern, but assembly does not render it; most Shorts are watched muted. Viral teardown: the stand-out example proves its premise in the first second.
- Build: render the chosen pattern's on-screen text as a short title card in the first 1.5 s; record the hook pattern id in the scenario; preflight checks that shot 1 shows a visible action in its first frame.
- Done when: an export shows the hook text in the first second, legible on a phone, with the pattern id saved.

## 9. Sequence-mode retake and honest time estimates (PLANNED)
- Why: in step-by-step mode, the UI moves to the next shot as soon as a clip finishes, so a bad shot cannot be retaken until the full render; High estimates show Standard timings (PR #36 fixes the estimate).
- Build: pause after each sequential clip with "Keep" / "Another take"; use measured High timings (~15 min per clip, ~25 s per still candidate).
- Done when: a sequential run can retake shot 1 before shot 2 starts, and the shown estimate is within 20% of the measured time.

## 10. Hosted-model escape hatch for red categories (PLANNED, needs owner approval and budget)
- Why: realistic crowds, fast fights and hand-heavy work stay red on the local model; the high-view AI films in the teardown were made with hosted models.
- Build: per-shot routing switch that exports the approved first frame + motion prompt to a hosted provider, shows the cost estimate first, and requires explicit owner approval per run; the result returns into the same assembly and review flow.
- Done when: one approved red-category shot renders through the hosted route with the cost recorded, and the owner compares it with the local take.

## Current status (2026-11-23 review round 1)
Another Codex session has uncommitted, partial implementations of items 1, 3 and 6 in the working tree (`scripts/motion_takes.py`, `scripts/render-studio-shot.py`, `scripts/studio-server.mjs`, `scripts/compare-motion-frames.py`, `scripts/report-motion-ratings.py`, `studio/src/App.jsx` and others). Review round 1 found the defects now written into items 1 and 6 (R1-R4). Fix those before calling any item done.

## Verification (proof commands)
Run from the repo root on the Mac after each item:
- `npm test` (runs watchdog tests then Vitest; expect all pass).
- `node --test scripts/hook-bank.test.mjs scripts/shot-normalize.test.mjs scripts/story-draft-utils.test.mjs scripts/story-action-gate.test.mjs` (expect all pass).
- `PYTHONPATH=scripts python3 -m unittest test_motion_takes test_look_drift test_hook_bank test_preflight_motion_risk test_select_still_local` and `python3 scripts/test_studio_workflow.py` (expect OK).
- Item 1 regression tests to add: failed/cancelled take restores selection and does not consume a take; preview endpoint returns the selected take path; batch never cache-reads a take that has no clip.
- Item 3: run the identity check on the hero-test clips and on the red-dress shot 1 clip; record values next to owner labels.
- Item 6: export script run twice gives identical golden-set rows (reproducible); agreement report lists every gate.
- Real-output proof: each item ends with one real Studio render on the Mac, technical QA from `finish-local-video.py`, and an owner rating. Old and new code run on the same scenario where behaviour is replaced (e.g. take selection), and results compared.
- `git diff --check` clean.

## Order of work
1, 3, 2 first (motion and identity), then 4 and 5 (planner), then 6 (judging), then 7 (evidence), then 8, 9, 10.
Do not run two renders at once (memory). Update `docs/AI_HANDOFF.md` after each item with branch, commit, tests and render evidence.
