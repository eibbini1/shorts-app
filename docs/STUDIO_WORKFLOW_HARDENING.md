# Studio workflow hardening

## Scope and baseline

This isolated branch starts at PR #22 commit 218412c. The live service remains on its earlier build. This change includes the prior isolated cancellation, media-range and unattended improvements and the new watchdog, frame manifest and stale-ending fixes.

## Flow

The brief submits to studio-draft.py, whose generated story goes through the existing preflight, story and prompt checks. The first-frame job uses the existing renderer and vision gates. A successful stills job writes first-frames.json with the scenario hash, the selected file for each shot, and its hash. Studio displays that selection. Rendering validates the manifest, passes a pin flag to the Python renderer, and consumes those exact source images before the existing optional PhotoCraft prep. Normal motion caching, sound, assembly, finishing and exact-export QA follow. A playback result remains subject to human review.

Direct CLI render callers retain their original behavior unless SHORTS_STUDIO_PIN_FRAMES=1 is set. Older Studio sessions need a new successful first-frame job before rendering. A manifest identifies selected source images. It does not prove artistic quality, motion correctness, or human approval.

## Operating behavior

- Owner-only Run unattended drives draft → stills → render on the server. It stops on failed jobs and BLOCKED/NEEDS-CHOICE messages. The browser can close, while the server and Mac must stay awake. An interrupted chain requires explicit recovery after server restart.
- Drafts stop after 15 minutes total or 5 minutes without output. STUDIO_DRAFT_TIMEOUT_MS and STUDIO_DRAFT_IDLE_TIMEOUT_MS configure these bounds. Output activity updates the idle clock. Timeout retains the brief and exposes a failed result after the worker exits.
- Cancellation holds the job lock through stopping and escalates TERM to KILL after 5 seconds. Invalid byte ranges return 416. Stale export feedback is refused, and a failed feedback write produces an error.
- Editing an example brief clears its preset ending and setting. Editing a loaded project with an existing ending also clears that inherited ending. A creator can enter a new explicit ending afterward.
- Existing caches and media are retained. A changed story or selected frame stops rendering until fresh first frames are made. The manifest follows the current selection, so saving a new first-frame set requires review again in the guided path.

## Verified evidence

The production UI build passed. All 100 JavaScript tests and 86 Python tests passed. The new synthetic API fixture covers manual stages, regenerate, exact first frames, frame tampering rejection, unattended stages without a browser, blocked plan, timeout, cancellation lock, restart persistence, media range handling and stale feedback.

A browser test changed the cartoon sunflower example into a halloumi-and-steak food brief and confirmed that the sunflower ending was cleared and the unattended action was visible. No video generation was started in that UI test.

The previous cached replay passed technical QA, with native motion at 384×640, an assembled 720×1280 export, and an older 1080×1920 ArtCraft upscale. No new native-resolution claim follows from this change.

## Remaining release work

Run a new short original prompt through real local models with approved time allowance, watch and listen to the exact final export, and record the existing editorial review. Validate first-frame selection with PhotoCraft preparation and every supported still-source mode on actual assets. The Studio thumbs feedback remains separate from formal comparative Creative Learning evidence. No automatic claim of model improvement is made.

Live rollout, PR merge and deployment require separate approval.

## Phase 1 export review follow-up

The Studio prereview endpoint now reads only the sidecar for the selected export and confirms its SHA-256. Missing, pending, stale and unavailable results have explicit UI messages. A browser request for an old export is rejected after a take changes, and stale fetch responses cannot replace the current take's view. Complete reports expose motion measurement availability, vision status and advisory findings. These checks add no editorial points.

After final technical QA, export-provenance.py reads the actual source clip manifest and probes each source and the final file. It writes dimensions and hashes tied to the final export. Studio labels native motion source sizes, delivery size and upscaling. Older files with no matching provenance display unverified native resolution. Resolution is measured from encoded source clips and establishes no perceptual detail gain.

Use node --test scripts/test-studio-export-review.mjs for exact-take, stale report and mixed-resolution regressions. The Python suite includes an actual FFmpeg source/upscale fixture, and the existing synthetic Studio workflow remains available. The cached Moonlit Voyage export was freshly checked and passed all six technical checks. Its UI showed 384×640 sources and 720×1280 delivery. A second browser fixture with a mismatched review hash showed the stale message and withheld motion flags.
