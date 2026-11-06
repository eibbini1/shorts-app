# Continue on the M1 Mac

## Current handoff

Use feature/hook-log in https://github.com/eibbini1/shorts-app.
This branch contains the automation code, goal plan, research evidence and Mac
motion test. The user reports an Apple M1 MacBook Pro with 16 GB unified memory.

The app can assemble supplied moving footage, generate reviewed draft files,
render captions and sound, verify packs and schedule connected YouTube uploads.
Realistic image to video generation has not been verified on the Mac.
The full 100 channel study and retention comparison remain unfinished.

## Get the project

In Terminal, use an empty parent directory and run

    git clone --branch feature/hook-log https://github.com/eibbini1/shorts-app.git
    cd shorts-app
    git status
    sh scripts/check-mac-video.sh

Authenticate through GitHub's normal flow if the private repository requires it.
If the repository is already cloned, preserve local changes, fetch origin and
switch to the existing feature/hook-log branch. Do not overwrite local work.

Open this folder in Codex. Paste the continuation prompt below.

## Continuation prompt

Continue the existing BB Shorts app goal from docs/GOAL_PLAN.md on
feature/hook-log. This machine is an Apple M1 MacBook Pro with 16 GB unified
memory. Inspect the actual machine and repository before relying on handoff
claims. Preserve local work.

Read docs/MOTION_ACCEPTANCE_TEST.md, docs/AUTOMATION.md,
scripts/check-mac-video.sh and scripts/test-mac-motion.sh. Verify macOS,
architecture, free memory and disk space. Check Node, Python 3.11 or later,
FFmpeg and the project's package requirements. Install compatible project
dependencies and run build, lint and relevant tests.

The next primary deliverable is real image to video generation with natural
subject movement comparable to the user's Seedance on Higgsfield reference.
Camera movement over a still image alone does not meet the goal.

Evaluate the documented dgrauet/ltx-2-mlx 2.3 q4 runtime in an isolated environment.
Review and pin an upstream revision and inspect model licensing before setup.
Keep generation local and preserve the user's requirement to approve paid
generation separately. Check the model's full download and memory requirements.
Use a clean local source image that I provide. If none is available, ask me for
its local path rather than assuming Windows media was transferred.

Run a short image-conditioned smoke test using scripts/test-mac-motion.sh.
Record the exact runtime revision, model, source hash, prompt, seed, settings,
generation time, peak memory if measurable and output path. Diagnose recoverable
failures. Review the full clip for identity, geometry, contact, motion and flicker.
If the selected model does not run or fails quality review, investigate a
compatible alternative and report the evidence.

After the smoke test passes, create the 10 second acceptance video through the
app with matching narration, readable captions, sound and a visual payoff.
Return a playable local preview and a concrete comparison with the original
Golden Fries reference where it is available. Make no unsupported quality or
engagement claims.

The existing Windows worker and YouTube uploads are production state. Keep this
Mac work in preparation mode until publishing ownership and credentials are
explicitly configured. Do not overwrite uploaded versions, clear upload journals
or bypass spending approvals to make progress.

Update docs/GOAL_PLAN.md with verified results, unfinished work and next steps.
Commit and push verified changes to feature/hook-log. The overall goal remains
active until the complete requirements and creative acceptance criteria are
proved.

## Files that stay on Windows

Git excludes OAuth credentials, tokens, render outputs, raw analytics exports,
voice caches and source media under storage. Cloning this repository does not
transfer them. The Mac needs its own source image and local runtime setup.
YouTube sign-in is unnecessary for the initial generation and rendering test.

## Readiness limits

The Mac shell scripts have passed shell syntax checks. They have not run on the
Mac yet. Model output quality and Seedance equivalence are unverified.
Research currently includes a candidate pool, metadata screening and sampled
visual reviews. It is not a completed study of the best 100 channels.

## Bundled source image for the first smoke test

assets/demo/ferrari-source.jpg is included with attribution in assets/demo.
After the generation runtime is installed, a first subject-motion test is

    sh scripts/test-mac-motion.sh assets/demo/ferrari-source.jpg "The red sports car rolls forward slowly a short distance. The wheels rotate naturally. Keep the same body shape, paint, background and lighting. The camera stays still." storage/motion/car-test.mp4

This supplies an image immediately after clone. Actual output quality remains
unverified until the model runs and the whole clip is reviewed.

## Free narration for the Mac preview

The app's mock narration provider creates silent test audio. Use audible local
speech when reviewing the finished acceptance video. macOS includes the say
command. After creating the output directory, an example is

    say -o storage/motion/narration.aiff "One garage. Four dream cars. Which one gets your key?"
    ffmpeg -i storage/motion/narration.aiff -ar 48000 storage/motion/narration.wav

The existing render-demo command accepts a local audio file and matching text.
Check the local speech timing, pronunciation and caption alignment. The say
commands have not been run from this Windows environment.

## One-command Apple Silicon setup

From the cloned repository folder in Mac Terminal, run

    bash scripts/setup-mac.sh

If Node is already available, the equivalent command is

    npm run setup:mac

The installer bootstraps Homebrew if needed (its installer may request your Mac
password), Node 24, FFmpeg, uv, Git and Ollama. It installs project dependencies,
isolated ComfyUI and LTX-MLX runtimes, qwen3:1.7b, a Stable Diffusion 1.5 checkpoint,
the LTX 2.3 q4 files needed for the distilled motion test, and Kokoro 1.2.1
with an af_heart test recording. The first motion test also downloads the
separate Gemma text encoder used by LTX. Model files remain under ignored
`storage/`; `storage/setup/ltx-model-dir.txt` points the test at the selected
local model directory, so the CLI does not download the full LTX repository again.
The large transformer is downloaded in verified, restart-safe chunks with a
byte-based progress display; rerunning setup reuses completed chunks.
Allow at least 50 GiB free disk as a conservative setup budget. Downloads require
internet and can take considerable time. Runtime source revisions and model
revisions are recorded under storage/setup. Existing runtime checkouts are reused.
The script is rerunnable after an interrupted installation.

    npm run doctor:local
    npm run start:comfy:mac
    npm run test:motion:mac -- /absolute/reference.png "The shell cracks and crumbs fall" /absolute/test.mp4

Run the motion test in another Terminal after stopping ComfyUI to free memory.
The start command binds ComfyUI to localhost. A remote Windows worker requires
a separately configured reachable service. The downloaded image checkpoint is
a baseline candidate; image workflow selection and visual review are still needed.
LTX generation may download additional supporting assets on its first run.
Generated model caches and installation logs remain in ignored storage.

Shell syntax and the non-Mac rejection were checked on Windows. Installation,
model loading and generation on the actual M1 have not yet been tested.
