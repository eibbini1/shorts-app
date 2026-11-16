#!/bin/bash
# One command for a v3 film: prompt gate -> render (no dissolves, no stamp) -> hard cuts + punch + grade -> visual QA.
# Usage: scripts/film-v3.sh drafts/generated/<slug>-v3.local-scenario.json [--min-lint 90] [--steps "A|B|C|D|E"] [--silent] [--no-punch] [--no-subs] [--payoff 0.5]
# One GPU job at a time: do not run while another render is active.
set -euo pipefail
cd "$(dirname "$0")/.."
scenario="$1"; shift
min=90; extra=(); punch=(--punch); payoff=0; subs=1
while [ $# -gt 0 ]; do case "$1" in
  --min-lint) min="$2"; shift 2 ;;
  --steps) extra+=(--steps "$2"); shift 2 ;;
  --silent) extra+=(--silent); shift ;;
  --no-punch) punch=(); shift ;;
  --no-subs) subs=0; shift ;;
  --payoff) payoff="$2"; shift 2 ;;
  *) echo "unknown option $1" >&2; exit 2 ;;
esac; done
id="$(basename "$scenario" .local-scenario.json)"
score="$(python3 scripts/prompt-lint.py "$scenario" --json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["overall"])')"
echo "Prompt lint: $score (minimum $min)"
if [ "$score" -lt "$min" ]; then python3 scripts/prompt-lint.py "$scenario"; echo "Blocked: fix the prompts above." >&2; exit 1; fi
bash scripts/make-film.sh story --scenario "$scenario" --no-crumb --allow-repeat --no-effects --id "$id"
src="$(ls -t outputs/"$id"-*.sfx.captioned.1080.mp4 | head -1)"
if [ "$subs" = 0 ]; then   # no subtitles: export the uncaptioned picture instead
  raw="$(ls -t outputs/"$id"-*.sfx.mp4 | head -1)"; src="${raw%.mp4}.clean.1080.mp4"; bash scripts/master-export.sh "$raw" "$src"
fi
mkdir -p storage/p9
out="storage/p9/$id-15s.mp4"
hud="${scenario%.local-scenario.json}.hud.json"; [ -f "$hud" ] && extra+=(--hud-file "$hud")
python3 scripts/finish-pass.py --scenario "$scenario" --video "$src" --out "$out" --hard-cuts ${punch[@]+"${punch[@]}"} --payoff "$payoff" ${extra[@]+"${extra[@]}"}
python3 scripts/qa-visual.py --video "$out" --scenario "$scenario" --json > "$out.visual.json"
ffmpeg -v error -y -i "$out" -vf "fps=2/3,scale=270:-1,tile=5x2" -frames:v 1 "storage/p9/$id-sheet.png"
cat "$out.visual.json"
echo "Done: $out (sheet: storage/p9/$id-sheet.png). Editorial review still required."
