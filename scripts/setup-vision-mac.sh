#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ollama >/dev/null || { echo 'Install Ollama first with npm run setup:mac.' >&2; exit 2; }
ollama pull qwen3-vl:4b
echo 'Local vision reviewer ready: qwen3-vl:4b'
