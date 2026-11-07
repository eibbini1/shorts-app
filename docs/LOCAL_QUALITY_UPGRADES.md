# Local quality improvements — 7 November 2026

The target is a reviewed, coherent film. A newer model or longer prompt does not guarantee a better result. Keep the working pipeline and compare candidates on the same task before changing defaults.

## Current choices and candidates

| Role | Choice | Evidence / status |
| --- | --- | --- |
| Story and metadata | Existing Ollama Qwen | Runs locally; validate shot durations and schema rather than accepting output blindly. |
| Video prompt expansion | Existing Gemma in LTX runtime | Available without new model weights. Review expansions for invented props and conflicting actions. |
| Reference images | Existing SD1.5 / ComfyUI | Working baseline. Food trial produced duplicate pans and inconsistent plate arrangements in two rejected references. |
| Image upgrade candidate | FLUX.2 Klein 4B, quantized MLX | Apache 2.0; generation and reference editing. Candidate download is 4.62 GB. Local image quality and peak memory must be measured before adoption. |
| Alternative image candidate | Z-Image Turbo | Apache 2.0; 6B, few-step generation. A manufacturer's 16 GB VRAM claim is not proof of comfort on a 16 GB unified-memory Mac. Not installed by this trial. |
| Motion | Existing LTX 2.3 q4 / MLX | Actual 97-frame clips run on this Mac. Keep it while evaluating reference quality. Newer LTX versions require separate weights and regression tests. |
| Narration | Existing Kokoro ONNX | Local cached voice generation. |
| Assembly | FFmpeg | Exact duration, source-frame trimming, audio mix, decode verification. |

Sources checked:
- [FLUX.2 Klein 4B model and license](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- [MLX quantized checkpoint](https://huggingface.co/mlx-community/flux2-klein-4b-4bit)
- [MFLUX implementation](https://github.com/mflux-community/mflux)
- [Z-Image Turbo model and license](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)
- [LTX MLX implementation](https://github.com/dgrauet/ltx-2-mlx)
- [LTX prompting guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide)

## Reusable shot direction

Write a separate image prompt and motion prompt. The reference establishes a plausible starting frame. The motion paragraph describes what changes from that frame.

Record these fields before generation:
1. Subject identity: the same object, proportions, material, and current state.
2. Starting composition: visible objects and their positions.
3. Main action: one physical event that can happen within the clip.
4. Quantity and timing: how much enters, when it stops.
5. End state: what is visibly different at the final frame.
6. Camera: one feasible movement or a locked camera.
7. Continuity: consistent surface, vessel, garnish, lighting and color.

For LTX, turn these fields into a flowing present-tense paragraph. Avoid piling on abstract praise such as “best ever” or “100x quality”. A fixed image containing fully sliced steak conflicts with a request to start cutting an intact steak; solve the reference first.

Example motion revision after reviewing the salt take:

> Locked macro shot of the single raw marbled steak on the walnut board. A brief pinch of a few fine salt crystals falls onto its upper surface during the first second. The small crystals bounce once, settle as a sparse scattering, and the sprinkle stops. The red marbled meat remains clearly visible. The steak and rosemary remain still while the camera holds on the lightly seasoned surface. Warm side light, dark kitchen, one continuous take.

That revision is a proposed next-generation prompt, not a claim that the existing clip followed it. The current edit trims the excessive-salt tail. Basting and serving use the preceding clip's final frame to preserve the pan and plate.

## Acceptance and learning

Keep prompt, model revision, seed, source image hash, generation time, output, and review notes together. Rate action completion, geometry, subject continuity, appetite appeal, and unwanted objects. Compare the baseline and candidate at equal output size and the same intended composition. Inspect multiple time samples and play the final film before publication.

Saving successful prompts and rejected examples improves the workflow. It does **not** update model weights. LoRA training is a separate future task requiring a curated dataset, explicit evaluation, and suitable memory. Do not automatically replace working model revisions just because a new version exists.

## Try the existing local prompt enhancer

Run this when the GPU is idle. The saved Gemma path reuses the already installed model:

```sh
cd /Users/eibbini/Documents/shorts-app
storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx enhance \
  --gemma "$(cat storage/setup/gemma-model-dir.txt)" \
  --mode i2v --seed 42 \
  --prompt "The same steak in the same skillet. A small stream of rosemary butter falls onto its crust, stops, and the butter bubbles around the edges. Locked macro camera, warm side light."
```

Read the expanded text before passing it to generation. Preserve subject identity and remove invented people, extra cookware, or actions that do not fit the starting image.

## Optional image candidate setup

```sh
bash scripts/setup-mflux-mac.sh
```

This pins MFLUX 0.24.0 in its own virtual environment and the quantized checkpoint revision `860e87183ceb29e39627c0612ebd66d8ea66e68c`. It does not change existing ComfyUI, LTX, or image defaults. A completed installation is separate from a successful sample render. Model files remain in ignored storage.

After setup, generate a local reference with the verified command:

```sh
npm run image:flux:mac -- --prompt 'One ribeye steak on a dark walnut board, a few salt crystals, one rosemary sprig, warm side light' --seed 42 --output "$PWD/storage/flux-steak.png"
```

To preserve identity between stills, add `--source "$PWD/storage/flux-steak.png"` and describe the specific new cooking state. The command writes a JSON provenance file alongside the PNG, including the model revision, seed, prompt and hashes. It generates a local image; LTX motion is still a separate step.

The first local comparison at 384×640 took 21 seconds with 3.46 GB peak MLX memory, and a reference edit took 31 seconds with 3.47 GB. Both were visually reviewed. The new model followed the dark walnut board and single-steak direction better than the SD 1.5 trial. It also invented a scored crust in the edit, so identity preservation still requires review.
