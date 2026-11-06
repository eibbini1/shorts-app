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
    exec sh scripts/test-mac-motion.sh "$@"
    ;;
  *) echo "Usage: bash scripts/mac-runtime.sh comfy|motion"; exit 1 ;;
esac
