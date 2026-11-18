# iShorts cinematic quality and evidence plan

17 November 2026. Design for approval. This document authorizes no implementation.

## 1. Current reality

Repository inspection on this date found GitHub main at 4a1f4da and open, mergeable PR #22 at 218412c. The clean isolated local branch fix/studio-workflow-hardening is at 20360f0, which includes later tested fixes. The active Claude ArtCraft checkout remains at a583d28 with uncommitted code and documentation. These states must be reconciled before rollout. The last authenticated live inspection showed the earlier UI. No current live render state is inferred from that older inspection.

| Area | Implementation and evidence | Limit |
| --- | --- | --- |
| Studio workflow | Prompt, draft, stills, regenerate, motion, finishing, QA, player and feedback exist. 100 JavaScript and 86 Python tests passed on 20360f0, including a synthetic API workflow and build. | A fresh original prompt through actual models and complete editorial review is pending. Synthetic workers establish orchestration behavior. |
| Hardening | Local 20360f0 adds a draft watchdog, selected-frame hashes, stale-ending reset, server-driven unattended chain, stopping lock and safe media ranges. | These fixes are ahead of PR #22 and live rollout is pending. |
| Motion | Local FLUX.2 Klein and pinned LTX-2.3 MLX; cached clips, first-clip checks, first-frame vision checks, anchor/chained-image options and motion retakes. | The motion measure is global pixel change. It cannot establish completed action, believable physics or stable identity. |
| Editing | Existing FFmpeg assembly, montage and transitions, FilmCraft/SoundCraft finishing, Remotion graphics and chef compositions. | Features differ by entry point. A transition existing in one script does not establish its use in Studio. |
| Audio/captions | Foley cue audit, recordings-only support, mastering, voice processing, captions and Arabic voice preparation/review commands. | Synthesized cues have received negative owner feedback. Correct peaks and silence measurements do not establish realistic sound or Arabic pronunciation. |
| Final QA/release | Exact-file QA checks black frames, freeze, loudness, peaks, silence, duration and opening. Existing release scorer requires exact-file human evidence for the editorial portion. | Studio feedback is a separate lighter log. Final prereview is advisory. |
| Creative Learning | Standalone SQLite CLI ingests rights/provenance, analyzes references, versions approved techniques, retrieves by applicability, records exact-file evidence and paired preferences. | Pilot plan/compare supports portrait ASMR/FFmpeg. Live storyboard retrieval and Studio editorial integration remain incomplete. |
| Resolution | Inspected cached LTX clip: 384×640, 24 fps; assembly: 720×1280; earlier ArtCraft delivery: 1080×1920. | Higher delivery dimensions are upscales. Native detail and motion must be judged on source media. |
| Cloud | A provider-independent MotionEngine direction and cloud proposal already exist. | No measured LTX-2.5/Wan comparison, deployment or paid run is part of this phase. |

The existing architecture and roadmap retain historical status and contradictory resolution/default-editor descriptions. Keep history, add a current verified snapshot, and link it from the top of those documents.

### Systems to reuse and duplication to control

Reuse scripts/render-any-local.py for model calls, scripts/make-local-video.sh for orchestration and finishing, scripts/qa-local-video.py for technical results, scripts/prereview-local-video.py for advisory review, scripts/record-editorial-review.py and score-local-video.py for release evidence, and scripts/creative-learning.mjs for memory.

The TypeScript platform, local shell renderer and older montage commands overlap. Keep each supported path and share structured results at their boundaries. Studio JSONL feedback, shot-reviews examples, quality-score history and the SQLite technique bank have distinct evidence meanings. Link their records by scenario, attempt and file hashes before adding another learning store. Do not unify scoring by copying values between them.

## 2. Top ten quality problems

Priority reflects consequences for delivered films. Existing local fixes are identified separately from proposed work.

