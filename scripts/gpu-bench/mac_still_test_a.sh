#!/usr/bin/env bash
# Test A: is the still the realism bottleneck? Shot 5 (patty onto sauced bun), same LTX prompt + seed 42 as i2v_s05.
#  v1 = same 384x640 still, only enlarged to 704x1280 (resolution only)
#  v2 = klein 4B EDIT of that still at 704x1280 with a photo-realism prompt (better still, same composition)
#  v3 = optional real photo: put it at outputs/bench-mac-i2v/real_s05.jpg before running (any size, portrait)
# Local only, no installs. Skips anything already made.
set -u
cd "$(dirname "$0")/../.."
BIN="$PWD/storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx"; [ -x "$BIN" ] || { echo "missing $BIN"; exit 1; }
model=$(cat storage/setup/ltx-model-dir.txt); gemma=$(cat storage/setup/gemma-model-dir.txt)
SRC=storage/approved-stills/smoky-jalapeno-double-smash-burger-35/shot-05.png
D=outputs/bench-mac-i2v; mkdir -p $D
P="A hand holds the steel spatula and lowers the seared patty toward the toasted bun with pink sauce, the patty settles onto the bun, warm kitchen light, slight handheld movement."
fit() { sips -s format png --resampleHeight 1280 "$1" --out "$2" >/dev/null && sips --cropToHeightWidth 1280 704 "$2" >/dev/null; }
[ -s $D/still_v1_s05.png ] || fit $SRC $D/still_v1_s05.png
[ -s $D/still_v2_s05.png ] || python3 scripts/create-flux-image.py --source $D/still_v1_s05.png --width 704 --height 1280 --seed 42 \
  --output $D/still_v2_s05.png --prompt "Keep the exact same scene, composition, hand, spatula, patty, bun and plate. Make it a real editorial food photograph: shot on a full-frame camera, 85mm lens at f/2.8, warm low-key tungsten side light from the left, natural shadows, crisp seared crust with dark caramelized edges and fine grease sheen, slightly uneven sauce swirl, toasted bun crumb texture, subtle steam, faint film grain, muted natural colors, no plastic gloss" || echo "FAILED still v2"
[ -s $D/real_s05.jpg ] && { [ -s $D/still_v3_s05.png ] || fit $D/real_s05.jpg $D/still_v3_s05.png; }
for v in v1 v2 v3; do img=$D/still_${v}_s05.png; out=$D/i2v_s05_$v.mp4
  [ -s "$img" ] || { echo "no still for $v, skipping"; continue; }
  [ -s "$out" ] && { echo "skip $v"; continue; }
  echo "== $v $(date +%H:%M:%S)"
  /usr/bin/time -l -o "$out.bench.txt" "$BIN" generate --model "$model" --gemma "$gemma" --distilled --low-ram --no-audio --seed 42 \
    --prompt "$P" --image "$img" -H 1280 -W 704 -f 121 --frame-rate 24 -o "$out" || echo "FAILED $v"
done; echo done
