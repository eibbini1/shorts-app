#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/make-local-video.sh
  bash scripts/make-local-video.sh --draft-only [--model gemma-local]
  bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json [--chain-images] [--stills FOLDER] [--allow-repeat]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json [--watch]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --preview

The interactive path asks for a subject, visual style, runtime, and orientation.
It saves a local Ollama shot plan for review before expensive rendering.
USAGE
}

default_model='qwen3:1.7b'
[[ -s storage/setup/gemma-model-dir.txt ]] && default_model='gemma-local'
scenario=''; status=''; chain=''; stills=''; allow_repeat=''; draft_only=0; watch=0; preview=0; model="${SHORTS_STORY_MODEL:-$default_model}"
while (($#)); do
  case "$1" in
    --scenario) scenario="${2:?Missing scenario path}"; shift 2 ;;
    --status) status="${2:?Missing scenario path}"; shift 2 ;;
    --watch) watch=1; shift ;;
    --preview) preview=1; shift ;;
    --chain-images) chain='--chain-images'; shift ;;
    --stills) stills="$2"; shift 2 ;;
    --allow-repeat) allow_repeat='--allow'; shift ;;
    --draft-only) draft_only=1; shift ;;
    --model) model="${2:?Missing model name}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

if [[ -n "$status" ]]; then
  [[ -z "$scenario" ]] || { echo 'Use --status or --scenario, not both.' >&2; exit 2; }
  status_args=(--scenario "$status")
  if ((watch)); then status_args+=(--watch); fi
  if ((preview)); then status_args+=(--preview); fi
  if ((preview)); then
    storage/tools/ComfyUI/.venv/bin/python scripts/local_video_progress.py "${status_args[@]}"
  else
    python3 scripts/local_video_progress.py "${status_args[@]}"
  fi
  exit 0
fi
((watch == 0)) || { echo '--watch requires --status.' >&2; exit 2; }
((preview == 0)) || { echo '--preview requires --status.' >&2; exit 2; }

if [[ -z "$scenario" ]]; then
  read -r -p 'What is the video about? ' topic
  [[ -n "${topic//[[:space:]]/}" ]] || { echo 'Please enter a video idea.' >&2; exit 2; }
  read -r -p 'Visual style and tone [cinematic, warm]: ' style
  style="${style:-cinematic, warm}"
  read -r -p 'What should change or happen by the end? [let the model choose]: ' ending
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
  if [[ "$model" != 'gemma-local' ]] && ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null; then
    echo 'Starting local Ollama...'; brew services start ollama
  fi
  id="local-video-$(date +%Y%m%d-%H%M%S)"
  node scripts/story-scenario.mjs "$topic" "$id" --style "$style" --ending "$ending" --format "$format" --seconds "$seconds" --model "$model"
  scenario="drafts/generated/$id.local-scenario.json"
  echo "Review the shot plan: $scenario"
  python3 - "$scenario" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print('Title:',data['plan']['title'])
print('Story model:',data.get('model','unknown'))
if 'storyArc' in data:
    arc=data['storyArc']
    print('Story:',arc['goal'],'→',arc['obstacle'],'→',arc['turn'],'→',data['plan']['payoff'])
    repairs=data.get('qualityChecks',{}).get('fieldsNeedingRepair',0)
    if repairs: print('Review closely:',repairs,'shot field(s) needed an automatic repair.')
for i,shot in enumerate(data['plan']['shots'],1):
    beat=data.get('storyArc',{}).get('beats',[])
    label=beat[i-1]['label'] if len(beat)>=i else 'Shot'
    print(f"  {i}. {label} | {shot['seconds']}s | {shot['narration'][:100]} | {shot['motionPrompt'][:110]}")
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
python3 scripts/preflight-short.py "$scenario" ${allow_repeat:+$allow_repeat} || { echo "Preflight blocked this scenario (repeat topic). Change the topic, or add --allow-repeat to render anyway." >&2; exit 3; }
echo "Rendering local video to $output"
python3 scripts/render-any-local.py --scenario "$scenario" --output "$output" ${chain:+$chain} ${stills:+--stills "$stills"}
echo "Video ready: $output"
python3 scripts/finish-local-video.py --scenario "$scenario" --video "$output" && echo "Captioned video and upload pack are next to $output"
python3 scripts/qa-local-video.py --video "${output%.mp4}.captioned.mp4" || echo "QA found problems: read the qa block in ${output%.mp4}.pack.json before uploading." >&2
