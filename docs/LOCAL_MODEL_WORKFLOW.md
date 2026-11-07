# Local model workflow on the Mac

The current 16 GB Apple Silicon Mac uses Qwen 3 1.7B through Ollama to draft
ideas, Stable Diffusion 1.5 in ComfyUI for reference images, LTX 2.3 q4 for
motion, Gemma 3 as the LTX text encoder, and Kokoro for narration. FFmpeg assembles
the final Short. The proven chocolate example is `npm run make:chocolate:mac`.

## Check versions without downloading

```sh
npm run models:check:mac
```

The command compares installed model and tool revisions with their upstream
revisions. It does not install, delete, or switch models. It also shows the
active LTX and Gemma directories. Keep those active pointers pinned while
testing a candidate version, so an unrelated new download cannot silently
change the next video.

## Improve future Shorts

1. Draft a brief and shot list locally with Qwen, for example:
   `npm run draft:local -- "Chocolate shell reveal" chocolate-reveal --channel channels/bb.json --format short --seconds 30`.
2. Generate and review the image reference with ComfyUI.
3. Generate motion with LTX. Keep the dessert, plate, lighting, and camera
   description consistent across shots; use the prior shot's final frame as the
   next reference.
4. Narrate with Kokoro, assemble with FFmpeg, and review the exported video.
5. Record which hooks, shots, voices, and endings worked. Use those examples to
   change the next brief, prompts, and shot selection. This improves the
   workflow; it does not change the model weights automatically.

Actual weight training is a separate LoRA fine-tuning project. It requires a
curated collection of footage, captions, a trainer compatible with the selected
model, and before/after evaluation. Do not train on an exported Short alone: it
contains music, captions, edits, and model artifacts that are poor learning
targets for a motion model.

## Upgrade carefully

When the check reports a newer revision, keep the current model available,
install the candidate separately, and generate the same short test shot with
both versions and the same prompt, reference, and seed. Compare motion,
continuity, food detail, generation time, and memory use before changing the
active pointer. The current LTX 2.3 q4 pipeline has been verified on this Mac.

LTX 2.5 is a separate model family rather than a small revision. Its q4 pack is
about 47 GB and the upstream project labels that variant lower quality than its
larger 2.5 packs. It should be tested as a separate candidate, not installed
automatically over the working 2.3 setup.
