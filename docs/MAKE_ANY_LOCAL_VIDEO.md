# Make a local video from any idea

Run from the repository root on the Mac after the model setup is complete:

```sh
cd /Users/eibbini/Documents/shorts-app
npm run make:any:mac
```

The script asks for a subject, visual style and tone, length (10–60 seconds), and vertical or wide framing. Wide is currently 60 seconds; vertical can be 10–60. Local Ollama Qwen drafts a shot plan in `drafts/generated/`. Read its prompts, timing, narration, factual claims and story continuity before answering `y` to render. You can stop at the plan by answering `n` or with `npm run make:any:mac -- --draft-only`.

After editing the plan, render it directly:

```sh
bash scripts/make-local-video.sh --scenario drafts/generated/YOUR-ID.local-scenario.json
```

Add `--chain-images` when each shot should retain the same subject; FLUX then edits the previous still. Use separate shots and explicit location, wardrobe and prop details in every image and motion prompt. Save any changes to the JSON before rendering. The script validates the schema and requires shot timings to add to the exact chosen runtime.

Local tools: Ollama for the editable plan; FLUX.2 Klein through MFLUX for still references; LTX 2.3 with Gemma for actual moving clips; Kokoro ONNX for narration; original locally synthesized instrumental audio; FFmpeg for motion retiming, mixing and MP4 output. The render saves assets under `storage/any-local/` and final MP4s under `outputs/`. Verified clips and stills are reused on reruns; keep the cache when trying another export. Each uncached motion clip takes several minutes on the tested 16 GB Mac, so a 30-second video can take substantially longer than the preview recipes that reuse verified footage.

This is a general local production path, not automatic quality control. Review the generated plan and final video for subject continuity, physical motion, claims, pronunciation and copyright. Music is original and locally synthesized; the script does not fetch a current trending commercial song. Fix a weak shot by editing its prompt and rerunning the same scenario. Changing a prompt creates new cache keys for that shot.
