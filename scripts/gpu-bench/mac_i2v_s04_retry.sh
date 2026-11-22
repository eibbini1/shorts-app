#!/usr/bin/env bash
# Shot 4 retry: same FLUX still, SIMPLER motion prompt (no patty flip), seeds 42/7/11. Local only; skips clips already made.
set -u
cd "$(dirname "$0")/../.."
BIN="$PWD/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"; [ -x "$BIN" ] || { echo "missing $BIN"; exit 1; }
model=$(cat storage/setup/ltx-model-dir.txt); gemma=$(cat storage/setup/gemma-model-dir.txt)
img=storage/approved-stills/smoky-jalapeno-double-smash-burger-35/shot-04.png
P="Close-up of two smash patties sizzling on a hot black griddle, melted yellow cheese slowly spreads and drips, thin steam drifts upward, the spatula and hand stay almost still, the camera holds steady."
mkdir -p outputs/bench-mac-i2v
for seed in 42 7 11; do out=outputs/bench-mac-i2v/i2v_s04b_seed$seed.mp4
  [ -s "$out" ] && { echo "skip $seed"; continue; }
  echo "== seed $seed $(date +%H:%M:%S)"
  /usr/bin/time -l -o "$out.bench.txt" "$BIN" generate --model "$model" --gemma "$gemma" --distilled --low-ram --no-audio --seed $seed \
    --prompt "$P" --image "$img" -H 1280 -W 704 -f 121 --frame-rate 24 -o "$out" || echo "FAILED seed $seed"
done; echo done
