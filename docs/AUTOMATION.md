# Billionaire Bites automation

Run these commands from the app folder with Node 22.16+ and FFmpeg/ffprobe on PATH.

## Process the five recent Shorts

    npm run automate -- --dry-run
    npm run automate -- --prepare-only

The checked-in automation.json selects tuna, melon, coffee, cupcake and ortolan. It preserves their scripts, images and per-scene transitions. Add episode spec paths to its specs array as new episodes are ready. You can instead omit specs and set episodesDir to discover all *.assemble.json files in that directory.

Each episode passes through validation, variation checks, narration-cache checks, rendering, QA, metadata, three thumbnails, subtitles and hook logging. Failed episodes are reported individually and the queue continues. Exit status is nonzero if any episode fails.

Voice spending is disabled by default. The renderer also enforces cache-only narration, so a cache miss after preflight cannot silently request paid audio. Set allowVoiceSpend to true deliberately when generating narration for new scripts. Image generation is not triggered by this worker: provide the images referenced by each spec.

## Keep processing new or changed episodes

    npm run automate:watch

The worker runs immediately and then follows the cron expression in automation.json (default every 15 minutes, Asia/Amman). Keep the worker process running. Stop with Ctrl+C; an in-progress episode finishes before the lock is released.

Only one worker can run per app folder. storage/automation/worker.lock records its PID. After a machine crash, verify that PID is no longer running before removing a stale lock.

## Reports and reruns

- storage/automation/latest-run.json: per-episode outcomes for the last cycle.
- storage/automation/*.log: full pipeline output appended per episode.
- episodes/<name>.pack.json: video, three thumbnails, SRT/VTT, metadata, checksums and input fingerprint.
- episodes/hook-log.jsonl: opening lines, descriptive tags, and empty performance fields for later measurement.

A complete pack is reused only when the source spec, images, narration cache, font and app source fingerprint match and every output checksum still matches. Missing or edited artifacts rebuild the pack. Successful rendering writes .render-receipt.json beside the video, allowing packaging failures to resume without rendering again. Do not edit inputs during an active render.

For an existing video you have independently checked against the spec:

    npm run pipeline -- --spec episodes/tuna-ep1.assemble.json --skip-render

That explicit option packages the existing video and still runs QA. Normal automation renders or uses a verified render receipt.

## Scheduled publishing

Scheduled publishing is enabled in automation.json, as requested. Default: one Short daily at 20:00 Amman time (UTC+3), with at least an hour of lead. The worker chooses separate future calendar days for pending episodes. Dry-run previews dates without network access or uploads. Use --prepare-only to prepare packs without publishing.

Follow [YOUTUBE_SETUP.md](YOUTUBE_SETUP.md) for the one-time connection. New uploads begin private, receive a thumbnail and captions, then get a publishAt time. The worker confirms that time through the API before reporting scheduled. Existing remote IDs are saved before attachments so a rerun resumes the same upload. An ambiguous initial upload response blocks automatic retry until Studio is checked.

The worker reports needs-connection when OAuth is absent. It can still finish all episode packs. API project restrictions may prevent scheduled public publication until YouTube approves the project.

npm run list-pending shows preparation and publication state. npm run verify-live-run checks current spec/media fingerprints, output checksums and passing QA reports.

## Draft new episodes before spending

The worker also processes drafts/briefs.json into drafts/generated/*.draft.json and readable Markdown reviews. The initial briefs cover Parmigiano Reggiano crystals, a documented chocolate-egg auction in 2012, and San Gimignano saffron. Each brief carries dated primary-source links, supported claims, six narration scenes and visual prompts. Draft generation is local: it makes no LLM, image or voice API calls. Add researched source briefs to the queue to generate additional drafts.

Drafts preserve the existing brand, narration settings, tight opening and scene transitions. They stay outside episodes/ and never render or publish automatically. Existing drafts are preserved on reruns so review edits are not overwritten.

Run npm run draft-shorts to generate pending drafts. After reviewing a specific draft against its sources, the user can run:

    npm run approve-draft -- --draft drafts/generated/EPISODE_ID.draft.json --facts-reviewed --confirm EPISODE_ID

That approves content only and creates the episode spec plus a source-review receipt. It does not approve spending, generate images, or add the episode to the production queue. Supply the referenced scene images, then add the spec path to automation.json. If narration is uncached, the worker still refuses paid generation while allowVoiceSpend is false. Approve any paid generation separately after review.

## Start after Windows sign-in

See [WINDOWS_WORKER.md](WINDOWS_WORKER.md). The sign-in task is installed and verified running as of 2 November 2026. The launcher survives expected stderr messages, writes separate output/error logs, and restarts processing at sign-in. A Windows job object keeps worker/render subprocesses attached to the task; verified shutdown and restart leave exactly one live worker. The initial CIM restriction was resolved after permissions changed.

## Runtime and dependency compatibility

Node 22.16+ is required; verification used Node 26.13. SQLite uses Node's built-in module. node-cron v4 supplies its own TypeScript types and runs the worker with noOverlap enabled. ESLint and Vitest were updated alongside their compatible dependencies. A minimatch 11 override removes the October 2026 globparts-amplification advisory; lint and test discovery are checked against that version. The override should be reviewed when upstream ESLint and typescript-eslint adopt minimatch 11 themselves.

### Local footage in a scene

In a spec with `kind: "stills"`, add a `video` path to any scene
alongside its existing `image` and `text`. Use a local clip trimmed to the
action you want, such as fries falling into frame. The renderer center-crops
to the output dimensions and repeats short clips to cover the narration. Source audio is muted by default. For a portrait shot, set
`"sourceAudioGain": 0.35` to blend the clip's first audio track under narration. Narration, captions, and transitions come from the episode.
Use a clip long enough to cover the scene when a repeat would be visible.

Draft briefs may set an optional `visualStyle` string for another subject,
such as automotive studio photography with metallic reflections. This changes
the visual prompt prefix. The supplied narration, sources, and reference
spec still control the content, branding, and voice.

## Image to video acceptance criteria

The required creative outcome is to turn supplied images into realistic moving
shots, using the user's Seedance on Higgsfield reference as the visual benchmark.

Acceptance requires visible subject or environmental movement within the shot,
consistent identity and geometry, and review of artifacts across the full clip.
Camera moves over photographs and editing supplied footage are verified current
capabilities. They do not establish completion of image to video generation.

Next verification is a 10 second prototype with generated subject movement,
matching narration, captions and sound. Record the source image, motion prompt,
model version, generation settings, clip and visual QA result. Compare movement
and opening hooks in separate experiments before claiming audience improvement.

### Local generation hardware finding

On November 4 2026, nvidia-smi reported an NVIDIA GeForce MX330 with 2048 MiB
VRAM. The official Wan2.2 TI2V 5B example documents at least 24 GB VRAM.
The current machine therefore does not meet that documented configuration.
Quantized or CPU offload alternatives require separate measurement and visual QA.
A Seedance-like output quality claim remains unverified.

Source https://github.com/Wan-Video/Wan2.2

## Repeatable channel statistics

Run npm run channel-snapshot to collect the connected BB channel's current video
metadata and public counters. It checks the expected channel ID, traverses the
uploads playlist, batches video requests and saves an archived snapshot plus
storage/analytics/bb-latest.json. These local files remain ignored by Git.
The command does not provide retention curves or stayed to watch.

Portrait scenes may set `"colorGrade": "food"` for mild contrast and color
without grain or a vignette, or `"colorGrade": "natural"` to keep the shot's
source look. Omit the field or use `"cinema"` for the existing grade.
These controls grade supplied stills and footage; they do not generate motion.
