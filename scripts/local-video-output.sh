#!/usr/bin/env bash

# A Studio job gets its own export path even when two cache-only attempts start in one second.
local_video_output() {
  local base="$1" report_name="${2##*/}" stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  if [[ "$report_name" =~ ^take-[a-f0-9-]{36}\.report$ ]]; then
    stamp="$stamp-${report_name%.report}"
  fi
  printf 'outputs/%s-%s.mp4\n' "$base" "$stamp"
}
