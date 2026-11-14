#!/usr/bin/env bash
# Guided local director: one original AI film or a fast edit of existing footage.
set -euo pipefail
cd "$(dirname "$0")/.."

mode=''; check_only=0; existing=''; ideas_file=''; idea_choice=''
while (($#)); do
  case "$1" in
    --mode) mode="${2:?Choose ai or montage}"; shift 2 ;;
    --scenario) existing="${2:?Missing scenario path}"; shift 2 ;;
    --ideas-file) ideas_file="${2:?Missing ideas file}"; shift 2 ;;
    --idea-choice) idea_choice="${2:?Missing idea number}"; shift 2 ;;
    --check-only) check_only=1; shift ;;
    -h|--help) echo 'Usage: bash scripts/director-local.sh [--mode ai|montage] [--ideas-file FILE] [--idea-choice 1-5] [--scenario FILE] [--check-only]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$mode" ]]; then read -r -p 'Create new AI footage or edit existing footage? [ai/montage]: ' mode; fi
[[ "$mode" == 'ai' || "$mode" == 'montage' ]] || { echo 'Choose ai or montage.' >&2; exit 2; }

if [[ "$mode" == 'montage' ]]; then
  [[ -z "$existing" ]] || { echo '--scenario applies to AI mode only.' >&2; exit 2; }
  read -r -p 'Folder of your moving clips, named in story order: ' footage
  [[ -d "$footage" ]] || { echo "No footage folder: $footage. Create it and add MP4/MOV clips first." >&2; exit 2; }
  read -r -p 'Video title: ' title
  read -r -p 'Beginning-to-end story in one sentence: ' story
  read -r -p 'Length in seconds [30]: ' seconds; seconds="${seconds:-30}"
  read -r -p 'Format [vertical/wide, default vertical]: ' format; format="${format:-vertical}"
  [[ "$seconds" =~ ^[0-9]+$ ]] && ((seconds >= 10 && seconds <= 60)) || { echo 'Length must be 10–60 seconds.' >&2; exit 2; }
  [[ "$format" == 'vertical' || "$format" == 'wide' ]] || { echo 'Choose vertical or wide.' >&2; exit 2; }
  read -r -p 'Music file (optional; use only music you may publish): ' music
  read -r -p 'Voice recording (optional): ' voice
  args=(--footage "$footage" --seconds "$seconds" --format "$format" --title "$title" --story "$story")
  [[ -z "$music" ]] || args+=(--music "$music")
  [[ -z "$voice" ]] || args+=(--voice "$voice")
  python3 scripts/montage-footage.py "${args[@]}" --check
  ((check_only == 0)) || { echo 'Checks passed; no video was encoded.'; exit 0; }
  read -r -p 'Encode this reviewed cut plan now? [y/N]: ' proceed
  [[ "$proceed" == 'y' || "$proceed" == 'Y' || "$proceed" == 'yes' ]] || { echo 'Stopped before encoding.'; exit 0; }
  stamp="$(date +%Y%m%d-%H%M%S)"
  output="outputs/guided-montage-$stamp.mp4"
  python3 scripts/montage-footage.py "${args[@]}" --output "$output"
  python3 scripts/qa-local-video.py --video "$output"
  echo "Review your montage: $output"
  exit 0
fi