| Rank / priority | Finding and evidence | Viewer consequence | Proposed response |
| --- | --- | --- | --- |
| 1 / P0 | Brief context leaked the sunflower ending into a halloumi story. The owner supplied the failed plan; browser verification confirms the local reset fix. | The film tells the wrong story. | Carry 20360f0 into the review baseline. Test submitted payload and final payoff against the revised brief. |
| 2 / P0 | Studio prereview currently selects the newest report matching a scenario, without confirming it matches the displayed export. | Retake decisions can use another take's flags. | Bind prereview to exact video hash and expose pending/unavailable/stale states. |
| 3 / P1 | The motion advisory uses a provisional global-change threshold. Prior fox evidence showed an ending could pass a still-image question without travel. | A push or morph can satisfy a motion number while the action fails. | Review start/middle/end evidence and intended action, retain numerical checks as advisory. |
| 4 / P1 | Shared prompts and chained stills provide no measured identity guarantee across motion clips. | Hands, ingredients, clothing and props can change. | Pin visual references and record specific continuity constraints; compare adjacent boundary frames and full clips. |
| 5 / P1 | ASMR checks can pass with a room bed and weak action coverage; some non-food cues came from food templates. | Sound feels unrelated or artificial. | Separate room coverage from action-event coverage. Use approved recordings for a small set of real actions. |
| 6 / P1 | Native motion is substantially smaller than delivery size. | Food texture and tiny hand/utensil detail degrade. | Report source and output dimensions separately, then benchmark one opt-in size with matched prompts. |
| 7 / P1 | Long drafts, duplicate work after premature cancellation and misleading draft milestones were reproduced. Local fixes passed fixture tests. | Waiting becomes unpredictable and bad plans waste production time. | Integrate the watchdog and stopping lock, then measure a real short workflow. |
| 8 / P1 | Final payoff screening samples a frame and hook QA establishes an early visible frame. | The opening can be visually weak and the ending unearned despite passing QA. | Add timestamped human questions about the promised action, reveal and ending, using existing reports. |
| 9 / P2 | Montage capabilities vary across local/TypeScript/ArtCraft/Remotion paths; speed ramps and effects may change timing. | Pace, voice and captions drift when finishing changes. | First compare a single duration-preserving edit on identical cached footage. Check action, sound and caption alignment. |
| 10 / P2 | Arabic pronunciation feedback is valuable but local delivery and automatic caption alignment remain incompletely verified. | Mispronunciation or late captions break a polished recipe. | Use existing full-sentence voice profiles, approved phrase corrections and exact-take native review. Keep caption evidence linked to that take. |

Security range crashes and cancellation were P0 operational defects already reproduced and fixed locally. Their regression tests must stay in the reviewed baseline.

## 3. Fix plan

| Work | Exact modules | Minimal change | Test and risk |
| --- | --- | --- | --- |
| Incorporate existing hardening | scripts/studio-server.mjs, render-any-local.py, studio_frames.py; studio/src/App.jsx and extras.jsx | Reconcile 20360f0 with current PR and local differences. Keep supported CLI defaults. | Existing fixture suite; old Studio sessions need a fresh first-frame job. No rollout before approval. |
| Exact-export advisory report | scripts/studio-server.mjs /api/prereview; studio/src/App.jsx and extras.jsx | Validate report videoSha256 against selected export. Return explicit pending/unavailable/stale/complete. Preserve old file while loading the new report. | Two takes with deliberately different flags; missing report, modified media and fetch failure. Avoid hashing large exports on every polling tick; cache by immutable export identity with invalidation. |
| Timestamped review | scripts/prereview-local-video.py; record-editorial-review.py | Extend existing report with per-shot time windows, source observations, unchecked conditions and suggested actions. Use several frames for action review. Preserve existing fields and scorers. | Deterministic still/freeze/moving-pattern clips, unavailable vision, short clips and real cached media. Pixel movement and vision responses remain advisory. |
| Review in Studio | studio/src/extras.jsx; scripts/studio-server.mjs | Collect existing five editorial ratings and review attestations with reviewer/file identity. Reuse the current review-record builder and scorer. | Refuse incomplete reviews and stale exports. Save ratings before displaying a completed review. The person supplies the ratings. |
| Sound pilot | scripts/add-sfx.py; artcraft-finish.py; existing recorded-Foley tests | For one authorized recording and action, compare cue placement and balance on identical picture. Keep intent-specific rules. | Baseline and alternative share picture and loudness target. Verify timing and listen. One winning recipe cue is insufficient for a universal audio rule. |
| Evidence retrieval | scripts/creative-learning.mjs; studio-draft.py; existing shot review retrieval | Offer at most three applicable, approved technique summaries with provenance and rationale. Record the chosen revision in the brief. Keep suggestions optional. | Rights revoked, unsupported genre/editor, unapproved technique and no matches. A reference observation stays separate from a technique validated in our own output. |
| Resolution provenance | scripts/render-any-local.py provenance; export review UI | Probe native clips and output separately and show both, including heterogeneous sources. | Native, upscale and mixed-source fixtures. Do not infer native detail from output dimensions. |

