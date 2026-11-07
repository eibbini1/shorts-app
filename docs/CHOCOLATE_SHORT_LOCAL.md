# Make the 30-second chocolate Short on the Mac

This video uses six connected local LTX motion clips of one chocolate dessert, offline
Kokoro narration, FFmpeg, and an original 96 BPM rhythm and sound effects made
by the project. It makes a 720 × 1280, 24 fps, 30-second H.264/AAC MP4 and a
contact sheet for review. The final line explains how tart raspberry balances
rich pistachio and chocolate. It does not call a paid generation service.

## One-time setup

From the repository root on the Apple Silicon Mac:

```sh
npm run setup:mac
```

The opening and reveal images are included under `assets/demo/chocolate-shell/`.

## Generate and review

```sh
npm run make:chocolate:mac
```

The first run generates six connected 4-second LTX shots from the opening and
reveal reference images. On a 16 GB Apple Silicon Mac, allow roughly 30 minutes
for model generation. The files are cached under
`storage/chocolate-short-local/motion`, so later renders reuse them. You can
generate just the shots with `npm run chocolate:motion:mac`.

The command prints a timestamped MP4 path under `storage/chocolate-short-local`.
It also writes a matching `.review.png` contact sheet. To choose another output:

```sh
npm run make:chocolate:mac -- "$PWD/storage/chocolate-short-local/my-cut.mp4"
```

Open the MP4 with sound and inspect the contact sheet. The script checks the
30-second duration, frame count, dimensions, and decode. Check the voice level,
caption reading time, and reveal on a phone before using it publicly.

To make a voice-and-effects version for adding a current song in YouTube's
Shorts editor, run:

```sh
CHOCOLATE_MUSIC_MODE=none npm run make:chocolate:mac
```

## Music and visual limits

The background rhythm is original, made locally without samples. Every visual
section in this version comes from LTX motion footage. The clip sequence is
generated from the final frame of the previous shot to keep the dessert, plate,
lighting, and spoon connected. Review the output because local generative video
can still introduce small changes between shots or unrealistic food motion.

For a chart song that is currently trending on YouTube, select it using YouTube's
Shorts audio picker when uploading. Do not embed a downloaded copy into the MP4:
music added outside the Shorts creation tools can receive a normal copyright
claim. The original soundtrack keeps the local preview usable without that step.
