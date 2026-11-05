# Shorts app goal and continuation plan

Updated November 4 2026.

## Objective

Improve and fully automate the Shorts app, preserving existing work and informed
by the BB channel and supplied Shorts. Finish hook logging, improve reliability,
resolve production dependency vulnerabilities, and verify safe end to end runs.
The active working copy is D:/shorts-app on feature/hook-log. The original C drive
copy remains. The existing GitHub repository is eibbini1/shorts-app.

The creative end goal also includes realistic image to video generation.
The user's Seedance on Higgsfield reference defines the desired visual result.
Camera moves over photographs alone do not satisfy this requirement.
Support Shorts and long videos and allow subjects beyond luxury food.

## User decisions

- Generate drafts for review before paid generation.
- Cheese crystals, 2012 chocolate auction and saffron towers are approved as
  content. This approval does not authorize paid voice or image generation.
- Publish on a schedule after YouTube connection. The connection is established.
- Preserve the existing branch and uncommitted work.
- Use D drive for the project to save C drive space.
- Push verified work and this plan to the existing GitHub repository.
- The user has an Apple M1 MacBook Pro with 16 GB unified memory.
  macOS version and access to that machine remain pending.

## Verified implementation

- Hook logging is wired into the pipeline and existing episodes are deduplicated.
- Draft generation, content approval, cached narration, rendering, metadata,
  thumbnails, subtitles, QA and pack verification are implemented.
- Windows scheduled worker is installed, with process ownership and overlap locks.
- YouTube OAuth, expected channel checks, upload journal and daily scheduling
  are implemented. Ambiguous uploads are protected against automatic duplicates.
- A changed local video is flagged when the journal already records a scheduled
  upload. Review is required to reconcile the local and uploaded versions.
- Portrait and landscape scene rendering accept optional local video footage.
  Short clips repeat to cover narration. Source audio is discarded.
- Supplied Golden Fries footage passed portrait and landscape rendering checks.
- The 10 second car test exported at 1080 by 1920 with local narration, captions,
  camera moves and sound. It uses photos and does not prove generated movement.
- Draft briefs accept a custom visualStyle, preserving the BB default.
- Video fingerprinting streams file contents to reduce memory usage.
- Production dependency audit reported zero vulnerabilities.
- Build and lint passed. Publishing regression tests passed.
  Final verification passed 94 tests across 20 test files on November 4 2026.

## Current publishing evidence

The authenticated YouTube status check found all five videos on
UCfZ7tQ-hjo5OxRhZmFr775A, processed successfully.

- Tuna f0g4AfdC-lg was public at verification.
- Melon 6tyuzyYi1kw was scheduled for November 4 at 17:00 UTC.
- Coffee 5MqXL-pydqI was scheduled for November 5 at 17:00 UTC.
- Cupcake P-jmLtHzsUI was scheduled for November 6 at 17:00 UTC.
- Ortolan BsxiRUIhcBM was scheduled for November 7 at 17:00 UTC.

All five local packs were rebuilt and verified afterward. The publisher reported
that their file digests differ from the uploaded versions. Do not claim those
uploads contain the latest local render. Inspect current remote state before
any reconciliation. Never clear journal records to force a new upload.

## Remaining work

### Real image to video generation

1. Obtain the Mac chip, unified memory, macOS version and access method.
   scripts/check-mac-video.sh provides a read only inventory.
2. Select a compatible image to video model and runtime from primary project
   documentation. Verify licensing, supported precision and actual memory needs.
3. Integrate the selected runtime through the normal app workflow, with persisted
   job IDs, bounded polling, retries that avoid duplicate spending, input hashes,
   cancellation and resumable output downloads where applicable.
4. Record the source image, motion prompt, model version, seed when supported,
   duration, output clip, generation time and cost.
5. Generate a 10 second prototype with visible movement inside the scene.
   Review identity, geometry, texture, physics, flicker and loop seams.
6. Add matching narration, captions and sound and review the full exported Short.
7. Preserve paid generation approval. A provider connection alone does not
   authorize spending.

The Windows MX330 has 2 GB VRAM. This is an observation about this PC, not a
constraint on the user's separate Mac. No model has been validated on that Mac.
No Seedance equivalent quality claim is currently supported.

### Hooks and appetizing motion

