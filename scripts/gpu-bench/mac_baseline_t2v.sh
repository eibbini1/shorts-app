#!/usr/bin/env bash
# Mac baseline for the motion-model blind test: current LTX 2.3 q4 (ltx-2-mlx), TEXT-ONLY, same prompts as the pod bench.
# usage: bash scripts/gpu-bench/mac_baseline_t2v.sh [s01 s02 ...]   (default: all 10). Writes outputs/bench-mac/ltx23_<id>.mp4 + .bench.txt
# Stop ComfyUI/Ollama first to free RAM. Skips shots already rendered.
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"; out="$root/outputs/bench-mac"; mkdir -p "$out"
model="$(cat "$root/storage/setup/ltx-model-dir.txt")"; gemma="$(cat "$root/storage/setup/gemma-model-dir.txt")"
ids=("$@"); [ ${#ids[@]} -eq 0 ] && ids=(s01 s02 s03 s04 s05 s06 s07 s08 s09 s10)
for id in "${ids[@]}"; do
  f="$out/ltx23_$id.mp4"; [ -s "$f" ] && { echo "skip $id"; continue; }
  p="$(python3 -c "import json,sys;print(json.load(open('$root/scripts/gpu-bench/prompts.mac.json'))['$id'])")"
  /usr/bin/time -l -o "$f.bench.txt" "$root/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx" generate \
    --model "$model" --gemma "$gemma" --distilled --low-ram --no-audio --seed 42 \
    --prompt "$p" -H 1280 -W 704 -f 121 --frame-rate 24 -o "$f"
  echo "exit=$? id=$id" >> "$f.bench.txt"
done
