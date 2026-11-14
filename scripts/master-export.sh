#!/usr/bin/env bash
# Export a finished 720x1280 film to 1080x1920 for platform compliance (lanczos + light sharpen, audio untouched).
# This is an EXPORT step, not a quality gain: only natively generated frames (see docs/ROADMAP.md, bench-ltx-hires.sh) add real detail.
# usage: bash scripts/master-export.sh IN.mp4 OUT.mp4
set -euo pipefail
ffmpeg -hide_banner -loglevel error -y -i "$1" \
  -vf "scale=1080:1920:flags=lanczos,unsharp=5:5:0.35:3:3:0.0" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart -c:a copy "$2"
ffprobe -v error -show_entries stream=codec_type,width,height -of csv=p=0 "$2" | tr '\n' ' '; echo
