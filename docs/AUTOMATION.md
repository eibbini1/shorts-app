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

For a portrait action that should happen once, set `"videoFill": "hold"`.
The clip plays once and the last frame holds to cover the rest of the scene.
Its source sound does not repeat. Omit the field for the existing loop mode.

## BB channel manager workflow

Use this checklist for each new Short, from the editorial brief through review
of audience response.

1. **Research and compare.** Check BB's catalog for duplicates. Study relevant
   clips for their first shot, question, pacing, sound, and visible payoff.
   Record what was actually reviewed. Use primary sources for factual claims.
2. **Script the hook and payoff.** Put a visible action and a specific question
   in the opening. Give a clue in the middle. Answer the exact question on
   screen before the ending. Avoid reusing a BB story or footage without a
   genuinely new production.
3. **Create images and motion.** The chocolate reference images were made
   with Codex's built-in image generation in chat, without a Shorts app API
   call or API key. Availability and usage limits depend on the Codex plan;
   this does not promise unlimited free images. The app's automation does not
   generate images. Save approved stills as scene images. Film or separately
   generate moving shots, then add their files as scene video inputs. The
   local Mac motion route still requires a real generation test. Keep paid
   generation behind explicit approval.
4. **Edit and review.** Check that the action looks natural at phone size.
   Use the Food or Natural grade as appropriate, keep captions off the food,
   and mix the real crack or sizzle where useful. Use hold mode when the
   action should play only once. Review muted and with sound, then run QA.
5. **Package, upload and publish.** Verify sources and asset permissions,
   title, description, captions and applicable disclosures. Upload the passing
   pack to the configured BB channel, confirm the scheduled time, and preserve
   the upload journal. Check the live video before calling it published.
6. **Manage comments.** Review comments and draft specific, helpful replies
   or one question to pin. Publish replies or pins only when instructed.
   Treat comments as viewer feedback, not as a guarantee of reach.
7. **Measure and iterate.** Compare comparable Shorts at 24 and 72 hours
   using Stayed to watch, engaged views, retention at the reveal, and
   subscribers gained per 1,000 engaged views when available. Log the hook
   and what changed. Choose one clear change for the next test.

## Agent quick start: portrait production settings

Keep the default queue untouched while testing. Use a separate episode spec
and output path, run assemble-abdul locally, then run qa-check. Only move an
episode into the production queue after source, originality, hook payoff,
audio, captions, and publish-pack review. Do not commit credentials, private
analytics, local scratch renders, or unrelated untracked work.

- Episode: `"portraitHeight": 1920` renders 1080x1920 from the scene media and
  scales the app's hook and captions for the output. Default: 720x1280.
  Choose sharp original footage; export resolution does not recover detail.
- Episode: `"tightOpen": true` trims leading narration silence, with optional
  `"hookText"` for the first frames. Use an opening action and a question that
  the final shot answers; do not give away the payoff in the description.
- Scene: `"video"` points to moving footage; `"image"` remains required.
  `"videoFill": "hold"` plays the action once, then holds the final frame.
  Default: loop. Use source footage long enough for the desired movement.
- Scene: `"colorGrade": "food"` uses a mild grade without vignette or grain.
  `"natural"` skips the grade; `"cinema"` is the existing default.
- Scene: `"sourceAudioGain": 0.35` blends the original clip's audio with the
  narration. Default: muted. A positive gain requires an audio track.
- Portrait transitions: cut, punch, whip, fade, flash, gold. Prefer cutting
  on food action. Rack focus, a real fracture, and a slow spoon lift are
  shooting or generation directions, not transition presets.

Verification: the 1080x1920 portrait test rendered the hook overlay, Food
grade, and a short moving clip with hold and source audio. FFprobe reported
1080x1920 and the export decoded successfully. Build and lint passed.
The preceding full suite passed 97 tests at 06a5f4f. No upload was made.

For priorities and unfinished work, see GOAL_PLAN.md. For the M1 setup see
MAC_HANDOFF.md and BB_CHOCOLATE_SHELL_PRODUCTION.md. The chocolate opening and
reveal stills are bundled; generated subject motion remains unverified.

## Run the app yourself, from idea to upload

Open a terminal in the repository root. On Windows: `Set-Location D:\shorts-app`.
On a Mac, open the cloned folder. Install Node 22.16+ and FFmpeg with ffprobe,
then run `npm ci`. Leave the existing automation queue alone for a new test.

1. Pick a new idea. Check your channel for overlap, write the hook and its
   payoff, verify any facts, and gather original or cleared images and clips.
   Optionally run `npm run draft-shorts` to prepare the configured briefs.
   The app does not generate source images or moving footage on its own.