if [[ -z "$existing" ]]; then
  suggested_subject=''; suggested_title=''; suggested_ending=''; suggested_style=''
  if [[ -n "$ideas_file" ]]; then suggest='y'; else read -r -p 'Generate five local AI ideas to choose from first? [y/N]: ' suggest; fi
  if [[ "$suggest" == 'y' || "$suggest" == 'Y' ]]; then
    idea_args=()
    if [[ -n "$ideas_file" ]]; then
      idea_args+=(--ideas-file "$ideas_file")
    else
      read -r -p 'Niche or subject area [food cooking]: ' idea_niche; idea_niche="${idea_niche:-food cooking}"
      read -r -p 'Google Trends region [US]: ' idea_region; idea_region="${idea_region:-US}"
      idea_args+=(--niche "$idea_niche" --region "$idea_region")
    fi
    selection_file="$(mktemp)"
    if [[ -n "$idea_choice" ]]; then idea_args+=(--choice "$idea_choice"); else idea_args+=(--pick); fi
    if python3 scripts/idea-picker-local.py "${idea_args[@]}" --selection-out "$selection_file"; then
      if [[ -s "$selection_file" ]]; then
        suggested=()
        while IFS= read -r item; do suggested+=("$item"); done < <(python3 - "$selection_file" <<'PY'
import json,sys
idea=json.load(open(sys.argv[1]))['idea']
for key in ('subject','title','ending','style'):
    print(idea[key].replace('\n',' ').strip())
PY
)
        suggested_subject="${suggested[0]}"; suggested_title="${suggested[1]}"
        suggested_ending="${suggested[2]}"; suggested_style="${suggested[3]}"
      fi
    else
      echo 'Idea picker unavailable; enter your own subject below.' >&2
    fi
    rm -f "$selection_file"
  fi
  read -r -p "Exact subject and main physical action${suggested_subject:+ [$suggested_subject]}: " subject
  subject="${subject:-$suggested_subject}"
  [[ -n "${subject//[[:space:]]/}" ]] || { echo 'A subject is required.' >&2; exit 2; }
  read -r -p "Title to keep${suggested_title:+ [$suggested_title]}: " title
  title="${title:-$suggested_title}"
  read -r -p "Visible ending or payoff (specific action)${suggested_ending:+ [$suggested_ending]}: " ending
  ending="${ending:-$suggested_ending}"
  [[ -n "${ending//[[:space:]]/}" ]] || { echo 'Give a visible ending so the story has a target.' >&2; exit 2; }
  read -r -p "Visual style, lighting and lens [${suggested_style:-warm cinematic macro}]: " style
  style="${style:-${suggested_style:-warm cinematic macro}}"
  read -r -p 'What do you admire in your reference? [pacing/texture/service; no copied footage]: ' craft
  read -r -p 'Length in seconds [30]: ' seconds; seconds="${seconds:-30}"
  [[ "$seconds" =~ ^[0-9]+$ ]] && ((seconds >= 10 && seconds <= 60)) || { echo 'Length must be 10–60 seconds.' >&2; exit 2; }
  read -r -p 'Format [vertical/wide, default vertical]: ' format; format="${format:-vertical}"
  case "$format" in vertical) scenario_format=short;; wide) scenario_format=long;; *) echo 'Choose vertical or wide.' >&2; exit 2;; esac
  if [[ "$format" == 'wide' ]] && ((seconds < 60)); then echo 'The current AI story schema needs 60 seconds for wide format.' >&2; exit 2; fi
  if [[ "$suggest" == 'y' || "$suggest" == 'Y' ]]; then trends='n'; else read -r -p 'Research a fresh Google trend first? [y/N]: ' trends; fi
  if [[ "$trends" == 'y' || "$trends" == 'Y' ]]; then
    read -r -p 'Region [US]: ' region; region="${region:-US}"
    read -r -p 'Niche [food cooking]: ' niche; niche="${niche:-food cooking}"
    python3 scripts/trend-brief.py --region "$region" --niche "$niche" || echo 'Live trend feed unavailable; no trending claim will be made.' >&2
  fi
  read -r -p 'Find recent million-view YouTube references for craft? [y/N]: ' popular
  if [[ "$popular" == 'y' || "$popular" == 'Y' ]]; then
    read -r -p 'Food or subject search phrase: ' search_phrase
    if [[ -n "$search_phrase" ]]; then
      mkdir -p drafts/research
      python3 scripts/research-popular-videos.py --query "$search_phrase" --recent-days 90 --limit 10 \
        --output "drafts/research/popular-$(date +%Y%m%d-%H%M%S).json" || echo 'Public reference lookup unavailable; continue with an original idea.' >&2
    fi
  fi
  # A reference contributes craft vocabulary, never another creator's footage or exact shot order.
  topic="$subject. Original production; emphasize $craft. Keep one subject, one location, coherent physical action, real moving food textures, and the requested ending."
  id="guided-$(date +%Y%m%d-%H%M%S)"
  model='qwen3:1.7b'; [[ -s storage/setup/gemma-model-dir.txt ]] && model='gemma-local'
  model="${SHORTS_STORY_MODEL:-$model}"
  command=(node scripts/story-scenario.mjs "$topic" "$id" --style "$style" --ending "$ending" --format "$scenario_format" --seconds "$seconds" --model "$model")
  [[ -z "$title" ]] || command+=(--title "$title")
  "${command[@]}"
  existing="drafts/generated/$id.local-scenario.json"
fi

[[ -f "$existing" ]] || { echo "Missing scenario: $existing" >&2; exit 2; }
echo "Story review: $existing"
python3 - "$existing" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); print('Title:',d['plan']['title']); print('Hook:',d['plan']['hook']); print('Payoff:',d['plan']['payoff'])
for i,s in enumerate(d['plan']['shots'],1): print(f"{i:02d} {s['seconds']}s | {s['narration']} | motion: {s['motionPrompt'][:140]} | sound: {s['sound']}")
PY
node scripts/bb-local-scenario.mjs --validate "$existing"
python3 scripts/preflight-short.py "$existing" --strict
python3 scripts/audit-local-story.py "$existing"
((check_only == 0)) || { echo 'Story checks passed; no long render was started.'; exit 0; }
python3 scripts/check-env.py || { echo 'Mac is not ready for local image rendering.' >&2; exit 4; }
storage/tools/ComfyUI/.venv/bin/python scripts/preview-local-stills.py "$existing" --chain-images
storyboard="storage/any-local/$(basename "$existing" .json)/stills-preview.jpg"
python3 scripts/review-storyboard-local.py --scenario "$existing" --storyboard "$storyboard"
read -r -p 'Do the stills show one subject, one story and the correct ending? [y/N]: ' reviewed
[[ "$reviewed" == 'y' || "$reviewed" == 'Y' || "$reviewed" == 'yes' ]] || { echo "Stopped before LTX. Edit $existing and rerun."; exit 0; }
read -r -p 'Render this reviewed story with FLUX, LTX, Kokoro, ASMR and captions? This may take 20–35 minutes. [y/N]: ' proceed
[[ "$proceed" == 'y' || "$proceed" == 'Y' || "$proceed" == 'yes' ]] || { echo "Saved plan: $existing"; exit 0; }
bash scripts/make-local-video.sh --scenario "$existing" --chain-images --allow-silence
