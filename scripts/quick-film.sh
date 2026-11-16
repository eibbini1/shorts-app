#!/usr/bin/env bash
# One-line "guess the price" film: scripts/quick-film.sh "Dish name" '$95' "One-line fact" "https://source" [extra make-film flags]
# Add --draft-only as the 5th argument to check the story and hook score without rendering.
set -euo pipefail
item="${1:?usage: quick-film.sh ITEM PRICE [FACT] [SOURCE_URL] [make-film flags]}"; price="${2:?price}"
fact="${3:-A rare luxury ingredient on one plate.}"; src="${4:-https://example.com/menu}"; shift $(( $# > 4 ? 4 : $# ))
cd "$(dirname "$0")/.."
slug="$(printf '%s' "$item" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')"
out="drafts/generated/${slug}.local-scenario.json"
python3 scripts/template_to_scenario.py guess-the-price --slot item="$item" --slot price="$price" \
  --slot rarity_fact="$fact" --slot source="$src" --out "$out"
bash scripts/make-film.sh story --scenario "$out" --id "$slug" "$@"
