#!/usr/bin/env bash
# Image-to-video check on the Mac: 3 real FLUX stills (smoky jalapeno burger) through LTX 2.3 q4, same settings as the
# text-only baseline (704x1280, 121 frames, seed 42). Local only; no network. Skips clips that already exist.
set -u
cd "$(dirname "$0")/../.."
BIN="$PWD/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"; [ -x "$BIN" ] || { echo "missing $BIN"; exit 1; }
model=$(cat storage/setup/ltx-model-dir.txt); gemma=$(cat storage/setup/gemma-model-dir.txt)
S=storage/approved-stills/smoky-jalapeno-double-smash-burger-35
mkdir -p outputs/bench-mac-i2v
run() { id=$1; img=$2; p=$3; out=outputs/bench-mac-i2v/i2v_$id.mp4
  [ -s "$out" ] && { echo "skip $id"; return; }
  echo "== $id $(date +%H:%M:%S)"
  /usr/bin/time -l -o "$out.bench.txt" "$BIN" generate --model "$model" --gemma "$gemma" --distilled --low-ram --no-audio --seed 42 \
    --prompt "$p" --image "$img" -H 1280 -W 704 -f 121 --frame-rate 24 -o "$out" || echo "FAILED $id (see terminal output above)"; }
run s04 $S/shot-04.png "A hand lifts the steel spatula and flips the cheese-topped smash patty on the hot black griddle, melted yellow cheese drips, thin steam rises, the camera holds steady."
run s05 $S/shot-05.png "A hand holds the steel spatula and lowers the seared patty toward the toasted bun with pink sauce, the patty settles onto the bun, warm kitchen light, slight handheld movement."
run s06 $S/shot-06.png "Green jalapeno slices fall from above onto the stacked burger on the dark plate, the spatula lifts away, steam rises, the camera pushes in slowly."
echo done