No new model, library or vector database is needed for the first phase. The provider-independent cloud boundary stays planned and separate. No model recommendation or replacement is made by this audit.

## 4. Creative Learning architecture

The existing SQLite reference and technique store remains the knowledge source. The existing QA files, editorial records and experiment artifacts remain evidence sources. Add relationships and missing validation within these components.

1. An authorized reference is registered with its media hash, rights scope and provenance. Extract cut and audio timing where measurable. A human records framing, motion and lighting interpretations separately from direct measurements.
2. A candidate technique contains applicability tags, a reference timestamp, revision, explanation and conditions. A reviewer may approve it as an available suggestion. That approval alone establishes no performance benefit in iShorts.
3. Retrieve applicable approved suggestions for a brief. Save the selected technique revision, storyboard, prompt/model versions, seed, native geometry, audio assets and expected event timing.
4. Produce a baseline and a candidate on identical cached media when testing editing or audio. For model tests, hold conditioning, intended action and output targets fixed and record deviations. Record actual runtime and cost, including failed attempts.
5. Run exact-file technical QA and obtain full watch/listen ratings and a paired editorial preference. Preserve failures and negative results. Keep accepted and rejected variants.
6. Only label a technique as supported by production evidence when a complete paired comparison links it to the reviewed files. Broader recommendations need repeated outcomes across relevant scenes. Retire or revise techniques with a reason and preserve previous evidence.
7. Later join authorized publication IDs to retention, watched/swiped and engagement snapshots, with publication age and context. Report associations and sample size. One successful upload cannot establish that an edit caused its performance.

Studio thumbs are useful issue reports. They cannot substitute for a full editorial record or an A/B result. Approved reference study can improve the available creative vocabulary without being described as model training. Repeated use of verified technique revisions improves the planning system only to the extent demonstrated by reviewed productions.

## 5. Ninety-day roadmap

Dates are planning targets from approval, subject to local render capacity and editorial availability.

| Period | Deliverable | Exit evidence |
| --- | --- | --- |
| Days 1–7 | Reconcile hardening, exact-export advisory status, truthful native resolution, one short real workflow | Saved prompt, matching frame manifest, rendered file, exact-file QA and owner review; measured time and failure log. |
| Days 8–21 | Timestamped action/continuity review and one sound synchronization experiment | Matched baseline/alternative on cached media; listener preference and action completion findings. |
| Days 22–35 | Studio editorial capture and approved-technique retrieval pilot | Evidence survives refresh, stale file refused, chosen technique revision in the next brief; no fabricated improvement statement. |
| Days 36–50 | Consistency tests across food and one animation style; caption and Arabic review | Repeated-subject comparison and native-speaker review tied to final video/audio files. |
| Days 51–65 | Pacing and hook experiments, one transition at a time | Duration and alignment checks, paired blind review and failure yield across several clips. |
| Days 66–80 | Separately approved native-size/cloud benchmarks if needed | Measured accepted-clip cost, cold/warm time and visual preference. Keep the proven default until the result supports a change. |
| Days 81–90 | Repeated production validation and optional authorized analytics join | Multiple reviewed original films, reproducible comparisons, documented limits, recovery evidence and a prioritized next release. |

Success is reliable production and supported editorial gains. A 90-day schedule does not establish parity with a frontier generation model or a viral outcome.

## 6. Phase 1 proposed for approval

Use local branch 20360f0 as the hardening candidate and reconcile it into the review branch after inspecting any new changes. Implement only exact-export prereview binding, explicit unknown states in export review and native-versus-delivery resolution reporting. Reuse the existing QA, provenance and UI components.

Start with synthetic clips and the existing Moonlit Voyage replay. Use the two-take fixture to prove that a new take cannot inherit an old verdict. Verify both missing and unavailable reviews remain visible. Show the source/output sizes and run the existing release-evidence tests. Rebuild the UI and verify the finished-export view and new-take transition in the browser.

Approval for Phase 1 covers these bounded code changes and cached/synthetic checks. A real local model run, live rollout, paid provider calls and model downloads are separate actions under the owner's existing constraints. Estimate one focused implementation pass plus review, with final-file metrics and human preference pending actual evaluation.

The next phase is one audible and visible Foley alignment comparison. It follows the report-integrity fix so its result can be evaluated against the correct export.
