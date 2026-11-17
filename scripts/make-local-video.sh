#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/make-local-video.sh
  bash scripts/make-local-video.sh --draft-only [--model gemma-local] [--idea BANK_ID] [--studio luxury-kitchen] [--answers brief.json]
  bash scripts/make-local-video.sh --scenario drafts/generated/ID.local-scenario.json [--editor ffmpeg|artcraft|filmcraft|auto] [--title 'Optional film title'] [--chain-images] [--best-of-3-stills] [--cache-only] [--stills FOLDER] [--anchor-image IMAGE] [--allow-repeat] [--allow-silence] [--allow-bad-first] [--skip-vision-gate]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json [--watch]
  bash scripts/make-local-video.sh --status drafts/generated/ID.local-scenario.json --preview

The interactive path asks for a subject, set, visible hook and action, sound mode, runtime, and orientation.
It saves a local Gemma or Ollama shot plan, then runs strict preflight before expensive rendering.
USAGE
}

default_model='qwen3:1.7b'
[[ -s storage/setup/gemma-model-dir.txt ]] && default_model='gemma-local'
scenario=''; status=''; chain=''; stills=''; anchor_image=''; allow_repeat=''; cache_only=''; best_of_3=''; skip_vision_gate=''; idea=''; studio=''; answers=''; title=''; editor="${SHORTS_EDITOR:-auto}"; draft_only=0; watch=0; preview=0; model="${SHORTS_STORY_MODEL:-$default_model}"
while (($#)); do
  case "$1" in
    --scenario) scenario="${2:?Missing scenario path}"; shift 2 ;;
    --status) status="${2:?Missing scenario path}"; shift 2 ;;
    --watch) watch=1; shift ;;
    --preview) preview=1; shift ;;
    --chain-images) chain='--chain-images'; shift ;;
    --cache-only) cache_only='--cache-only'; shift ;;
    --best-of-3-stills) best_of_3='--best-of-3-stills'; shift ;;
    --skip-vision-gate) skip_vision_gate='--skip-vision-gate'; shift ;;
    --stills) stills="$2"; shift 2 ;;
    --stills-only) stills_only='--stills-only'; shift ;;
    --anchor-image) anchor_image="$2"; shift 2 ;;
    --editor) editor="${2:?Missing editor}"; shift 2 ;;
    --title) title="${2:?Missing title}"; shift 2 ;;
    --allow-repeat) allow_repeat='--allow'; shift ;;
    --allow-silence) allow_silence='--allow-silence'; shift ;;
    --allow-bad-first) allow_bad_first='--allow-bad-first'; shift ;;
    --draft-only) draft_only=1; shift ;;
    --model) model="${2:?Missing model name}"; shift 2 ;;
    --idea) idea="${2:?Missing bank idea ID}"; shift 2 ;;
    --studio) studio="${2:?Missing studio ID}"; shift 2 ;;
    --answers) answers="${2:?Missing brief JSON path}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
[[ "$editor" == auto || "$editor" == filmcraft || "$editor" == ffmpeg || "$editor" == artcraft ]] || { echo 'Editor must be ffmpeg, artcraft, filmcraft, or auto.' >&2; exit 2; }
if [[ "$editor" == auto ]]; then
  editor=ffmpeg
  if [[ "$(uname -s)" == Darwin && -x storage/tools/artcraft/photocraft-cli && -x storage/tools/artcraft/filmcraft-cli && -x storage/tools/artcraft/soundcraft-cli && -x storage/tools/artcraft/effectcraft-cli ]]; then
    editor=artcraft
  fi
