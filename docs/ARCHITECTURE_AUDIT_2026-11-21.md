# Architecture audit — 2026-11-21 (Claude, read-only)

Scope: audit and plan only. No code changed. Branch `handoff/current-work-2026-11-21` @ `329c6be` (based on main `4ce9f40`), working tree dirty: 136 entries — 5 modified tracked `.pyc`, the rest untracked drafts, episodes, outputs and benchmark drafts belonging to other sessions (left untouched).
"ICE Shorts" in the brief is taken to mean this repo (Studio branded iShorts).

## A. Current architecture (verified by reading files)

| Layer | Where | Role | Last change |
|---|---|---|---|
| TS platform | `src/` (~8.8k lines, 24 CLIs) | Original Shorts factory: `VideoPipelineService.ts` (844 lines), `VideoRenderer`/`cinematic.ts` FFmpeg, SQLite repos, YouTube publish, QualityGateService | pipeline service 2026-11-01 |
| TS hosted motion | `src/media/video/MotionEngine.ts`, `HostedMotionDispatcher/Worker/ArtifactTransfer.ts`, `src/database/Hosted*Repository.ts` | Typed adapter contract, job + spend ledger. Not wired to anything else | 2026-11-21 |
| Local film engine | `scripts/` (181 entries: 106 .py, 47 .mjs, 18 .sh; ~18k lines) | `make-local-video.sh` (214 lines) chains ~20 scripts: director-brief → refine-prompts → check-env → prompt-lint → preflight → audit-local-story → evidence_gate → add-sfx --audit → render-any-local (FLUX stills, vision gate, LTX motion) → add-sfx → finish-local-video / artcraft-finish / filmcraft-finish → qa-local-video → export-provenance → log-local-run → prereview → score-local-video | 2026-11-21 |
| Studio server | `scripts/studio-server.mjs` (1,513 lines, 29 routes) | Auth (token cookie, relatives), quotas, job runner (spawns `make-local-video.sh`), SSE, Range media, sessions JSON, learning ledger, env check | 2026-11-21 |
| Studio UI | `studio/src` (App.jsx 886, extras.jsx 841, 3D preview 278) | React 19 + Vite + three | 2026-11-21 |
| Other | `mini-chef-studio/` (Remotion prototype), `create_video.py`, `*.ps1` (Windows/Flow legacy) | Legacy / prototype | ≤2026-11-08 |

Data flow (local path): idea → `*.brief.json` → `*.local-scenario.json` (plan.shots[]: seconds, imagePrompt, motionPrompt, sound, narration) → `storage/any-local/<id>/` (stills, clips, `film-manifest.json`, frame hashes) → `outputs/*.mp4` + `.pack.json` + `.qa`/`.prereview.json` → `storage/studio-learning/runs.jsonl`.
Studio ↔ engine contract: process spawn + **stdout text lines** + **exit codes**.

## B. Technical debt (ranked)

1. **HIGH — Two engines, no shared scenario contract.** Local path (Python dicts) and TS platform/hosted MotionEngine never share a type; the only TS scenario type is a local `interface Scenario` in `src/cli/reviewScenario.ts`. No JSON Schema; only manifests carry `schemaVersion: 1` (`render-any-local.py:210`, `studio_frames.py`). Consequence: the identity bible / first-shot anchor exists only in the local path (handoff confirms), and a hosted adapter cannot take a Studio scenario without ad-hoc translation.
2. **HIGH — Studio↔pipeline contract is free text.** UI parses `BLOCKED`, `NEEDS-CHOICE: `, `REVIEW`, `[progress]`, `Attempt n/3` (`studio/src/App.jsx`, `extras.jsx`); `make-local-video.sh` uses exit 2 (15 sites), 3 (7), 4 (2), 5 (1) for different gates. Rewording a message breaks blocking, retry and learning silently. Also the root of "which shot / which gate failed" being hard to show in the UI.
3. **HIGH — `studio-server.mjs` monolith (1,513 lines).** Security-critical code (token auth, per-user ownership, media allowlist, quotas) is interleaved with job running, SSE and learning. Hard to unit-test; coverage today is the Python `test_studio_workflow.py` (7 tests) plus learning tests.
4. **MEDIUM — Interpreter fragmentation.** `storage/tools/ComfyUI/.venv/bin/python` is hard-coded in 22 files; others use system `python3`; tests were run with a third venv (`scenedetect`). Evidence: `test_licensed_music.py` fails off-Mac with FileNotFoundError on that path.
5. **MEDIUM — Food defaults leak into an idea-agnostic engine.** Near-identical food regexes in `add-sfx.py:221` and `prereview-local-video.py:30`; 33 scripts reference food words; non-food looks disable the prompt gate via `SHORTS_MIN_PROMPT_SCORE=0` rather than a look profile.
6. **MEDIUM — Thresholds scattered and weakly calibrated.** `MIN_MOTION = 2.0` from one sample (`prereview-local-video.py:187`); ASMR gap floor (95th-percentile ×0.08, changed 2026-11-17) no longer flags long action-free stretches; prompt score 85. No single config, no calibration tests.
7. **MEDIUM — Three finishing editors + TS renderer** (`finish-local-video.py`, `artcraft-finish.py`, `filmcraft-finish.py`, `VideoRenderer.ts`). All needed; but output spec (size/fps/loudness/captions) is only enforced afterwards by `qa-local-video.py`, not as a shared spec.
8. **LOW — Hygiene.** 13 `.pyc` tracked despite `.gitignore:39` (show as modified in every status); `src/cli/assembleEpisode.ts.bak`; flat 181-entry `scripts/`; dish-specific entry points (`chocolate-short-local.sh`, `gold-steak-local.sh`, `steak-crust-local.py`) in `package.json`. No CI (`.github/workflows` absent).
9. **LOW — State in JSON files without locking**; "Up next" queue lives only in browser localStorage. Acceptable for one Mac / one job, a limit for hosted or multi-user.

