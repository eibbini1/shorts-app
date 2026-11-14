# Local montage tool assessment — 14 November 2026

The current 16 GB M1 pipeline spends most of its time generating motion with MLX LTX. An editing package can improve the cut but cannot make that model's twelve clips for a 60-second film render in a couple of minutes.

| Tool | Mac status | Best fit | Decision |
| --- | --- | --- | --- |
| [FFmpeg](https://ffmpeg.org/ffmpeg-filters.html) 7.1.1 | Installed and used for edits, grade, mixing, QA | Exact timing, short fades, loudness normalization and voice/music ducking | Keep as the final render engine. Prototype sidechain ducking only against a known voice/music fixture, then verify loudness and captions. |
| [Remotion](https://www.remotion.dev/docs/transitioning) 4.0.543 | Declared in `mini-chef-studio`; used for Crumb | Custom comparison graphics, tracked labels, chef overlays and previewable motion design | Reuse the existing installation for a restrained versus title or split-screen. Avoid adding a transition solely because it exists. Its free license covers individuals and teams of up to three; see [terms](https://www.remotion.dev/docs/terms). |
| [PySceneDetect](https://www.scenedetect.com/docs/latest/) 0.7.3 | Installed in `storage/tools/scenedetect/.venv`; used in final scoring | Detect unexpected long shots or missing cuts | Keep. A soft dissolve may evade cut detection, so compare with the planned cut times. |
| [Auto-Editor](https://auto-editor.com/) | Not installed | Fast rough cuts from recorded footage based on audio, motion or subtitles | Evaluate for the separate footage montage path, not as a default for precisely timed generated shots. |
| [Beat This!](https://github.com/CPJKU/beat_this) | Not installed | Beat timestamps for music-led cuts | Benchmark its small model on the Mac and one licensed or original track before adding it. It brings PyTorch and a checkpoint; beat sync must not move narration/captions out of alignment. |

## Next measured edit experiment

Use the same finished film for two opening edits: a clean physical-action reveal and a comparison graphic. Preserve the same 30-second length, voice timing and source clips. Run final-file QA on both and have the owner watch and listen before selecting one. The [ten-Short review](FOOD_SHORTS_REVIEW_20261114.md) supplies examples, but its view counts do not establish which transition caused engagement.
