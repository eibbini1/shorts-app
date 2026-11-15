# What the Shorts gates prove

Updated 2026-11-15. The gates are designed to stop specific known failures. They cannot guarantee that generated hands, food, motion or sound feel real. A reviewer must watch and listen to the exact final file.

| Stage | Check | Stops or flags |
| --- | --- | --- |
| Director brief | Validated dish, set, hook, physical action, obstacle, technique, ending, sound and duration; saved answers | Missing subject, invalid audio choice, impossible runtime |
| Draft | Schema, strict preflight, story audit, user brief hook/action check; template visuals get one local Ollama refinement by default | Wrong runtime, repeated or static shots, subject/ending drift, ignored concrete brief |
| Evidence | Retail price basket, record claims, published signature | Unsourced visible prices, unsupported superlatives, exact format/set/hook repetition |
| Sound plan | Explicit shot sound mapped to supported effect cues before GPU | ASMR shots whose requested sound cannot be produced by the current Foley engine |
| Stills | Optional three candidates and local Qwen hand/tool/food review | Obviously blank or locally flagged stills; remains advisory for fine anatomy |
| Final technical QA | Final-file hash, duration, black/frozen picture, loudness, silence, early hook | Broken output or QA from an earlier edit cannot pass |
| Release | Story audit and preflight rerun, same final-file QA, human review record tied to final SHA-256 | A numeric 90+ with missing checks, stale review, missing full viewing/listening, or a critical editorial score below 4/5 cannot pass |

To submit an editorial review, watch the entire final MP4 and listen to its mix, then create a JSON file with five 0–5 scores and a review record. The `videoSha256` must be the SHA-256 of that same final MP4; on macOS run `shasum -a 256 FINAL.mp4`. Example shape:

```json
{
  "continuity": 4,
  "realism": 4,
  "story": 4,
  "audio": 4,
  "payoff": 4,
  "reviewEvidence": {
    "reviewer": "Your name",
    "videoSha256": "64-character SHA-256 from shasum -a 256",
    "watchedFullVideo": true,
    "listenedFullAudio": true,
    "checkedOpeningHook": true,
    "checkedFoodContinuity": true,
    "checkedShotTransitions": true,
    "checkedSoundCueSync": true
  }
}
```

Run `python3 scripts/score-local-video.py --scenario SCENARIO.json --pack PACK.json --video FINAL.mp4 --qa-report FINAL.mp4.qa.json --editorial REVIEW.json`. An old five-number review without the final-file evidence remains `review-needed`. A report can reach a provisional numerical score while still blocked; only `status: pass` is a release pass.

The local visual model and technical metrics may miss a morphing dish, floating tool, repeated camera move, or awkward sound. If any of these appear, score continuity, realism or audio below 4 and revise the film. The template's Ollama pass cannot verify its own rendered pixels; the real model path still needs a Mac smoke test. No current gate establishes virality or a 95% viewer preference. The existing uncommitted `film-v3.sh` path in Claude's original checkout is a separate pipeline and must be reconciled and tested before claiming app-wide coverage.
