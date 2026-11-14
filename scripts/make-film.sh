#!/usr/bin/env bash
# One command: template -> scenario -> local render -> Crumb composite -> 1080x1920 export.
#   bash scripts/make-film.sh guess-the-price --slot item="..." --slot price='$95' --slot rarity_fact="..." --slot source="..."
# Options: --scenario FILE (story film)  --from-video FILE (finish an existing captioned render)  --cache-only (reuse stills and clips)  --no-chain-images (for chronological reversals)  --pack FILE  --qa-work-dir DIR  --crumb3d  --crumb-on-plate (Juuni Ban only; requires placement review)  --draft-only  --no-crumb  --no-effects  --punch  --id NAME
# Effects (after the 1080p export): real dissolves/wipes on every cut (length unchanged), one film grade, opening hook text, end seal; --punch adds a zoom-punch with a low hit on each cut.
# Local only, no paid services. A render takes about 5 min per shot on an M1 16 GB.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
template="${1:?usage: make-film.sh TEMPLATE --slot key=value ... [--draft-only] [--no-crumb] [--id NAME]}"; shift
slots=(); given=""; rep=""; draft=0; crumb=1; effects=1; punch=0; id=""; on_plate=0; source_video=""; pack_override=""; qa_work_dir=""; cache_only=0; chain_images=1
while [ $# -gt 0 ]; do case "$1" in
  --slot) slots+=(--slot "$2"); shift 2 ;;
  --draft-only) draft=1; shift ;;
  --no-crumb) crumb=0; shift ;;
  --crumb3d) crumb3d=1; shift ;;
  --crumb-on-plate) on_plate=1; shift ;;
  --no-effects) effects=0; shift ;;
  --punch) punch=1; shift ;;
  --id) id="$2"; shift 2 ;;
  --scenario) given="$2"; shift 2 ;;
  --from-video) source_video="$2"; shift 2 ;;
  --cache-only) cache_only=1; shift ;;
  --no-chain-images) chain_images=0; shift ;;
  --pack) pack_override="$2"; shift 2 ;;
  --qa-work-dir) qa_work_dir="$2"; shift 2 ;;
  --allow-repeat) rep="--allow-repeat"; shift ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac; done
[ -n "$id" ] || id="$template-$(date +%Y%m%d-%H%M)"
scenario="drafts/generated/$id.local-scenario.json"
[ -z "$source_video" ] || [ -n "$given" ] || { echo '--from-video requires --scenario with the matching shot timings.' >&2; exit 2; }

if [ -n "$given" ]; then
  echo "1/6 Using hand-written story scenario $given"; scenario="$given"; id="$(basename "$scenario" .local-scenario.json)"
else
  echo "1/6 Build scenario from template '$template'"
  python3 scripts/template_to_scenario.py "$template" ${slots[@]+"${slots[@]}"} ${rep:+--allow-repeat} --out "$scenario"
fi
if [ "$on_plate" = 1 ]; then
  [[ "$id" == juuni-ban* ]] || { echo '--crumb-on-plate currently supports only the reviewed Juuni Ban plate anchors.' >&2; exit 2; }
  crumb=1
fi
node scripts/bb-local-scenario.mjs --validate "$scenario"
[ "$draft" = 1 ] && { echo "Draft only: review $scenario, then run again without --draft-only."; exit 0; }
expected_seconds="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['settings']['seconds'])" "$scenario")"
[ -n "$qa_work_dir" ] || qa_work_dir="storage/any-local/$(basename "$scenario" .json)"
qa_stage() {
  echo "Technical QA: $1"
  python3 scripts/qa-local-video.py --video "$1" --expected-seconds "$expected_seconds" \
    --work-dir "$qa_work_dir" --report "$1.qa.json"
}

if [ -n "$source_video" ]; then
  echo "2/6 Finish existing captioned render: $source_video"
  film="$source_video"
