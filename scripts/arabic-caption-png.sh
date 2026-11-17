#!/bin/zsh
# usage: make_caption.sh "<arabic text>" out.png   (Pango does Arabic shaping + bidi; PNG gets real alpha)
TXT="$1"; OUT="$2"
pango-view --no-display --font="Geeza Pro Bold 84" --foreground=black --background=white \
  --width=900 --align=center --pixels --dpi=72 --text="$TXT" --output=/tmp/cap_raw.png 2>/dev/null
magick /tmp/cap_raw.png -negate -trim +repage -bordercolor black -border 26 /tmp/cap_mask.png
magick /tmp/cap_mask.png -alpha Copy -fill white -colorize 100% /tmp/cap_fill.png
magick /tmp/cap_mask.png -morphology Dilate Disk:6 -blur 0x1 -alpha Copy -fill "#101010" -colorize 100% /tmp/cap_outline.png
magick /tmp/cap_outline.png /tmp/cap_fill.png -composite "$OUT"