## C. Roadmap (small phases, impact / risk / effort)

| Phase | Work | Impact | Risk | Effort |
|---|---|---|---|---|
| 1 | Structured pipeline events (additive) + runtime resolver + characterization tests + pyc untracking | High (reliability, per-shot UI, retry) | Low | S–M |
| 2 | Scenario v1 JSON Schema + validators (Py + TS type), warn-only in preflight, then enforce | High (continuity across engines) | Low–Med | M |
| 3 | Split `studio-server.mjs` into auth / jobs / media / learning modules, same routes, plus route tests | Med | Med (auth) | M |
| 4 | Look/genre profile config (one file) replacing food regexes and the score-0 bypass; central thresholds with provenance | Med–High (idea-agnostic) | Med | M |
| 5 | Shared output spec checked by every finisher; MotionEngine local-LTX adapter consuming Scenario v1 | High (hosted path) | Med | L |

## D. Preservation matrix (must keep working)

Studio: draft → first frames → regen/retake → render; auth + relatives + quotas; SSE; Range media; sessions; learning ledger; compare; Arabic voice tools. Local engine: brief/repair/redraft loop, all gates (prompt, preflight, story, evidence, sound audit, vision, motion, QA, score), `--chain-images`/`--anchor-image`/`--stills-only`/`--shot-only`/`--cache-only`, frame/manifest hashing, seed bumps, three editors + `auto`, provenance, prereview. TS: create-short/pipeline/automate CLIs, YouTube upload, SQLite repos, hosted MotionEngine contract + tests. Legacy (keep, do not extend): Remotion prototype, `create_video.py`, PowerShell/Flow.

## E. Quality baseline

Run today in the Cowork Linux VM (not the Mac):
- VERIFIED: `tsc --noEmit` passes; `node --test scripts/*.test.mjs scripts/test-*.mjs` 59/59 pass; Python `scripts/test_*.py` 28/29 pass (1 environmental: hard-coded Mac venv path).
- NOT RUN: `vitest` (Mac-native `node_modules` cannot load in the VM), lint, Studio build, any render.
- Reported by the previous handoff, not re-verified: vitest 154 tests, Python 133, Studio build OK.
Media evidence: hotel-hot-dog baseline 45/100 (`storage/baselines/hotel-hot-dog-20261114/`); food-motion-testset 9/10 clips, **no human blind scores**; Wan smoke video lost unwatched. No cross-genre or landscape benchmark exists, so no quality-improvement claim can be made yet.

## F. Proposed first phase (awaiting approval)

1. Characterization tests first: capture stdout + exit code of `make-local-video.sh --draft-only` and gate scripts on 4 fixture scenarios (food, cartoon, night, a deliberately blocked one); assert today's UI parsing (notes, blocked, choice, stage) on those transcripts.
2. Add `scripts/pipeline_events.py` and `scripts/pipeline-events.mjs`: one-line JSON events (`@@event {"type":"gate","gate":"sound","status":"blocked","shot":2,"code":"asmr-gap","message":...}`) printed **in addition to** the existing text. Emit at the gate points in `make-local-video.sh`, `add-sfx.py --audit`, `audit-local-story.py`, `preflight-short.py`, `render-any-local.py` progress.
3. `studio-server.mjs`: collect events into `job.events`; `studio/src`: prefer events, fall back to text (no visible change except per-shot fixes).
4. Runtime resolver: `SHORTS_MEDIA_PY` (default = current ComfyUI venv path) used by `make-local-video.sh` and tests; same behaviour on the Mac.
5. `git rm --cached` the 13 `.pyc` (files stay on disk) — needs your OK.
Expected: gate failures carry shot + code, retries key on codes not wording; tests runnable off-Mac. Risks: event lines leaking into captions/logs (mitigation: prefix filter, tests); concurrent edits by other agents to the same files (rebase on current main first).
Validation (on the Mac): `npm run build && npm run lint && npm test`; `node --test scripts/*.test.mjs scripts/test-*.mjs`; `storage/tools/scenedetect/.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'`; `cd studio && npm run build`; one `--draft-only` and one `--stills-only` run on a fixture through the Studio on a spare port; diff characterization transcripts.

## G. Future opportunities (after refactoring)

Scenario v1 as the single shot/timeline contract for local and hosted engines; local-LTX `MotionEngine` adapter, then a hosted adapter behind spend caps; cross-shot identity validation (embedding similarity on stills) feeding retries; per-look profiles (food, cartoon, realistic, 3D) instead of food defaults; calibrated quality scoring from human blind ratings; benchmark suite across genres and both orientations with time/cost tracking; CI on a macOS runner for the Mac-native suites.

## Note on earlier Claude work

The 2026-11-17 iShorts UI/UX pass was started in the `shorts-app-artcraft-title` worktree (base `a583d28`): `studio/src/extras.jsx` patched (StageBar, jobState, ShotPlan, ExportReview, radio-group looks), `/api/me` extended in `studio-server.mjs`, `App.jsx` not patched, nothing built or tested. Main has since moved far (App.jsx 886 lines). Treat that worktree edit as stale; redo the UI/UX brief on current main after phase 1.