else
  echo "2/6 Render locally (stills, motion, voice, captions)"
  cache_arg=""; [ "$cache_only" = 0 ] || cache_arg="--cache-only"
  chain_arg=""; [ "$chain_images" = 0 ] || chain_arg="--chain-images"
  bash scripts/make-local-video.sh --scenario "$scenario" $chain_arg $rep $cache_arg
  film="$(ls -t outputs/"$id"-*.sfx.captioned.mp4 | head -1)"
fi
[ -f "$film" ] || { echo "No rendered film found: $film" >&2; exit 1; }
qa_stage "$film"
final="$film"

if [ "$crumb" = 1 ]; then
  alpha="storage/p2/crumb-alpha.mov"; comp=Crumb; glflag=""
  if [ "${crumb3d:-0}" = 1 ]; then alpha="storage/p6/crumb3d-alpha-30s.mov"; comp=Crumb3D; glflag="--gl=angle"; fi
  if [ "$on_plate" = 1 ]; then alpha="storage/p6/crumb-plate-juuni-ban-alpha.mov"; comp=CrumbPlate; glflag="--gl=angle"; fi
  if [ ! -f "$alpha" ]; then
    echo "3/6 Render Crumb (transparent, cached afterwards)"
    chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    mkdir -p "$(dirname "$alpha")"
    (cd mini-chef-studio && npx --no-install remotion render src/index.ts $comp "../$alpha" $glflag --codec=prores --prores-profile=4444 \
      --pixel-format=yuva444p10le --image-format=png --browser-executable="$chrome" --concurrency=2)
  else echo "3/6 Crumb clip cached"; fi
  echo "4/6 Composite Crumb"
  final="${film%.mp4}.crumb.mp4"; bash scripts/composite-crumb.sh "$film" "$alpha" "$final"
  qa_stage "$final"
  if [ "$on_plate" = 1 ]; then
    sheet="${final%.mp4}.plate-review.jpg"
    ffmpeg -hide_banner -loglevel error -y -i "$final" -vf 'fps=1/2,scale=180:320,tile=4x2' -frames:v 1 "$sheet"
    echo "Review Crumb placement at each cut: $sheet and $final"
    if ! read -r -p 'Does the chef remain on the food through this cut? [y/N]: ' approved; then approved='n'; fi
    [[ "$approved" == 'y' || "$approved" == 'Y' || "$approved" == 'yes' ]] || { echo 'Stopped before final export. Refine the plate anchors and rerun.' >&2; exit 3; }
  fi
fi

echo "5/6 Export 1080x1920"
out="${final%.mp4}.1080.mp4"; bash scripts/master-export.sh "$final" "$out"
qa_stage "$out"
if [ "$effects" = 1 ]; then
  echo "6/6 Edit pass (dissolves on cuts, one film grade, hook text, seal)"
  hook="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['plan']['shots'][0]['narration'])" "$scenario")"
  fx="${out%.mp4}.fx"
  python3 scripts/brand-extras.py dissolve --scenario "$scenario" --video "$out" --out "$fx.0.mp4"
  qa_stage "$fx.0.mp4"
  python3 scripts/brand-extras.py grade --scenario "$scenario" --video "$fx.0.mp4" --out "$fx.1.mp4"
  qa_stage "$fx.1.mp4"
  cur="$fx.1.mp4"
  if [ "$punch" = 1 ]; then python3 scripts/brand-extras.py punch --scenario "$scenario" --video "$cur" --out "$fx.2.mp4"; cur="$fx.2.mp4"; qa_stage "$cur"; fi
  python3 scripts/brand-extras.py seal --scenario "$scenario" --video "$cur" --out "${out%.mp4}.final.mp4" --text "$hook" --no-opening-text
  qa_stage "${out%.mp4}.final.mp4"
  rm -f "$fx".*.mp4
  out="${out%.mp4}.final.mp4"
fi
pack="${pack_override:-${film%.captioned.mp4}.pack.json}"
if [ -f "$pack" ]; then
  python3 scripts/score-local-video.py --scenario "$scenario" --pack "$pack" --video "$out" \
    --qa-report "$out.qa.json" --output "$out.quality.json" ${rep:+--allow-repeat} || echo 'Editorial review remains required before release.' >&2
fi
echo "Done: $out"
