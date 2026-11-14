#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/make-local-video.sh
  bash scripts/make-local-video.sh --draft-only [--model gemma-local]
  bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json [--chain-images] [--cache-only] [--stills FOLDER] [--allow-repeat] [--allow-silence] [--allow-bad-first]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json [--watch]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --preview

The interactive path asks for a subject, visual style, runtime, and orientation.
It saves a local Ollama shot plan for review before expensive rendering.
USAGE
}

default_model='qwen3:1.7b'
[[ -s storage/setup/gemma-model-dir.txt ]] && default_model='gemma-local'
scenario=''; status=''; chain=''; stills=''; allow_repeat=''; cache_only=''; draft_only=0; watch=0; preview=0; model="${SHORTS_STORY_MODEL:-$default_model}"
while (($#)); do
  case "$1" in
    --scenario) scenario="${2:?Missing scenario path}"; shift 2 ;;
    --status) status="${2:?Missing scenario path}"; shift 2 ;;
    --watch) watch=1; shift ;;
    --preview) preview=1; shift ;;
    --chain-images) chain='--chain-images'; shift ;;
    --cache-only) cache_only='--cache-only'; shift ;;
    --stills) stills="$2"; shift 2 ;;
    --allow-repeat) allow_repeat='--allow'; shift ;;
    --allow-silence) allow_silence='--allow-silence'; shift ;;
    --allow-bad-first) allow_bad_first='--allow-bad-first'; shift ;;
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
t_start=$SECONDS
echo "Step 1/4  Environment check"
python3 scripts/check-env.py || { echo "Fix the FAIL lines above, then run this again." >&2; exit 4; }
echo "Step 2/4  Pre-render check (topic, hook, length, currency, claims)"
python3 scripts/preflight-short.py "$scenario" --strict ${allow_repeat:+$allow_repeat} || { echo "Preflight blocked this scenario. Fix the listed problems before rendering." >&2; exit 3; }
python3 scripts/audit-local-story.py "$scenario" || { echo 'Story gate blocked this scenario. Edit the plan before rendering.' >&2; exit 3; }
t_checks=$SECONDS
echo "Step 3/4  Rendering local video to $output (about 5 min per shot on an M1: still, motion, voice, assembly)"
python3 scripts/render-any-local.py --scenario "$scenario" --output "$output" ${chain:+$chain} ${cache_only:+$cache_only} ${allow_silence:+$allow_silence} ${allow_bad_first:+$allow_bad_first} ${stills:+--stills "$stills"}
t_render=$SECONDS
echo "Video ready: $output"
echo "Step 4/4  Shot-synced ASMR, captions, upload pack and quality check"
storage/tools/ComfyUI/.venv/bin/python scripts/add-sfx.py --scenario "$scenario" --video "$output"
finished_video="${output%.mp4}.sfx.mp4"
python3 scripts/finish-local-video.py --scenario "$scenario" --video "$finished_video" && echo "Captioned ASMR video and upload pack are next to $finished_video"
python3 scripts/qa-local-video.py --video "${finished_video%.mp4}.captioned.mp4" --work-dir "storage/any-local/$(basename "$scenario" .json)" || echo "QA found problems: read the qa block in ${finished_video%.mp4}.pack.json before uploading." >&2
python3 scripts/log-local-run.py --scenario "$scenario" --video "${finished_video%.mp4}.captioned.mp4" --pack "${finished_video%.mp4}.pack.json"
python3 scripts/score-local-video.py --scenario "$scenario" --pack "${finished_video%.mp4}.pack.json" || echo 'Editorial quality review is still required before release.' >&2
t_end=$SECONDS
checks_s=$((t_checks - t_start)); render_s=$((t_render - t_checks)); finish_s=$((t_end - t_render)); total_s=$((t_end - t_start))
printf 'Timing: checks %ds, render %dm%02ds, captions+QA %ds, total %dm%02ds\n' "$checks_s" $((render_s / 60)) $((render_s % 60)) "$finish_s" $((total_s / 60)) $((total_s % 60))
python3 - "${finished_video%.mp4}.pack.json" "$checks_s" "$render_s" "$finish_s" "$total_s" <<'PY'
import json, sys
pack, *secs = sys.argv[1], *map(int, sys.argv[2:])
try:
    data = json.load(open(pack))
    data['timingsSeconds'] = dict(zip(('checks', 'render', 'captionsAndQa', 'total'), secs))
    json.dump(data, open(pack, 'w'), indent=2); open(pack, 'a').write('\n')
except OSError:
    pass
PY
