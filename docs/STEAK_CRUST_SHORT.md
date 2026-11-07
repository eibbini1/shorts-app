# Crust-first cooking Short

Reference checked 7 November 2026: [More Nick — Ultimate Steak Crust](https://www.youtube.com/watch?v=y4W3jy0GBqg), an established YouTube cooking Short published in 2023. This app's version is an original 30-second steak story with a crust-first hook, raw preparation, sear, basting, slice, gold finish and bite. It does not use reference footage, voice, music or branding. The reference informs the broad macro food-shooting idea and fast payoff.

The new hook and sparse seasoning shots use locally generated FLUX.2 Klein 4B q4 images and LTX 2.3 q4 motion. Five previously generated and reviewed LTX cooking shots from the gold-steak recipe are reused. Kokoro makes new local narration; the original local soundtrack is rendered again; FFmpeg exports the final H.264/AAC MP4. The second run reuses verified local assets. Four references means approximately two FLUX image generations and two LTX motion generations on first run, then editing and audio. This is faster than generating seven new motion clips.

```sh
cd /Users/eibbini/Documents/shorts-app
npm run make:gold-steak:mac
npm run make:crust:mac
```

The first command must have completed once so its five motion clips exist. It can be skipped on later runs. Both commands write model files and generated media under ignored `storage/` by default. To choose an output:

```sh
npm run make:crust:mac -- "$PWD/storage/steak-crust-local/crust-take2.mp4"
```

Use `STEAK_CRUST_WORK_DIR` for a fresh shot generation and `GOLD_STEAK_WORK_DIR` to select the existing gold-steak cache. The shot plan allocates 4, 4, 4, 4, 5, 5 and 4 seconds. Review the completed MP4 for physical continuity and audio. The source crust hook and seasoning clips are genuine generated motion, while the rest are verified reused clips. The assembler checks exact frame count and decodes the full output.