- Open with action in the first second.
- Test a specific unanswered question with a visible payoff before the ending.
- For food, use appropriate action such as falling salt, pouring sauce, steam,
  sizzling surfaces or a food reveal. Review actual appearance shot by shot.
- Reduce repeated generic opening phrases.
- Verify hook promises against the narration and the final reveal.
- Use the experiment analysis document prepared in this chat as the test design.
  Proposed thresholds are planning choices, not proven channel benchmarks.

### Channel research and evaluation

- Review actual BB analytics exports and current Studio data.
- Build an auditable comparison set of relevant successful channels and clips.
  The requested research across 100 channels remains unproven in this handoff.
  Record sources, dates, selection rules and observations.
- Compare new and old Shorts at equal age windows and similar traffic sources.
- Track stayed to watch, average percentage viewed, views, likes, comments and
  subscribers gained. Preserve raw counts.
- Test movement first and hooks second while holding other elements consistent.
- Do not guarantee views, subscribers or algorithmic success.
- Extend findings to long videos only after separate evidence.

### Reliability and publishing

- Verify all relevant tests after implementation changes.
- Inspect worker startup, lock recovery, interrupted jobs, retry behavior and
  scheduled execution through normal entry points.
- Reconcile rebuilt local files with already uploaded versions through review.
- Verify metadata, subtitles, thumbnails, audio and actual rendered frames.
- Confirm credentials and generated media remain ignored by Git.
- Finish migration cleanup only after verifying D drive completeness and current
  authorization and policy constraints for deletion.
- Keep this plan and verification evidence current in Git.

## Safe commands

Run from the repository root.

- npm run build
- npm run lint
- npm test
- npm audit --omit=dev
- npm run automate -- --dry-run
- npm run automate -- --prepare-only

The normal worker can publish when publishing is enabled. A preparation-only run
builds local assets. Inspect the existing worker PID before starting another
worker or altering its lock. Never infer a dead process from an old log alone.

## Completion criteria

The goal is complete only when current repository and runtime evidence proves
the original automation requirements and the requested creative outcome.

Required evidence includes preserved work, verified hook logging, compatible
dependencies, passing checks, safe end to end execution, recovery behavior,
a finished generated-motion prototype, visual and audio QA, working scheduling,
an accurate publishing journal, documented review and spending controls,
and an evidence based channel comparison.

A green test suite or a rendered still montage alone cannot prove the full goal.

## Resume procedure

1. Inspect git status, this plan and current source before relying on the handoff.
2. Check live worker ownership and any running jobs.
3. Read the latest run report and verify packs against current inputs.
4. Identify the highest priority unfinished requirement above.
5. Continue authorized work and record new evidence and limitations here.
6. Ask for missing Mac information only when the dependent action requires it.
7. Mark the goal complete only after the completion audit passes.

## Source references

- https://github.com/eibbini1/shorts-app
- https://github.com/Wan-Video/Wan2.2
- https://github.com/deepbeepmeep/WanGP
- https://github.com/BRoliix/comfyui-wan22-apple-silicon

These generation projects are research candidates. Inclusion does not establish
compatibility or quality on the user's Mac.

## Latest analytics evidence

A read only YouTube API snapshot was saved locally on November 4 2026 at
storage/analytics/bb-baseline.json. It contains metadata and statistics for 36
BB videos, including 23 public videos at capture time. It is ignored by Git.
These Data API statistics do not include retention or stayed to watch.
A channel performance conclusion still requires those metrics and equal age
comparison windows. The separate requested competitor research remains open.

The supplied October 6 to November 3 2026 analytics ZIP was inspected and copied
to ignored storage/analytics/export-2026-11-03. It contains Table data.csv,
Chart data.csv and Totals.csv. The table has views, watch time, subscribers,
thumbnail impressions and thumbnail CTR. It lacks stayed to watch, engaged views
and retention curves. Do not treat watch time divided by all Shorts views as
YouTube's reported average view duration or average percentage viewed.
Golden Fries has only eight views in this reporting window, so this export alone
cannot establish its creative quality or compare it fairly to newly published
videos. It is a period export, not a lifetime performance record.

