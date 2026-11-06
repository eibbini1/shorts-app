#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source_clip="storage/setup/chocolate-motion-smoke.mp4"
if [[ ! -f "$source_clip" ]]; then
  echo "Missing $source_clip. Run the Mac motion smoke test first; see docs/CHOCOLATE_SHORT_LOCAL.md." >&2
  exit 1
fi
export CHOCOLATE_WORK_DIR="${CHOCOLATE_WORK_DIR:-$ROOT/storage/chocolate-short-local}"
export CHOCOLATE_OUTPUT="${1:-$CHOCOLATE_WORK_DIR/chocolate-short-30s-$(date +%Y%m%d-%H%M%S).mp4}"
node scripts/chocolate-short/narrate.mjs
node_modules/.bin/tsx scripts/chocolate-short/sound.ts
python3 scripts/chocolate-short/beat.py
python3 scripts/chocolate-short/render.py
echo "Review the MP4 and its .review.png contact sheet before publishing."
