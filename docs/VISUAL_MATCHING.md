# Visual-to-script matching

## Why visuals used to drift
The old flow built search queries by permuting keyword fragments of each section's text, one
fragment per 2-second slot. Fragments advanced slower than the narrator, canned style hints
("pan sauce") were injected regardless of content, and "validation" compared the query with the
brief it was built from, so nothing could be rejected.

## Current flow
1. `buildBeats` (src/content/scenePlanner/beats.ts) cuts the narration into 1.6-3.4s phrase beats from real word timings.
2. `ScenePlanner` asks the LLM, per beat, for an objective, 3 concrete queries, mustShow and avoid lists. Invalid plans are retried once, then the run fails. Mock providers get a labelled heuristic plan.
3. `VideoPipelineService.getVisualForScene` searches each query, has the vision judge compare two real frames with the beat objective, and keeps the best clip scoring at least 0.6.
4. If nothing verifies, the run fails with the scene, the spoken text and every attempt. `ALLOW_UNVERIFIED_VISUALS=true` accepts unjudged clips but flags them in the manifest.
5. Every decision (objective, score, reason, provider title, verification mode) is stored in the manifest's visual validation entries.
