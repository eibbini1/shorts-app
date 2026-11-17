# iShorts Studio system health report

**Audit date:** 2026-11-17  
**Mode:** audit plus approved Phase 1 UI, idea-hint, and documentation work  
**Evidence snapshot:** GitHub `main` merge `77d601f`; reviewed source commit `eacff65` has the same tree (`6a38fcf3af855cf94fbbbb930a12ac9fb414b85c`).  
**Working branch:** `fix/phase1-system-health`, isolated worktree. No other checkout was switched or cleaned.

## Summary

The local pipeline produced a technically valid 10-second export, but not a convincing food-cutting scene. The final report is **blocked at 50/100** (editorial evidence absent), and the motion pre-review marked both shots `review-required`; nevertheless, Studio marked the render job done. This exposes a gap between “render completed” and “creative review passed.” A separate same-prompt project failed before media generation after three attempts. Sidebar titles truncate prompts, making the two sessions look like a repeated job.

No P0 incident was confirmed. The highest risks are confusing project/session status, weak shot-to-shot continuity validation, and several competing/dirty source checkouts. The isolated UI build and authenticated Studio API startup passed. The active `8787` service was queried read-only; it was left running. No new model render, paid call, install, or merge was started by this audit.

## Repository and worktree evidence

- PR #22 is merged. GitHub `main` is `77d601faf78ec906f485d9afa996258aea486967`; there are no open pull requests.
- `eacff65a5fb67361a69affe5828a9673cdfa7c18` is the second parent of that merge. Its tree hash equals `main`’s tree hash, so it is an exact content snapshot of merged `main` despite its pre-merge commit ancestry.
- The original `/Users/eibbini/Documents/shorts-app` checkout remains on `integrate/claude-codex` at `a332abd`, with many modified and untracked files. It is not a clean `main` checkout.
- Other local worktrees include `feature/artcraft-title-polish` (`a583d28`, behind its remote and dirty), `feature/evidence-gates-local` (`2bd9c87`, generated outputs and bytecode changes), `feature/arabic-artcraft-recipe` (`12d478b`, ahead one commit), `feature/asmr-presentation-mode` (`f515a8f`, dirty), and `feature/artcraft-merge-review` (`8c709be`, bytecode change). Preserve these; do not bulk-sync or reset them.
- The audit worktree is `shorts-app-phase1`. Its source base matches the merged main tree. Its `studio/node_modules` is an ignored symlink to an existing dependency tree; no package install occurred.

## Feature inventory

