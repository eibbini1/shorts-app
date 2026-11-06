# Local media on Windows and Mac

## Verified 2026-11-06

Windows has 8,356,786,176 bytes RAM, MX330 2 GB VRAM and about 102 GB free on D.
FFmpeg and Python managed by uv are available. Ollama answers but has no models.
ComfyUI does not answer on localhost port 8188. Real local image/video inference,
peak memory, visual quality and a new 30-second generated preview remain unverified.
The existing Mac LTX smoke test is a separate runtime from this ComfyUI connector.

## Commands from the repository root

    npm ci
    node scripts/local-media.mjs doctor
    node scripts/bb-local-scenario.mjs "Chocolate textures" chocolate-local

Install and start Ollama and download a locally licensed model before the scenario
command. Its default candidate is qwen3:1.7b. Review the resulting scenario.

Install ComfyUI using its official platform instructions and select a workflow
that runs on the actual hardware. Export it in API format. Review all nodes and
models for offline inference and licensing. A compatible video model has not yet
been benchmarked or pinned for this MX330. Do not assume a model fits 2 GB VRAM.
Windows installation https://docs.comfy.org/installation/desktop/windows
Manual installation https://docs.comfy.org/installation/manual_install

Save a configuration in storage/local-worker.json. Example structure follows.

    {
      "worker": "http://127.0.0.1:8188",
      "offlineWorkflowReviewed": true,
      "scenario": "drafts/generated/chocolate-local.local-scenario.json",
      "seed": 42,
      "timeoutSeconds": 1800,
      "image": {"workflow": "storage/image-api.json", "fps": 24, "outputNode": "9"},
      "video": {"workflow": "storage/video-api.json", "fps": 24, "outputNode": "10"},
      "references": ["storage/approved-chocolate.png"]
    }

Replace node IDs with actual save-output nodes. Templates use exact string values
{{prompt}}, {{motion}}, {{seconds}}, {{frames}}, {{fps}}, {{seed}}, {{image}}.
Bindings preserve numbers. Match the model's required frame count in the workflow;
the generic frames binding is rounded seconds times fps. References are one per
shot, in scenario order. Image results need review before becoming references.

    node scripts/local-media.mjs generate storage/local-worker.json 0 image
    node scripts/local-media.mjs generate storage/local-worker.json 0 video

The worker is explicitly selected by URL. To use a Mac, configure a reachable
ComfyUI service on that machine and put its private LAN address in worker. No
automatic worker switch occurs. Native LTX-MLX is not served by this adapter.

Jobs live in storage/local-video under a hash of inputs. Repeating the same
command reuses a validated saved result or polls the saved prompt ID. Input
changes produce a separate job. A lock prevents concurrent writes. After an
abrupt process kill, verify the old process is gone before removing its lock.
A submitting state means the HTTP outcome is uncertain; inspect ComfyUI history
using clientId and recover promptId before resuming. Do not blindly resubmit.
Saved results include elapsed time, dimensions, hashes and review status.
Peak memory is currently null because collection is not implemented.

## Assemble approved clips

Prepare a manifest with output and a shots array. Each shot requires approved:
true, video, and narration containing file and words [{word,start,end}]. Generate
af_heart audio with the existing local Kokoro installation, align words against
the actual audio, and review sync. Automatic Kokoro/alignment orchestration is
still pending. Text must match scenario narration exactly.

    node scripts/local-media-export.mjs SCENARIO.json MANIFEST.json storage/preview.assemble.json
    npm run assemble-abdul -- --spec storage/preview.assemble.json

This reuses the existing motion check, food grade, fade transitions, captions,
ambient bed and editor sound effects. The exporter supplies local narration for
every scene. Duration follows narration through the existing editor; verify 30
seconds on the final render and adjust takes before approval. A scenario's
duration alone does not guarantee the rendered duration.

## Acceptance still pending

Benchmark one real chocolate fracture shot, record runtime/model revisions,
sample peak memory, review contact and continuity, and save the quality verdict.
Then verify crash/resume against a real worker and assemble the 30-second preview.
Publish only after the user's review.

API reference https://docs.comfy.org/development/comfyui-server/comms_routes
