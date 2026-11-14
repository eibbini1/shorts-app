#!/usr/bin/env bash
# Composite the transparent Crumb clip over a finished film, matching the footage's warm tungsten grade.
# usage: bash scripts/composite-crumb.sh BASE.mp4 CRUMB_ALPHA.mov OUT.mp4
set -euo pipefail
base="$1"; crumb="$2"; out="$3"
ffmpeg -hide_banner -loglevel error -y -i "$base" -i "$crumb" -filter_complex \
"[1:v]format=rgba,eq=brightness=-0.16:saturation=0.82:contrast=0.92,colorbalance=rs=0.10:gs=0.02:bs=-0.14:rm=0.10:bm=-0.10:rh=0.08:bh=-0.10,gblur=sigma=0.8,noise=c0s=9:c1s=9:c2s=9:allf=t,format=yuva420p[c];\
[0:v][c]overlay=0:0:format=auto,format=yuv420p[v]" \
-map "[v]" -map 0:a -c:v libx264 -preset veryfast -crf 18 -c:a copy "$out"