| Feature | Status | Evidence and limits |
|---|---|---|
| Studio interface | **Partial, startup verified in isolation** | Vite production build passed. An isolated local server on port 8788 served the UI and authenticated `/api/me` as owner; API state was idle. The live 8787 API was read-only queried. No browser-driven visual regression suite was available. |
| Prompt → plan → stills → render → QA | **Partial** | The real 10-second render completed in 10m08s and exact-file technical checks passed. Its creative quality report is blocked at 50/100; motion pre-review has `review-required` for both shots. Another same-prompt draft failed its story gate after three attempts. |
| FLUX still generation | **Working in recent production evidence; current service unavailable to this audit shell** | First frames for the older pasta project exist and passed its still check. `doctor:local` could not reach local Ollama/ComfyUI endpoints; no fresh model invocation was made. |
| LTX motion | **Working, slow, variable visual quality** | The inspected 10-second tomato/pasta output is 1080×1920 delivery from 384×640 native sources. Sampled frames show unstable knife/hand interaction and tomato geometry; the action does not read as reliable real chopping. This is direct visual review of sampled frames, not a full artistic review. |
| FFmpeg assembly/finish | **Working** | Cached dumpling export passed all six technical QA checks. This validates technical finishing, not picture or sound artistry. |
| Remotion | **Partial / separate prototype** | `mini-chef-studio` has a Remotion/Three.js stack, but the main local Short command does not use it as its primary renderer. Production integration is unverified. |
| ArtCraft | **Partial; headless tools unavailable in current environment** | PhotoCraft, FilmCraft, EffectCraft, and SoundCraft desktop apps were found, but their CLIs were missing in the environment check. Code contains optional integration; the GUI install alone does not enable headless runs. |
| Voice | **Partial** | Kokoro is present in the local voice path; Chatterbox/Sofelia Arabic work is experimental. Technical QA cannot verify dialect, pronunciation, or natural delivery; a native listen is required. |
| Sound and Foley | **Partial** | Mix-level measurements and source gates exist. A passing loudness check does not establish realistic or synchronized kitchen sound. No one in this audit listened to the film audio. |
| Captions | **Partial** | Caption generation and Arabic RTL examples exist. Phrase timing, legibility over every shot, and Arabic transcription/pronunciation require review against the actual voice and frames. |
| Technical and creative QA | **Technical path working; editorial gate intentionally incomplete** | Exact-export QA is hash-bound and checks black, freeze, loudness, silence, duration, and early hook. Visual prereview is advisory. It cannot certify story continuity or artistic quality. The export screen now displays its findings prominently, while leaving the human review decision with the creator. Newly added UI makes flags prominent but does not yet block generation or establish human approval. |
| Creative Learning | **Evidence logging working; autonomous learning not implemented** | Existing SQLite records exact assets/reports and pending human feedback. It does not retrain models or automatically promote creative rules. |
| Trend/idea support | **Partial** | Local model ideas, source labels, and persistent history have tests. The latest two pasta ideas had no verified trend match. A model idea is not trend evidence. |
| Hosted GPU preparation | **Planned** | `docs/HOSTED_VIDEO_ROADMAP.md` describes a MotionEngine and provider plan. No RunPod/Vast provider, spend ledger, job queue, or automatic shutdown is implemented. |

## Reference video intelligence: existing capability and gap

- Reuse `scripts/creative-learning.mjs` and `docs/CREATIVE_LEARNING_ENGINE.md`; do not create a parallel database or analyzer. Its rights-gated `ingest` requires owner, source, evidence, analysis permission, and a separate reuse permission. `analyze` verifies the local file's SHA-256, probes streams/duration with `ffprobe`, detects cuts with the installed PySceneDetect wrapper, and measures FFmpeg audio windows, loudness, peaks, and silence. It refuses references longer than five minutes.
- Human-reviewed technique records can be approved, tagged by genre/format/audio/editor, retrieved for future plans, and revoked. Analysis does not copy reference footage/audio and is not wired into production by default.
- Current analysis does **not** reliably infer camera framing/movement, subject action, match cuts, music identity, or physical realism. Those fields require timestamped human observations. The reference workflow also needs a contact sheet and review form for those annotations before its lessons can improve prompts.
- The supplied YouTube Short was not inspected: vidIQ required 10 credits and had no balance; no credits were charged. Direct page retrieval was unavailable. Therefore no scene, music, performance, or editing claims are made about this reference.
- Smallest safe next reference slice: accept an authorized local video (or separately verify a lawful direct source), ingest with a rights manifest, produce time-coded cuts/audio diagnostics and sampled frames, ask the user to confirm/edit observations, then store only approved abstract techniques. Retrieve those techniques as optional storyboard guidance. Compare one controlled output against the baseline before changing defaults.

## Current same-name sessions

The authenticated live API distinguishes two separate session IDs:

- `1794943568367`: same tomato/pasta prompt; render is complete. Exact export: `guided-20261117-222904-4a2cc0-20261117-224351.sfx.artcraft.mp4`. It is 10.005 seconds, H.264 1080×1920 at 24 fps, from 384×640 native clips. Technical checks passed, but the quality report is 50/100 and `blocked`; no editorial review evidence is recorded. Motion pre-review marked both shots `review-required`. Sampled frames show a knife/hand pose and tomato cut that look synthetic. The two storyboard stills skip from raw tomatoes to plated pasta.
- `1794944009646`: a newly drafted duplicate prompt. It failed after three story attempts. The saved plan was blocked because shots 1 and 2 had near-identical motion prompts; no FLUX or LTX work was started for this session.

