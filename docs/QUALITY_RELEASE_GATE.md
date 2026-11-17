# Local 90/100 release gate

`npm run score:video:mac -- --scenario drafts/generated/ID.local-scenario.json --pack outputs/ID.sfx.pack.json` creates a quality report. It starts at **review needed** until someone watches and listens to the finished film. A clean encode is only 30/100 technical points; story structure is 20/100. The remaining 50 points require five editorial ratings from 0 to 5: continuity, realism, story, audio, and payoff. Each rating contributes 10 points. Release requires at least 90/100, all technical checks passing, and every editorial category at least 4/5. A 94/100 with broken continuity still fails.

Create an editorial JSON file after reviewing the actual MP4:

```json
{"continuity": 4, "realism": 4, "story": 5, "audio": 4, "payoff": 5}
```

Then run:

```sh
npm run score:video:mac -- --scenario drafts/generated/ID.local-scenario.json \
  --pack outputs/ID.sfx.pack.json --editorial my-review.json
npm run quality:history:mac
```

Use the same five questions each time: Does one subject and location persist? Do food and human motion look believable? Do shots form one beginning-to-end story? Is narration natural and the soundtrack/ASMR balanced? Is the promised final action visibly achieved? Watch the export at phone size and listen on speakers or headphones before rating.

The score report also includes PySceneDetect cut times and scene lengths. These are diagnostics only: a soft transition can be missed, and a moving camera can look like a cut. FFmpeg checks black frames, frozen images, loudness, silence, duration, and when the first spoken hook starts. Local runs and reviewed scores stay in ignored `storage/learning` files. Only clips separately scored at least 4/5 on action, continuity, and appeal with `record-shot-review.py --approve-for-reuse` can become examples in later Gemma drafts. No score predicts platform views.

## Before and during the review

`make-local-video.sh` runs `scripts/prereview-local-video.py` on the finished file. It asks each shot's visual questions again on that shot's middle frame in the final MP4, checks the last frame for the payoff, compares the opening and final dish, measures loudness and per-shot sound, and writes a contact sheet. Its flags name the ratings likely to fall below 4/5; fix those before reviewing. It adds no points.

Record the review in one step instead of writing the JSON by hand:

```sh
npm run review:video:mac -- --scenario ID.local-scenario.json --pack outputs/ID.sfx.pack.json --video outputs/ID.mp4
```

It opens the film, asks the six review facts and the five ratings, binds them to the file's SHA-256 and re-scores. Scores: 50 machine points + 2 × the five ratings, so 75 needs 13/25 and release needs 4/5 in every category (90).
