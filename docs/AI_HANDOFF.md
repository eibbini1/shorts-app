# AI HANDOFF (read first, update last)
Updated: 2026-11-14 (UTC) by Claude (Sonnet 5.5)
Branch: feature/phase1-shot-continuity  Commit: 55b6b3c (pushed)  Draft PR: https://github.com/eibbini1/shorts-app/pull/16 (base feature/flux-prompt-builder)
Working tree: remaining untracked/modified entries are pyc, scratch scenarios, D:/, Dr. Tod stills, outputs, episodes/ai-tools-*, .vscode (deliberately not committed). Not merged: feature/trend-feed-templates.
## Verified
- src/ vitest 21 files / 100 tests pass (Mac). tsc, eslint, node --test 6/6, Python 5/5 earlier.
- Full-repo vitest shows 46 failed files, all zod tests in mini-chef-studio/node_modules (config gap: exclude it).
- Baseline preserved with sha256; frames inspected; audio measured (-16.2 LUFS, TP -1.4).
- feature/trend-feed-templates: 11 files, +826, adds only new files, 0 conflict markers vs HEAD (merge-tree). NOT merged.
## Phase 1 result (VERIFIED by running; branch feature/phase1-shot-continuity, uncommitted)
- Re-render of same story (hotel-hot-dog p1 scenario, --chain-images, no --allow-silence): 28m43s, 720x1280, 30.0 s.
- Quality report 45 -> 50/100 (technical 25 -> 30: silence check now passes; hook 75 -> 85; story 20 and editorial 0 unchanged, editorial is human review).
- Audio: loudness -16.1 LUFS, LRA 7.6 -> 2.7 LU, longest silence 1.84 s -> 0.61 s.
- Frames viewed: same gloved hand, copper pan, black slate in all 6 shots; hero finish shot present. Remaining: native 720p, slow motion, captions of this render predate the dangler fix (fixed in code, 5 tests).
- Changes: scripts/finish-local-video.py phrase_chunks(), scripts/story-scenario.mjs continuity clause, scripts/test_caption_chunks.py, vitest.config.ts excludes node_modules + mini-chef-studio. Narration lines rewritten only in the p1 scenario copy.
- Not "another level" yet: Phase 2 (Crumb) and Phase 3 (mastering/resolution) still to do. Evidence: storage/baselines/hotel-hot-dog-20261114/{baseline,phase1}.mp4 + contact sheets (git-ignored).
- Tests now: vitest 21 files/100 tests, eslint, tsc, scripts/*.test.mjs 6/6, python caption 5/5 + flux 5/5.

## Implemented but untested / uncommitted (other work in tree)
- ElevenLabs path in narrate-any-local.mjs (paid; needs ELEVENLABS_API_KEY), idea picker, caption/brand changes in finish-local-video.py.
## Blockers
- LTX-2.3 licence text unread. Linux VM cannot run macOS binaries or delete files.
## Phase 2/3 (VERIFIED)
- Crumb 2D rig: mini-chef-studio/src/Crumb.tsx; render needs --browser-executable=Google Chrome (bundled chrome-headless-shell hangs on this Mac). Composite: scripts/composite-crumb.sh. Native 1024x1920 LTX benchmark in ROADMAP.
## Next action
Owner: watch the film (storage/p2/phase3-1080.mp4), approve or redirect; decide -14 LUFS target, trend branch merge, native-res opt-in. Then Phase 4. Other assistant: run git status and read this file before editing.
