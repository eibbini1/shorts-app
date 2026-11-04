#!/bin/sh
# Read-only inventory for selecting an Apple Silicon image-to-video runtime.
set -eu
if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\n' 'Run this check on the Mac that will generate video.'
  exit 1
fi
printf '%s\n' 'Mac video generation readiness'
sw_vers
printf '\nChip: '
sysctl -n machdep.cpu.brand_string
printf 'Architecture: '
uname -m
printf 'Unified memory bytes: '
sysctl -n hw.memsize
printf '\nAvailable disk space\n'
df -h .
printf '\nInstalled tools\n'
for tool in python3 ffmpeg git; do
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
  else
    printf '%s is missing\n' "$tool"
  fi
done
printf '\nThis inventory does not establish model compatibility or output quality.\n'