Competitor research pilot collected public YouTube Data API metadata and counts
for 20 recent uploads from each of eight food channels on November 4 2026.
The exact handles are NickDiGiovanni, GugaFoods, JoshuaWeissman, BayashiTV,
ZachChoi, ChefRush, albert_cancook and itsQCP. Raw evidence is stored locally at
storage/analytics/competitor-pilot.json. This is a purposive pilot of 160 uploads,
not the requested 100 channel study. The clips still require visual review,
Shorts classification and equal age normalization before creative conclusions.
Public view counts do not expose retention or causal effects.

Pilot identity correction: the exact handle BayashiTV resolved to an unrelated
car channel. That record was excluded and replaced with BayashiTV_, whose
channel title and recent food uploads were checked. The review queue excludes
the incorrect channel. Always verify channel identity from recent content before
counting it toward the requested food creator study.

Video preflight now checks positive duration and decodes a video frame before
the automation pipeline starts narration work. A real fries clip passed, and a
nonempty JSON file supplied as video was rejected. Relevant preflight and worker
tests, build and lint passed. Full-file corruption beyond the first frame still
requires render verification.

Competitor discovery expanded to 122 distinct candidate channels from 200 video
search results across luxury food, expensive food, AI food animation and food
ASMR. Public candidate IDs, query provenance, sampled video IDs and metric
snapshots are versioned in docs/research/channel-candidates.json. Candidates are
sorted by visible subscriber count for triage. This does not establish a top
100 ranking. Relevance, format, identity and visual review remain required.

## Confirmed Mac profile and next runtime test

The user reports a MacBook Pro with Apple M1 and 16 GB unified memory.
Actual macOS version, free storage and access to that machine remain pending.

The community dgrauet/ltx-2-mlx project documents M1 support, image conditioning
and a 16 GB int4 configuration. It is the next smoke test candidate.
scripts/test-mac-motion.sh prepares a 49 frame, 24 fps, 384 by 640 portrait test
using the 2.3 q4 pack and low RAM mode. Shell syntax was checked on Windows.
Generation has not been run or visually validated on the Mac.

Install and review the upstream runtime in a separate environment on the Mac.
Use its documented setup and model license flow. Set LTX_MLX_BIN to the
environment's executable if it is not on PATH. First run may download model
weights. Inspect available disk space before setup. The script preserves
existing output files. It does not install packages or connect to paid APIs.

Example after setup

    sh scripts/test-mac-motion.sh source.jpg "Fine salt falls onto the fries and settles naturally. Preserve food geometry." storage/motion/salt-test.mp4

Pass accepted output clips into the episode scene video fields. The short test
checks compatibility before generating the shots for the 10 second acceptance
test. It does not change the final quality target.

Sources checked November 4 2026

- https://github.com/dgrauet/ltx-2-mlx
- https://github.com/Lightricks/LTX-Desktop

The current official LTX Desktop requirements place 16 GB Macs below its local
generation floor. Its installation alone would not prove a local route for this
Mac. The separate MLX candidate needs its own runtime and quality verification.

## Mac handoff checkpoint

docs/MAC_HANDOFF.md contains clone instructions and the continuation prompt for
the user's M1 Mac with 16 GB unified memory. Before this handoff, the current
Windows code passed build, lint, all 94 tests in 20 files, and the production
audit with zero reported vulnerabilities. Credentials and media remain ignored.
Real image to video generation on the Mac remains unverified.

Publishing mismatch reporting now uses a distinct needs-review status in newly
started workers. The review gate still requires reconciliation of local and
uploaded versions. Publishing and worker tests, build and lint passed.
An already running worker loads this status change on its next controlled
restart.

All 122 search-derived candidates now have a documented matched-title screen.
The screen distinguishes food preparation, price comparisons, eating content,
stylized animation, fantasy effects, tutorials and unrelated samples. This is a
completed metadata triage pass, not 122 completed visual reviews. Eight sampled
visual reviews are recorded separately. The requested best 100 comparison and
retention-based validation remain unfinished.

## Verified Analytics API prerequisite

A read only YouTube Analytics report request on November 4 2026 returned HTTP
403 accessNotConfigured. Google reported that youtubeanalytics.googleapis.com
is disabled or unused in the connected Cloud project. Enable YouTube Analytics
API in that project before retrying. OAuth analytics permission may also require
a separate consent step after the service is enabled; this has not been tested.
The existing Data API connection remains usable for metadata snapshots.

Reference https://developers.google.com/youtube/analytics/reference/reports/query