2. Save a new spec as `episodes/my-new-video.assemble.json`. Copy a matching
   example if available, but choose new filenames, text, media and output.
   This is a minimal portrait test spec (supply the referenced files first):

       {
         "kind": "stills",
         "portraitHeight": 1920,
         "output": "storage/episodes/my-new-video/final.mp4",
         "fps": 30,
         "brand": { "name": "Billionaire Bites" },
         "voice": { "provider": "mock" },
         "tightOpen": true,
         "hookText": "WHAT IS INSIDE?",
         "scenes": [
           {
             "image": "storage/episodes/my-new-video/opening.jpg",
             "video": "storage/episodes/my-new-video/opening.mp4",
             "text": "What is hiding inside this shell?",
             "transition": "cut",
             "videoFill": "hold",
             "colorGrade": "food",
             "sourceAudioGain": 0.35
           }
         ]
       }

   Add more scenes to deliver the answer. Remove video-specific fields if you
   only have a still, and omit sourceAudioGain if the video has no audio.
   For full-width 16:9, remove portraitHeight, set `"width": 1920` and
   `"height": 1080`, use landscape media, and omit videoFill, colorGrade and
   sourceAudioGain. The landscape renderer supports cut, fade, flash and gold.
3. Render a local layout test with
   `npm run assemble-abdul -- --spec episodes/my-new-video.assemble.json`.
   Mock narration is silent; it is for layout only. Before release, use the
   configured narration provider and cached voice. If you explicitly approve
   paying for new narration, use the pipeline with `--allow-voice-spend`.
   No paid generation should be started merely to test the layout.
4. For the final pack, run
   `npm run pipeline -- --spec episodes/my-new-video.assemble.json`.
   This renders, checks QA, creates metadata, thumbnails and captions, and
   records the hook. It does not upload. Review the full MP4 and resulting
   pack: image and voice, title, description, credits, captions and disclosure.
   You can recheck a video with `npm run qa-check -- --video PATH --expect portrait`
   or `--expect landscape` for full-width. Replace PATH with the actual MP4.
5. To schedule only this pack, follow YOUTUBE_SETUP.md if OAuth is not
   connected. Verify publish.expectedChannelId in automation.json, then run
   `npm run yt-upload -- --pack episodes/my-new-video.pack.json`.
   The command schedules a verified pack; it is not a preview. For an optional
   explicit slot, pass `--at ISO_TIMESTAMP` at least one hour ahead.
   Check the confirmed video ID and time in Studio. Keep the upload journal.
6. After publication, capture the audience metrics described above and
   review comments. Use those results when selecting the next hook.

For a read-only hook audit, run `npm run channel-snapshot` then
`node scripts/bb-hook-audit.mjs` from the repository root. This joins local
hook rows to uploaded IDs and snapshot visibility, and flags stale or
ambiguous local hook rows. It does not verify the narration of an older
remote cut or fill in missing audience metrics.

To review comments without posting, refresh the channel snapshot and run
`node --import tsx scripts/bb-comment-review.mjs`. This verifies the connected
channel and shows viewer threads with zero replies from a limited set of
recent public uploads with comments. Channel-authored prompts are excluded.

Add `--video VIDEO_ID` to check a specific public BB upload even if the
snapshot lists zero comments. The command confirms ownership and visibility
against YouTube before fetching its threads.

### Write a scenario and control its length

Write the scenario as a list of beats first. For each beat, note the target
time, what the viewer sees, the exact spoken line, and which sound should
lead. Translate each beat into one item in the JSON scenes array, in order.
Put the spoken line in text, your source path in image and optionally video,
and the cut style in transition. Save as UTF-8 JSON with double quotes and
no trailing commas.

Example 14–16-second planning target:
- 0–3 s: Show a spoon tapping a chocolate shell. "What's hiding under the gold?"
- 3–9 s: Show the shell starting to split. Let the real snap come through.
- 9–14 s: Reveal the green and red filling. "Pistachio cream. Raspberry underneath."
- Use any remaining beat to hold the close-up and let viewers see the answer.

These are planning times, not a JSON duration field. The stills renderers
calculate each scene from its narration plus lead and tail padding, including
a longer final tail. The video path does not set the scene duration. The
portrait renderer can loop or hold short source footage to fit; long clips
are cut at the end of their scene. Render a preview, measure it with
`ffprobe -v error -show_entries format=duration -of csv=p=0 PATH`, then
shorten or extend the script and re-render. Never use mock narration to
judge the final spoken pacing. For full-width videos, use the same beats
but plan a longer structure with sections and verify actual section times
after rendering.

### Use a recorded voice file

A scene may supply `"narration": {"file": "path/to/take.wav", "words": [...]}`.
Each item in words is an object such as `{"word":"Hello","start":0.10,"end":0.42}`.
Use seconds relative to the start of the WAV, ordered and without overlaps.
Words joined with spaces must match scene.text, including punctuation.
The pipeline validates the recording and uses it for captions and subtitles.
That scene makes no paid narration request; other scenes keep their usual
provider and spending checks. This is not a Brian voice clone.

### Motion review for footage-led Shorts

Set `"requireMotion": true` in the episode spec or pass `--require-motion`
to qa-check. This rejects detected static stretches of 2.5 seconds or more.
It does not prove that motion comes from the food; a moving caption or a pan
can fool the detector. For BB action Shorts, also review actual contact,
motion and food texture, original sound, final voice, and caption placement
before approving the cut. Do not publish the chocolate still-image preview.
