#!/bin/sh
# Run after installing the reviewed ltx-2-mlx runtime on the Mac.
set -eu
if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  printf '%s\n' 'Run this generation test on an Apple Silicon Mac.'
  exit 1
fi
if [ "$#" -ne 3 ]; then
  printf '%s\n' 'Usage: sh scripts/test-mac-motion.sh IMAGE MOTION_PROMPT OUTPUT.mp4'
  exit 1
fi
image=$1
prompt=$2
output=$3
runtime=${LTX_MLX_BIN:-ltx-2-mlx}
if [ ! -f "$image" ]; then
  printf '%s\n' 'Source image does not exist.'
  exit 1
fi
if [ -e "$output" ]; then
  printf '%s\n' 'Choose a new output path to preserve the existing clip.'
  exit 1
fi
command -v "$runtime" >/dev/null 2>&1 || {
  printf '%s\n' 'Install the reviewed ltx-2-mlx runtime or set LTX_MLX_BIN to its executable.'
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  printf '%s\n' 'Install FFmpeg before running the test.'
  exit 1
}
mkdir -p "$(dirname "$output")"
"$runtime" generate --model dgrauet/ltx-2.3-mlx-q4   --distilled --low-ram --image "$image" --prompt "$prompt"   -H 640 -W 384 -f 49 --frame-rate 24 -o "$output"
ffprobe -v error -show_entries stream=codec_name,width,height   -show_entries format=duration -of json "$output"
printf '%s\n' 'Review all frames for subject identity, geometry, contact and natural motion.'
