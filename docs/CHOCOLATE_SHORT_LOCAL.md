# Make the 30-second chocolate Short on the Mac

This local preview uses the existing LTX chocolate motion test, the two bundled
chocolate images, offline Kokoro narration, FFmpeg, and an original 96 BPM rhythm
and sound effects synthesized by the project. It makes a 720 × 1280, 24 fps,
30-second H.264/AAC MP4 and a contact sheet for review. It does not call a paid
generation service or download chart music.

## One-time setup

From the repository root on the Apple Silicon Mac:

```sh
npm run setup:mac
```

The motion source must already exist at `storage/setup/chocolate-motion-smoke.mp4`.
If missing, make it with:

```sh
npm run test:motion:mac -- "$PWD/assets/demo/chocolate-shell/opening.png" \
  "The chocolate shell slowly cracks open, revealing the filling; natural macro motion" \
  "$PWD/storage/setup/chocolate-motion-smoke.mp4"
```

## Generate and review

```sh
npm run make:chocolate:mac
```

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

The background rhythm is original, made locally without samples. The spoon moves
in the opening LTX clip. Later shots use controlled moves over the existing
reference images; the actual shell fracture was not captured as video. This is
a complete preview, with a clear still-image reveal, rather than a claim that
the shell cracked naturally in motion.

For a chart song that is currently trending on YouTube, select it using YouTube's
Shorts audio picker when uploading. Do not embed a downloaded copy into the MP4:
music added outside the Shorts creation tools can receive a normal copyright
claim. The original soundtrack keeps the local preview usable without that step.
