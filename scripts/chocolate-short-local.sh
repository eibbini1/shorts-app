#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CHOCOLATE_WORK_DIR="${CHOCOLATE_WORK_DIR:-$ROOT/storage/chocolate-short-local}"
export CHOCOLATE_OUTPUT="${1:-$CHOCOLATE_WORK_DIR/chocolate-short-30s-$(date +%Y%m%d-%H%M%S).mp4}"
python3 scripts/chocolate-short/generate-motion.py
node scripts/chocolate-short/narrate.mjs
node_modules/.bin/tsx scripts/chocolate-short/sound.ts
python3 scripts/chocolate-short/beat.py
python3 scripts/chocolate-short/render.py
echo "Review the MP4 and its .review.png contact sheet before publishing."
