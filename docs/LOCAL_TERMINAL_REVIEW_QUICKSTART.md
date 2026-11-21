# Local terminal review quickstart

Run this from the repository root **after the final MP4 and its scenario exist**. These are placeholders, not files: replace them with the matching paths from your completed render. To locate files, run `find drafts/generated -maxdepth 1 -name '*.local-scenario.json' -print` and `find outputs -type f \( -name '*.mp4' -o -name '*.pack.json' \) -print`.

```bash
SCENARIO='drafts/generated/your-story.local-scenario.json'
VIDEO='outputs/your-final-video.mp4'
PACK='outputs/your-final-video.sfx.pack.json'

npm run learn:run:mac -- --scenario "$SCENARIO" --video "$VIDEO" --pack "$PACK"
npm run video:prereview:mac -- --scenario "$SCENARIO" --video "$VIDEO"
npm run review:video:mac -- --scenario "$SCENARIO" --pack "$PACK" --video "$VIDEO"
```

The first command records the scenario, export, hashes, and available QA as a run. The optional pre-review checks the final export and reports advisory flags; it does not approve the video. The last command opens the export on macOS, asks you to confirm you watched and listened to it fully, then records your five ratings and an optional note. Be specific about the shot and timestamp, and rate only what you actually reviewed. If you did not complete every review check, the script saves no score.

**Learning limitation:** these terminal commands save hash-bound run and editorial evidence; they do not train FLUX/LTX or directly add a note to Studio’s prompt-learning log. To guide later Studio story plans today, open that project in Studio and submit **Good** or **Needs work** with the same specific note. The local story planner may consult that feedback and repeated blockers, but it does not bypass story or release gates or silently change production defaults.
