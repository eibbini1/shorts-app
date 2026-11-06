#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export HF_HOME="$PWD/storage/models/huggingface"
case "${1:-}" in
  comfy)
    cd storage/tools/ComfyUI
    exec .venv/bin/python main.py --listen 127.0.0.1 --port 8188
    ;;
  motion)
    shift
    export LTX_MLX_BIN="$PWD/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"
    [[ -f storage/setup/ltx-model-dir.txt ]] || { echo "Run npm run setup:mac to download the motion model first." >&2; exit 1; }
    [[ -f storage/setup/gemma-model-dir.txt ]] || { echo "Run npm run setup:mac to download the text encoder first." >&2; exit 1; }
    export LTX_MODEL_DIR="$(cat storage/setup/ltx-model-dir.txt)"
    export GEMMA_MODEL_DIR="$(cat storage/setup/gemma-model-dir.txt)"
    [[ -d "$LTX_MODEL_DIR" ]] || { echo "Motion model directory is missing; rerun npm run setup:mac." >&2; exit 1; }
    [[ -d "$GEMMA_MODEL_DIR" ]] || { echo "Text encoder directory is missing; rerun npm run setup:mac." >&2; exit 1; }
    exec sh scripts/test-mac-motion.sh "$@"
    ;;
  *) echo "Usage: bash scripts/mac-runtime.sh comfy|motion"; exit 1 ;;
esac