Both sidebar titles are derived from the same shortened prompt. Thus the UI makes separate projects look duplicated. Internal model retries also created multiple timestamped brief files, but did not create the two sidebar session IDs. The raw idea names chopping and pasta but has no explicit ending; the draft logic reused the whole prompt as the ending. The failed duplicate's story gate caught repeated motion only after all three draft attempts. The completed render demonstrates another gap: technical QA and job completion do not mean the motion looks physically credible, and `review-required` pre-review does not currently prevent a completed job state.

## Validation run

| Check | Result |
|---|---|
| `npm test -- --configLoader runner` | **103/104 passed** on the latest run; one real-FFmpeg integration test hit its configured 300-second render timeout after about 8m42s. An earlier pre-change 100-test suite passed after allowing the loopback callback. |
| Python `unittest discover -s scripts -p 'test_*.py'` | **89/89 passed** with loopback available. |
| Focused Node workflow tests | **5/5 passed**. |
| Root TypeScript build, ESLint, `scripts:verify` | **Passed**; script verification checked 74 npm entries and syntax of 106 Python, 18 shell, and 39 Node scripts. |
| Studio Vite production build | **Passed**. The new appearance theme also builds in the isolated worktree. |
| Cached dumpling final-file QA | **6/6 passed**, 10.01 s, −15.55 LUFS, −4.38 dBTP. Source was 384×640; 1080×1920 delivery is upscaled. |
| Tomato render review | **Technical QA passed; creative release blocked at 50/100.** 10.005 s, H.264 1080×1920 at 24 fps. `review-required` for both motion shots; sampled knife/hand action looks synthetic. |
| Idea helper regression tests | **4/4 passed**; handles “chopping” and other inflected actions, recognizes the separate ending field, and retains a targeted warning for vague prompts. |
| Export review status tests | **4/4 passed**; surfaces screen flags prominently without presenting machine findings as an artistic verdict. |
| `npm run doctor:local` | **Environment check incomplete**: it reported Node 22.23.4 and FFmpeg 7.1.1, but could not use the `uv` cache and could not reach local model services from this shell. This is not evidence that the owner's Mac installations are absent. |
| `npm run artcraft:check:mac` | Desktop apps found; all four headless CLIs reported missing. |
| Studio isolated startup/auth check | **Passed** on port 8788; owner authentication and idle API state verified, then the test server was stopped. |

## Prioritized Phase 1 fixes

| Priority | Fix | Viewer/user impact | Risk | Effort |
|---|---|---|---|---|
| **P1** | Make project status and continuation explicit: distinguish planning, first frames, render, and finished video; offer “continue this project” before creating a same-prompt duplicate. | Prevents needless redrafting and confusion over whether a video exists. | Low; preserve sessions and add duplicate warning, never auto-merge user projects. | Small–medium |
| **P1** | Improve the story gate’s per-shot action check and repair prompt. Require distinct physical actions and a concrete final payoff; reuse already-good first frames where possible. | Prevents obvious repeated-motion stories from consuming retries or reaching generation. | Low if gates remain fail-closed; test food and non-food plans. | Medium |
| **P1** | Add a continuity review across first frames (subject, dish, tools, set, action stage), not just independent still acceptance. | Catches discontinuous scenes before costly LTX clips. | Low; advisory findings must not silently override human review. | Medium |
| **P2** | Reconcile local checkouts from the exact merged-main tree, preserving every dirty branch and generated asset. | Establishes one auditable base for subsequent fixes. | Medium because of many local edits; no resets or bulk cherry-picks. | Medium |
| **P2** | Clarify ArtCraft CLI prerequisites and FFmpeg fallback in Studio/doctor output. | Prevents an installed desktop app from being mistaken for an available automation backend. | Low. | Small |
| **P2** | Move Up Next from browser `localStorage` to a recoverable server-side queue with per-job status/cancel. | Queue survives browser/profile changes and has truthful progress. | Medium; requires migration and queue concurrency tests. | Medium–large |
| **P3** | Keep native-resolution choices behind measured Mac benchmarks; current 1080 export is not native 1080 detail. | Improves image detail if hardware allows. | High memory/runtime risk on 16 GB; do not change defaults without approval. | Medium |