Research integrity check on November 4 2026 confirmed 122 unique candidate
channels, 122 documented metadata screens, 188 unique candidate videos and
eight unique sampled visual reviews. Video channel references and review note
paths passed consistency checks. These counts do not establish a completed
best 100 ranking or an audience performance conclusion.

## Worker startup recovery

The watcher now catches an initial cycle failure and remains available for the
next scheduled retry. One-time runs still fail on the same error. A real-process
regression test starts with a missing episodes directory, creates it after the
first discovery error, and confirms discovery is retried without restarting the
worker. Existing worker exclusion remains covered.

Verification for this recovery change: build and lint passed, all 95 tests in
20 files passed, and npm audit --omit=dev reported zero vulnerabilities.

## Upload recovery version check

A resumed uploaded record now checks the local video digest before recovering
a confirmed remote schedule. A changed render cannot be marked scheduled by
that shortcut. The regression test confirms a review error, an unchanged upload
journal and no additional insert, schedule update or remote status request.
All seven publishing tests passed. No live uploads were changed by this test.

On November 5, the Windows scheduled task and its Node process were verified live.
The 07:15 UTC cycle verified all five local packs as current and reported five
publishing version mismatches for review. This confirms the guard ran in the
installed worker; it does not confirm the current state of the remote schedules.

## BB production checkpoint

On November 5, all 97 tests in 20 files passed at 06a5f4f. The app has opt-in
portrait Food and Natural grades, source audio mixing, and hold mode for a
single action without replaying the clip sound. Local renders verified these
controls. See AUTOMATION.md for the BB editorial, publishing, and analytics
workflow. Technical QA does not clear footage rights or prove audience lift.

The Parmigiano private preview passed technical QA. Release needs original
or cleared footage. The chocolate Short has AI-generated opening and reveal
references, a private timing preview, and a Mac smoke test in
BB_CHOCOLATE_SHELL_PRODUCTION.md. There is no verified generated motion on
the M1 yet and neither Short has been uploaded.

Next motion experiments: a locked macro with real spoon contact and falling
shards; a rack focus from shell to filling; and a slow spoon lift with visible
texture. Try native 1080x1920 export when source footage supports it; upscaling
does not restore missing detail. Remotion motion blur is a candidate for
animated titles, not subject movement. Mediabunny is a candidate for browser
media editing, not a necessary replacement for the current FFmpeg renderer.
Neither is a production dependency. The 100-channel study remains incomplete.

References:
- https://www.remotion.dev/docs/motion-blur/
- https://mediabunny.dev/guide/converting-media-files
- https://support.google.com/youtube/answer/1722171

The portrait renderer now supports optional native 1080x1920 output, with
scaled titles and captions. The default stays 720x1280. An isolated render
with a hook, moving footage, hold, Food grade, and source audio passed decode
and dimension verification; build and lint passed. See the agent quick start
in AUTOMATION.md for all settings, defaults, and the safe testing workflow.

On November 5 at 08:19 UTC, verify-live-run accepted all five rebuilt BB
packs. The older watcher still reported stale inputs. After its cycle
finished, a controlled restart loaded the current code. The first new cycle
reported all five packs current and all five uploads needs-review because
the render digests differ from the already uploaded versions. No duplicate
upload or schedule change was made by that cycle.

## Creation engines before the editor

The renderer assembles supplied motion. The moving Chocolate Textures review
cut used three Mixkit Free License clips and offline Kokoro af_heart. It
rendered at 720x1280, about 30 seconds, and passed technical and motion QA.
It is a different story from the gold-shell concept and has not been uploaded.
Caption timings were estimated from the recorded takes and need listening
review for word-level accuracy. Assets and private renders remain local.

1. Generate matched reference images from a shot brief. Store the prompt,
   model, input hashes and approved images. Check subject and lighting
   continuity across the opening and reveal.
2. Validate a real local image-to-video run on the M1. Start with the
   chocolate spoon contact, fracture, and falling shard in one locked shot.
   If it passes, generate the spoon-lift reveal. Run the existing smoke test
   and inspect the full clip and frame strip.
3. Integrate only after validating output: one job per shot, persisted inputs,
   results and approval; reuse accepted takes and regenerate only the failed
   shot. Feed accepted footage into the existing editor. Keep paid generation
   behind approval and verify final motion, sound and caption sync before release.
