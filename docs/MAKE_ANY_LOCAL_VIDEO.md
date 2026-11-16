# Make a local video from any idea

Run from the repository root on the Mac after the model setup is complete:

```sh
cd /Users/eibbini/Documents/shorts-app
npm run video:local
```

The command asks for the exact dish or subject, style, one consistent set, opening image, must-show food action, optional obstacle and turn, ending, audio mode, length (10–60 seconds), and orientation. Wide is currently 60 seconds; vertical can be 10–60. The local story model first drafts a concrete story spine: protagonist, setting, goal, obstacle, turn and payoff. It then drafts distinct shots for fixed story beats with exact timing. The file in `drafts/generated/` includes the story spine and production prompts. Strict preflight now runs **before** the render question; a weak hook or pacing plan stops before any costly media generation. Read the plan before answering `y` to render. Stop at the plan by answering `n` or with `npm run video:local -- --draft-only`.

To start with a saved brief or an idea from the local bank:

```sh
npm run ideas:bank
npm run video:local -- --idea IDEA_ID --draft-only
npm run video:local -- --answers path/to/brief.json --draft-only
```

`--answers` accepts JSON keys `topic`, `style`, `set`, `hook`, `mustShow`, `obstacle`, `turn`, `ending`, `audio`, `seconds`, and `orientation`. Set `audio` to `asmr`, `voiced`, or `auto`. The older `npm run make:any:mac` command remains an alias. The CLI does not need an online assistant, though it still uses your installed local Gemma or Ollama story model.

During a render the terminal shows a whole-job progress bar, completed LTX clip count and a rolling time estimate. Each LTX clip also keeps its own detailed model progress output. The estimate is approximate because clip runtime varies with model loading and Mac activity. To check an existing run from a second Terminal, use its saved scenario path:

```sh
npm run make:any:mac -- --status drafts/generated/YOUR-ID.local-scenario.json
npm run make:any:mac -- --status drafts/generated/YOUR-ID.local-scenario.json --watch
```

`--watch` refreshes every 30 seconds. This also works for a render started before the progress feature was added; leave that original Terminal running. Press Ctrl+C in the status Terminal to stop watching without interrupting the render.

To inspect the moving clips that have finished so far, create a quick contact sheet in another Terminal:

```sh
npm run make:any:mac -- --status drafts/generated/YOUR-ID.local-scenario.json --preview
```

This saves `preview-contact-sheet.png` in that render's `storage/any-local/` work folder. It extracts one frame at two seconds from each completed clip and does not pause or modify the ongoing render. Run it again later to include newly completed clips. Inspect the full moving MP4 when the render finishes; still frames cannot prove motion quality or story continuity.

After editing the plan, render it directly:

```sh
bash scripts/make-local-video.sh --scenario drafts/generated/YOUR-ID.local-scenario.json
```

Add `--chain-images` when each shot should retain the same subject; FLUX then edits the previous still. Use separate shots and explicit location, wardrobe and prop details in every image and motion prompt. Save any changes to the JSON before rendering. The script validates the schema and requires shot timings to add to the exact chosen runtime.

Local tools: Gemma through MLX (or Ollama fallback) for the editable plan; FLUX.2 Klein through MFLUX for still references; MLX LTX for actual moving clips; Kokoro ONNX for narration when selected; locally generated or licensed audio; FFmpeg for motion retiming, mixing and MP4 output. The render saves assets under `storage/any-local/` and final MP4s under `outputs/`. Verified clips and stills are reused on reruns; keep the cache when trying another export. Each uncached motion clip takes several minutes on the tested 16 GB Mac. The installed ArtCraft desktop apps are currently manual options; see [integration plan](ARTCRAFT_LOCAL_INTEGRATION.md). They are not yet part of this command.

The command has structural and technical checks, but final review is still required for subject continuity, physical motion, claims, pronunciation and sound. It does not fetch a current commercial song. Fix a weak shot by editing its prompt and rerunning the same scenario. Changing a prompt creates new cache keys for that shot.

The story planner rejects repeated prompt text and narration that is too long for its shot. It no longer pads a short draft to the requested runtime. The renderer also rejects a 60-second plan with only three long shots, because it would generate repeated motion from the same references. These are structural checks; the local 1.7B text model can still make weak creative choices. Give the ending question a concrete answer such as "the driver reaches an empty seaside lookout at sunrise" to steer the story. A story draft remains a review step, not a guarantee of a coherent final film.

On this Mac the script defaults to the already installed `gemma-local` text model through MLX. It uses Ollama `qwen3:1.7b` if that Gemma installation is absent. You can select another installed Ollama model with `npm run make:any:mac -- --model MODEL_NAME` or set `SHORTS_STORY_MODEL=MODEL_NAME`. The image, motion, voice and editing stages stay local and unchanged. Gemma is larger and can take longer to draft, but avoids downloading another model.
