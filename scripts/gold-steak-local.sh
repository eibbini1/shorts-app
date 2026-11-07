#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOLD_STEAK_WORK_DIR="${GOLD_STEAK_WORK_DIR:-$ROOT/storage/gold-steak-local}"
OUTPUT="${1:-$GOLD_STEAK_WORK_DIR/gold-steak-30s-$(date +%Y%m%d-%H%M%S).mp4}"
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists: $OUTPUT" >&2; exit 1; }
mkdir -p "$GOLD_STEAK_WORK_DIR"
comfy_pid=""
cleanup() {
  if [[ -n "$comfy_pid" ]]; then
    kill "$comfy_pid" 2>/dev/null || true
    wait "$comfy_pid" 2>/dev/null || true
    comfy_pid=""
  fi
}
trap cleanup EXIT
images_ready=1
for name in season sear slice gold; do
  if [[ ! -s "$GOLD_STEAK_WORK_DIR/refs/$name.png" || ! -s "$GOLD_STEAK_WORK_DIR/refs/$name.json" ]]; then
    images_ready=0
    break
  fi
done
if [[ "$images_ready" == 1 ]]; then
  echo 'Reusing four saved local reference images; ComfyUI startup skipped.'
elif ! curl -fsS --max-time 3 http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
  bash scripts/mac-runtime.sh comfy >"$GOLD_STEAK_WORK_DIR/comfy.log" 2>&1 &
  comfy_pid=$!
  ready=0
  for attempt in {1..90}; do
    if curl -fsS --max-time 2 http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then ready=1; break; fi
    kill -0 "$comfy_pid" 2>/dev/null || { cat "$GOLD_STEAK_WORK_DIR/comfy.log"; exit 1; }
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo "ComfyUI startup timed out; inspect $GOLD_STEAK_WORK_DIR/comfy.log" >&2; exit 1; }
fi
python3 scripts/gold-steak/produce.py images
if [[ "$images_ready" == 1 ]]; then
  :
elif [[ -n "$comfy_pid" ]]; then
  cleanup
else
  curl -fsS --max-time 30 -H 'Content-Type: application/json' -d '{"unload_models":true,"free_memory":true}' http://127.0.0.1:8188/free >/dev/null
fi
python3 scripts/gold-steak/produce.py motion
node scripts/gold-steak/narrate.mjs
storage/tools/ComfyUI/.venv/bin/python scripts/gold-steak/sound.py
python3 scripts/assemble-motion-video.py --manifest "$GOLD_STEAK_WORK_DIR/film-manifest.json" --output "$OUTPUT"
echo "Review the complete video before publication: $OUTPUT"
