#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/make-local-video.sh
  bash scripts/make-local-video.sh --draft-only
  bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json [--chain-images]

The interactive path asks for a subject, visual style, runtime, and orientation.
It saves a local Ollama shot plan for review before expensive rendering.
USAGE
}

scenario=''; chain=''; draft_only=0
while (($#)); do
  case "$1" in
    --scenario) scenario="${2:?Missing scenario path}"; shift 2 ;;
    --chain-images) chain='--chain-images'; shift ;;
    --draft-only) draft_only=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

if [[ -z "$scenario" ]]; then
  read -r -p 'What is the video about? ' topic
  [[ -n "${topic//[[:space:]]/}" ]] || { echo 'Please enter a video idea.' >&2; exit 2; }
  read -r -p 'Visual style and tone [cinematic, warm]: ' style
  style="${style:-cinematic, warm}"
  read -r -p 'Length in seconds [30, max 60]: ' seconds
  seconds="${seconds:-30}"
  [[ "$seconds" =~ ^[0-9]+$ ]] && ((seconds >= 10 && seconds <= 60)) || { echo 'Length must be 10-60 seconds.' >&2; exit 2; }
  read -r -p 'Orientation: vertical or wide [vertical]: ' orientation
  orientation="${orientation:-vertical}"
  orientation="$(printf '%s' "$orientation" | tr '[:upper:]' '[:lower:]')"
  case "$orientation" in
    vertical|short|portrait) format='short' ;;
    wide|horizontal|landscape) format='long' ;;
    *) echo 'Choose vertical or wide.' >&2; exit 2 ;;
  esac
  if [[ "$format" == 'long' ]] && ((seconds < 60)); then echo 'Wide format requires 60 seconds in the current scenario schema.' >&2; exit 2; fi
  if ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null; then
    echo 'Starting local Ollama...'; brew services start ollama
  fi
  id="local-video-$(date +%Y%m%d-%H%M%S)"
  node scripts/bb-local-scenario.mjs "$topic. Visual style and tone: $style." "$id" --brand 'Local Studio' --format "$format" --seconds "$seconds"
  scenario="drafts/generated/$id.local-scenario.json"
  echo "Review the shot plan: $scenario"
  python3 - "$scenario" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print('Title:',data['plan']['title'])
for i,shot in enumerate(data['plan']['shots'],1):
    print(f"  {i}. {shot['seconds']}s | {shot['narration'][:100]} | {shot['motionPrompt'][:110]}")
if data['plan']['claimsToCheck']:
    print('Claims to check:', '; '.join(data['plan']['claimsToCheck']))
PY
  if ((draft_only)); then exit 0; fi
  read -r -p 'Render this plan locally now? [y/N] ' proceed
  proceed="$(printf '%s' "$proceed" | tr '[:upper:]' '[:lower:]')"
  [[ "$proceed" == 'y' || "$proceed" == 'yes' ]] || { echo "Plan saved. Edit it, then run: bash scripts/make-local-video.sh --scenario '$scenario'"; exit 0; }
else
  ((draft_only == 0)) || { echo '--draft-only cannot be combined with --scenario.' >&2; exit 2; }
fi

[[ -f "$scenario" ]] || { echo "Missing scenario: $scenario" >&2; exit 2; }
base="$(basename "$scenario" .local-scenario.json)"
base="${base%.json}"
output="outputs/$base-$(date +%Y%m%d-%H%M%S).mp4"
echo "Rendering local video to $output"
python3 scripts/render-any-local.py --scenario "$scenario" --output "$output" ${chain:+$chain}
echo "Video ready: $output"
