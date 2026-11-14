#!/usr/bin/env bash
# Benchmark genuine higher-resolution LTX output on this Mac: distilled two-stage (half-res + upscale + refine) at a larger target; HEIGHT/WIDTH env override.
# usage: bash scripts/bench-ltx-hires.sh REF.png OUT.mp4   (records wall time and peak memory to OUT.bench.txt)
set -uo pipefail
ref="$1"; out="$2"; root="$(cd "$(dirname "$0")/.." && pwd)"
model="$(cat "$root/storage/setup/ltx-model-dir.txt")"; gemma="$(cat "$root/storage/setup/gemma-model-dir.txt")"
/usr/bin/time -l -o "$out.bench.txt" "$root/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx" generate \
  --model "$model" --gemma "$gemma" --distilled --low-ram --no-audio \
  --seed 42 --image "$ref" 0 1.0 --prompt "A gloved chef's hand spoons black caviar onto a grilled sausage in a bun, macro, warm tungsten light. One continuous camera take." \
  -H "${HEIGHT:-1920}" -W "${WIDTH:-1080}" -f 25 --frame-rate 24 -o "$out"
echo "exit=$?" >> "$out.bench.txt"