## Approved appearance update

Added a selectable **Codex dark** Studio theme with charcoal surfaces, soft-gray text, and a blue accent inspired by the supplied screenshot. It is stored through the existing theme preference and leaves Studio, Night, and White themes intact. The palette is a visual match, not a pixel-identical copy of Codex's private UI assets. The theme is built in the isolated worktree; it has not been deployed to port 8787.

## Next actions

1. Add a distinct state for `rendered; creative review required`; keep a 50/100 result blocked from “ready” or release wording while leaving the file playable for review.
2. Improve risky-action review: require sampled motion evidence for hand/tool/food actions, and stop or request a human choice when the local vision model cannot confirm the intended action. Treat model judgments as conservative flags, not proof of realism.
3. Verify local-AI refinement in the owner Mac Studio with Ollama available; deterministic validation cannot establish story quality.
4. Run a controlled sound-cue comparison on identical cached footage, then complete Studio capture of human review and approved technique retrieval.
5. Reconcile local checkouts only after reviewing every dirty worktree. Do not deploy this branch over the live Studio without a separate release review.

## Idea refinement implementation (2026-11-18)

- **IMPLEMENTED, local only:** Studio has a “Refine idea with local AI” action. It preserves the original text until the user explicitly selects a proposed version. For a filmable idea the local Ollama model returns one polished prompt and ending; when the story intent/action is materially ambiguous it returns one focused question and 2–3 distinct alternatives.
- **Gate behavior:** suggestions do not start planning or rendering. Malformed model output is rejected, active renders block refinement, and the examples/refinement calls share a local-model busy lock. Editing the prompt, look, or ending discards stale suggestions; a late response cannot overwrite the edited idea.
- **Limits:** local Ollama was unavailable in this Codex environment (`127.0.0.1:11434` refused the connection), so live prompt quality and Studio browser interaction remain **untested**. Deterministic response-shape tests and both production builds passed. The feature is not deployed to the running Studio.

## Duplicate-project and action-gate follow-up (2026-11-18)

- **IMPLEMENTED, not deployed:** repeated sidebar names now show their creation time; the Studio detects a matching prompt and offers to open the existing project or intentionally create a separate one. Automatic Up Next remains able to repeat a user-queued idea without an interruption.
- **IMPLEMENTED, locally tested:** the story builder now rejects camera-only pan/zoom/beauty-shot language as the sole shot motion, asks the model for one subject action plus a changed end state, retries once, then uses its beat-specific fallback or blocks saving if no physical action remains.
- **Limits:** this is a conservative English verb check. It does not establish correct physics, realistic hand/tool contact, continuity, or quality, and it may need expansion for other languages. No Ollama-backed scenario was generated because the service was unavailable here. The new timeline makes adjacent samples reviewable but does not automatically prove within-shot or cross-shot continuity.
- **Validation:** action gate 3/3, idea refinement 6/6 Node tests, focused Studio tests 11/11, root build/lint/script checks and Studio build pass. Full video-render integration was not rerun.

## Phase 2 timestamped action checkpoints (2026-11-18)

- **IMPLEMENTED, synthetic-smoke verified:** final-file prereview now extracts frames shortly after each shot starts, at its midpoint, and shortly before its end. The output contact sheet labels each frame with shot number, stage and timestamp. The exact-export report records the same times and planned action.
- Studio exposes this as **Shot action checkpoints** with the planned action beside each shot. The image is shown only when its checksum matches the hash-bound prereview for that export. The UI clearly asks the person to compare start/middle/end; it does not call this an AI realism verdict.
- **VERIFIED:** a four-second synthetic, two-shot video produced six labeled frames and a contact sheet. `--skip-vision` was used, so no model judgment was involved. The synthetic sine audio correctly triggered the loudness warning, providing a check that the existing audio gate still runs.
- **Remaining Phase 2 work:** actual food/cartoon film review of the new sheet; a controlled baseline-versus-candidate Foley test on identical picture; human confirmation of event timing. The current automated vision review still asks about middle frames and the final payoff only.

