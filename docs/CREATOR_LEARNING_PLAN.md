# Local video craft learning plan

Checked on 7 November 2026 (US market). The live [Google Trends RSS](https://trends.google.com/trending/rss?geo=US) snapshot contained ten current queries and none concerned food. [TikTok Creative Center](https://ads.tiktok.com/creative/creativeCenter/trends?countryCode=US&period=7) was checked; the public overview did not provide a verifiable food-specific ranking without signing in. YouTube has an established creator reference, [More Nick's “Ultimate Steak Crust”](https://www.youtube.com/watch?v=y4W3jy0GBqg), published 27 July 2023, with about 6.37 million views at the time of this check. It is a proven craft reference, not evidence of a current trend. The next original experiment is a fast crust reveal, preparation, sear, resting and bite payoff inspired by the broad cooking topic. Use original narration, prompts, graphics and sound. Do not copy footage, voice, branding or an exact shot sequence.

## What the local system can learn today

`python3 scripts/record-shot-review.py` saves an asset hash, prompts, model, three human scores, notes and a reuse flag in ignored `storage/learning/shot-reviews.jsonl`. A local Ollama scenario draft automatically retrieves up to three approved examples for a matching subject when every score is at least 4/5. It uses their shot direction as examples, while the schema still validates total duration. This is local retrieval memory. It does not alter the weights of Ollama, FLUX, LTX or Gemma.

Example after watching an actual clip:

```sh
cd /Users/eibbini/Documents/shorts-app
python3 scripts/record-shot-review.py \
  --asset storage/gold-steak-local/motion/sear.mp4 \
  --subject 'steak cooking' \
  --image-prompt 'One steak searing in a single cast-iron skillet' \
  --motion-prompt 'Steam rises and butter bubbles around the same steak' \
  --model 'LTX 2.3 q4 MLX' \
  --score-action 4 --score-continuity 4 --score-appeal 4 \
  --notes 'One pan and a readable crust; check excessive camera drift' \
  --approve-for-reuse
```

Only use `--approve-for-reuse` after the reviewer has watched the clip. Lower-scoring records are still useful as failure examples and are excluded from Ollama retrieval.

## Progress toward 100 strong creators

1. Start with ten creators across food, comedy and mini stories. Record the public video URL, date checked, duration, aspect, hook type, shot lengths, visible action, sound role and payoff. Distinguish a published video's verified engagement from a current trend signal. Do not store the source video in a training set without the rights to use it.
2. Recreate a **technique**, such as a macro crust reveal or a contrast between preparation and payoff, with original assets and language. Review the result against the concept rather than aiming to imitate a creator's identity.
3. Run two prompt candidates for the same starting image and seed. Change one variable: action wording, frame conditioning, camera wording or model. Keep generation time and memory with both outputs. Prefer the winner only if the physical action and continuity improve.
4. Score each completed clip 0–5 for action, continuity and visual appeal; record the observed failure. Check the full montage for pacing, audio balance, legibility and smooth transitions. Review a contact sheet and play the file.
5. Grow to 25 creators and then 100 through this same rubric. Summarize patterns from approved examples into a prompt library per topic and model. Keep a fixed set of ten benchmark briefs so model updates can be compared fairly.
6. When enough original, permissioned examples exist, evaluate a small LoRA separately. Use a train/holdout split and compare against prompt retrieval. Training consumes substantial time and memory and should only be adopted when it beats the simpler method on unseen briefs.
7. If videos are published, collect retention at 1/3/10 seconds, completion, rewatch and click-through by hook. Use audience results to revise the shot plan; never treat one viral example as a guarantee.

Next technical targets: use the locally tested FLUX.2 Klein 4B q4 for stronger reference images, add model-specific image editing only where it preserves identity, keep LTX 2.3 q4 for motion until a newer pack wins a matched benchmark, and keep the exact-frame FFmpeg output check. The FLUX sample ran in about 21 seconds at 384×640 with 3.46 GB peak MLX memory; its edit sample ran in about 31 seconds with 3.47 GB. These are single-image timings, not whole-video timings.
