#!/usr/bin/env bash
# Overlay an animated Three.js chef on a finished, real-moving vertical food film.
set -euo pipefail
cd "$(dirname "$0")/.."
input=''; output=''; check_only=0
while (($#)); do
  case "$1" in
    --input) input="${2:?Missing input video}"; shift 2 ;;
    --output) output="${2:?Missing output video}"; shift 2 ;;
    --check) check_only=1; shift ;;
    -h|--help) echo 'Usage: bash scripts/add-mini-chef.sh --input VIDEO.mp4 [--output VIDEO-chef.mp4] [--check]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ -f "$input" ]] || { echo "Missing video: $input" >&2; exit 2; }
input="$(cd "$(dirname "$input")" && pwd)/$(basename "$input")"
if [[ -z "$output" ]]; then output="${input%.mp4}-chef.mp4"; fi
[[ "$output" == /* ]] || output="$(pwd)/$output"
[[ "$input" != "$output" ]] || { echo 'Output must differ from input.' >&2; exit 2; }
width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nk=1:nw=1 "$input")"
height="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nk=1:nw=1 "$input")"
[[ "$width" -lt "$height" ]] || { echo 'Mini chef is currently composed for vertical food video.' >&2; exit 2; }
seconds="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$input")"
[[ -d mini-chef-studio/node_modules ]] || { echo 'Install mini-chef-studio dependencies first: cd mini-chef-studio && npm install' >&2; exit 2; }
if ((check_only)); then echo "Ready: ${width}x${height}, ${seconds}s, mini chef overlay available."; exit 0; fi
cp "$input" mini-chef-studio/public/food.mp4
temporary="$(mktemp -d /tmp/shorts-mini-chef.XXXXXX)"
props="$temporary/props.json"
trap 'rm -rf "$temporary"' EXIT
python3 - "$seconds" "$props" <<'PY'
import json,sys
json.dump({'durationSeconds':float(sys.argv[1])},open(sys.argv[2],'w'))
PY
mkdir -p "$(dirname "$output")"
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
browser_args=()
[[ ! -x "$chrome" ]] || browser_args=(--browser-executable "$chrome")
(cd mini-chef-studio && ./node_modules/.bin/remotion render src/index.ts MiniChefFood "$output" --props "$props" --concurrency=1 --gl=angle --overwrite "${browser_args[@]}")
python3 scripts/qa-local-video.py --video "$output"
echo "Mini chef food film: $output"