fi
[[ -z "$title" || "$editor" == artcraft ]] || { echo '--title requires the ArtCraft editor.' >&2; exit 2; }
[[ ${#title} -le 48 ]] || { echo '--title must be 48 characters or fewer.' >&2; exit 2; }

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
  brief_args=(--model "$model")
  [[ -z "$idea" ]] || brief_args+=(--idea "$idea")
  [[ -z "$studio" ]] || brief_args+=(--studio "$studio")
  [[ -z "$answers" ]] || brief_args+=(--answers "$answers")
  scenario="$(python3 scripts/director-brief.py "${brief_args[@]}")"
  [[ -f "$scenario" ]] || { echo 'The director brief did not save a scenario.' >&2; exit 3; }
  if [[ -n "$studio" ]]; then
    # Master-prompt pass: studio set, lighting, lens, camera move, mood and kitchen plate per shot (docs/MASTER_PROMPTS.md).
    python3 scripts/refine-prompts.py "$scenario" --studio "$studio" --in-place || { echo 'Prompt refinement failed.' >&2; exit 3; }
  fi
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
  [[ -z "$idea" && -z "$studio" && -z "$answers" ]] || { echo '--idea, --studio and --answers are for interactive drafting, not --scenario.' >&2; exit 2; }
fi

[[ -f "$scenario" ]] || { echo "Missing scenario: $scenario" >&2; exit 2; }
base="$(basename "$scenario" .local-scenario.json)"
base="${base%.json}"
output="outputs/$base-$(date +%Y%m%d-%H%M%S).mp4"
t_start=$SECONDS
echo "Step 1/4  Environment check"
echo "Finishing editor: $editor"
if [[ "$editor" == artcraft ]]; then
  python3 scripts/check-artcraft-mac.py --require-cli || { echo 'ArtCraft version check failed before rendering.' >&2; exit 4; }
fi
env_args=()
[[ -z "$cache_only" ]] || env_args+=(--skip-gpu)
python3 scripts/check-env.py ${env_args[@]+"${env_args[@]}"} || { echo "Fix the FAIL lines above, then run this again." >&2; exit 4; }
echo "Step 2/4  Pre-render check (topic, hook, length, currency, claims)"
if [[ -z "$cache_only" ]]; then
  python3 scripts/prompt-lint.py "$scenario" --min-prompts="${SHORTS_MIN_PROMPT_SCORE:-85}" || { echo "Prompt gate blocked this scenario before any FLUX/LTX time. Run: python3 scripts/refine-prompts.py '$scenario' --studio luxury-kitchen --in-place (or set SHORTS_MIN_PROMPT_SCORE)." >&2; exit 3; }
fi
python3 scripts/preflight-short.py "$scenario" --strict ${allow_repeat:+$allow_repeat} || { echo "Preflight blocked this scenario. Fix the listed problems before rendering." >&2; exit 3; }
python3 scripts/audit-local-story.py "$scenario" || { echo 'Story gate blocked this scenario. Edit the plan before rendering.' >&2; exit 3; }
python3 scripts/evidence_gate.py "$scenario" || { echo 'Evidence gate blocked this scenario. Correct claims, prices or variety before rendering.' >&2; exit 3; }
storage/tools/ComfyUI/.venv/bin/python scripts/add-sfx.py --scenario "$scenario" --audit || { echo 'Sound cue gate blocked this scenario. Edit its shot sound lines before rendering.' >&2; exit 3; }
t_checks=$SECONDS
if [[ -n "$cache_only" ]]; then
  echo "Step 3/4  Reassembling cached local video to $output (no FLUX/LTX generation; missing cache stops the job)"
else
  echo "Step 3/4  Rendering local video to $output (about 5 min per shot on an M1: still, motion, voice, assembly)"
fi
python3 scripts/render-any-local.py --scenario "$scenario" --output "$output" $([[ "$editor" == artcraft ]] && echo --prep-stills) ${chain:+$chain} ${cache_only:+$cache_only} ${best_of_3:+$best_of_3} ${skip_vision_gate:+$skip_vision_gate} ${allow_silence:+$allow_silence} ${allow_bad_first:+$allow_bad_first} ${stills:+--stills "$stills"} ${anchor_image:+--anchor-image "$anchor_image"} ${stills_only:+$stills_only}
if [[ -n "${stills_only:-}" ]]; then echo "First frames ready (no motion generated yet)"; exit 0; fi
t_render=$SECONDS
echo "Base render complete: $output (not release approved)"
echo "Step 4/4  Shot-synced ASMR, captions, upload pack and quality check"
storage/tools/ComfyUI/.venv/bin/python scripts/add-sfx.py --scenario "$scenario" --video "$output"
finished_video="${output%.mp4}.sfx.mp4"
python3 scripts/finish-local-video.py --scenario "$scenario" --video "$finished_video" && echo "Captioned ASMR video and upload pack are next to $finished_video"
pack="${finished_video%.mp4}.pack.json"
final_video="${finished_video%.mp4}.captioned.mp4"
if [[ "$editor" == artcraft ]]; then
  # SoundCraft remaster + this film's own captions at 1080 + FilmCraft 1080x1920 edit of the rendered shots.
  art_video="${finished_video%.mp4}.artcraft.mp4"
  art_args=(--assembly "${output%.mp4}.assembly" --audio "$finished_video" --output "$art_video")
  art_work="storage/any-local/$(basename "$scenario" .json)"
  [[ ! -f "$art_work/voice-timeline.wav" ]] || art_args+=(--voice "$art_work/voice-timeline.wav" --sfx "${output%.mp4}.sfx.wav")
  [[ ! -f "$art_work/soundtrack.wav" ]] || art_args+=(--bed "$art_work/soundtrack.wav")
  [[ ! -f "${finished_video%.mp4}.ass" ]] || art_args+=(--captions "${finished_video%.mp4}.ass")
  [[ -z "$title" ]] || art_args+=(--title "$title")
  python3 scripts/artcraft-finish.py "${art_args[@]}"
  final_video="$art_video"
  python3 - "$pack" "$final_video" <<'PY2'
import json,sys
from pathlib import Path
pack,video=map(Path,sys.argv[1:])
data=json.loads(pack.read_text())
data['video']=video.name
data['finishingEditor']='ArtCraft (SoundCraft + FilmCraft)'
pack.write_text(json.dumps(data,indent=2)+'\n')
PY2
elif [[ "$editor" == filmcraft || ( "$editor" == auto && -x storage/tools/artcraft/filmcraft-cli ) ]]; then
  python3 scripts/filmcraft-finish.py --video "$final_video"
  final_video="${final_video%.mp4}.filmcraft.mp4"
  python3 - "$pack" "$final_video" <<'PY'
import json,sys
from pathlib import Path
pack,video=map(Path,sys.argv[1:])
data=json.loads(pack.read_text())
data['video']=video.name
data['finishingEditor']='FilmCraft'
pack.write_text(json.dumps(data,indent=2)+'\n')
PY
fi
python3 scripts/qa-local-video.py --video "$final_video" --pack "$pack" --scenario "$scenario" --expected-seconds "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["settings"]["seconds"])' "$scenario")" --work-dir "storage/any-local/$(basename "$scenario" .json)" || { echo "Technical QA failed: read $pack before uploading." >&2; exit 5; }
python3 scripts/log-local-run.py --scenario "$scenario" --video "$final_video" --pack "$pack"
# Advisory screen of the exact final file (shot questions on middle frames, final payoff, dish continuity, loudness).
# It awards no points; it tells the reviewer which ratings are likely to fall below 4/5.
python3 scripts/prereview-local-video.py --scenario "$scenario" --video "$final_video" ${skip_vision_gate:+--skip-vision} || echo 'Pre-review flagged likely weak categories; fix them before the editorial review.' >&2
python3 scripts/score-local-video.py --scenario "$scenario" --pack "$pack" --video "$final_video" || echo 'Release gate is blocked or needs editorial review; inspect the quality report.' >&2
printf 'Studio verified export: %s\n' "$final_video"
echo "Editorial review (watch and listen, about 2 minutes): npm run review:video:mac -- --scenario '$scenario' --pack '$pack' --video '$final_video'"
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
