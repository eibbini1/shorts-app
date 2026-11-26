#!/usr/bin/env bash
# Render the cartoon pilot or 30-second story with installed local tools.
set -euo pipefail
cd "$(dirname "$0")/.."

output="${1:-outputs/runaway-truffle-cartoon.mp4}"
mode="${2:-}"
composition=RunawayTruffle
seconds=12
if [[ "$mode" == --story ]]; then
  composition=RunawayTruffleStory
  seconds=30
fi
if [[ -e "$output" ]]; then
  printf 'Output already exists: %s\n' "$output" >&2
  exit 1
fi

chrome="${SHORTS_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[[ -x "$chrome" ]] || { echo 'Set SHORTS_CHROME to an installed Chrome executable.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/shorts-truffle.XXXXXX")"
trap 'rm -f "$work"/{picture.mp4,premix.wav,voice.wav,line-0.wav,line-1.wav,line-2.wav,voice-provenance.json}; rmdir "$work" 2>/dev/null || true' EXIT

echo 'Recording narration with local Kokoro'
node --input-type=module - "$work" "$seconds" <<'JS'
import path from 'node:path';
import {KokoroTTS} from './storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js';
import {env} from './storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js';

env.cacheDir = path.resolve('storage/tools/kokoro/models');
env.allowRemoteModels = false;
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8', device: 'cpu',
});
const [work, seconds] = process.argv.slice(2);
const script = seconds === '30'
  ? ['The little truffle had one job. Stay on the saucer.',
     'Then the saucer tipped. The edge crept closer.',
     'The truffle took a breath. I meant to do that.']
  : ['I meant to do that.'];
for (const [index, words] of script.entries()) {
  const line = await tts.generate(words, {voice: 'af_heart', speed: 0.95});
  await line.save(path.join(work, seconds === '30' ? `line-${index}.wav` : 'voice.wav'));
}
JS

(
  cd mini-chef-studio
  echo "Generating motion clips with Remotion"
  ./node_modules/.bin/remotion render src/index.ts "$composition" "$work/picture.mp4" \
    --concurrency=2 --gl=angle --browser-executable="$chrome" --log=error
)
mkdir -p "$(dirname "$output")"
if [[ "$mode" == --story ]]; then
  echo 'Mixing sound'
  ffmpeg -v error -i "$work/line-0.wav" -i "$work/line-1.wav" -i "$work/line-2.wav" \
    -filter_complex '[0:a]aresample=48000,adelay=180:all=1[a];[1:a]aresample=48000,adelay=10100:all=1[b];[2:a]aresample=48000,adelay=23400:all=1[c];[a][b][c]amix=inputs=3:duration=longest:normalize=0[v]' \
    -map '[v]' "$work/voice.wav"
  first="$(ffmpeg -hide_banner -i "$work/line-0.wav" -af silencedetect=n=-40dB:d=0.05 -f null - 2>&1 | awk '/silence_end/ && !seen++ {print $5}')"
  python3 - "$work/voice-provenance.json" "$first" <<'PY2'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({'lines': [{'atSeconds': 0.18 + float(sys.argv[2] or 0)}]}))
PY2
fi
room='[1:a]aresample=48000,highpass=f=130,volume=-8dB,afade=t=out:st=11.6:d=0.4[room]'
slide='[2:a]aresample=48000,volume=-8dB,afade=t=in:d=0.035,afade=t=out:st=0.23:d=0.13,adelay=870:all=1[slide]'
voice='[3:a]aresample=48000,highpass=f=100,volume=-5dB,adelay=8750:all=1[voice]'
mix='[room][slide][voice]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.65:level=false:latency=true[audio]'
if [[ "$mode" == --story ]]; then
  room="[1:a]aresample=48000,highpass=f=135,volume=-8dB,afade=t=out:st=29.5:d=0.5[room]"
  voice="[3:a]aresample=48000,highpass=f=95,acompressor=threshold=0.15:ratio=2[voice]"
  mix="[room][slide][voice]amix=inputs=3:normalize=0:duration=first[audio]"
fi
echo 'Finishing and exporting'
if [[ "$mode" == --story ]]; then
  # Two-pass loudness with the shared Studio targets (single-pass loudnorm undershoots sparse speech).
  ffmpeg -n -v error -i "$work/picture.mp4" \
    -ss 18 -t "$seconds" -i assets/foley/public-domain/ambient-kitchen.ogg \
    -ss 0.53 -t 0.36 -i assets/foley/freesound-cc0/634155-ceramic-slide.mp3 \
    -i "$work/voice.wav" -filter_complex "$room;$slide;$voice;$mix" \
    -map '[audio]' -t "$seconds" "$work/premix.wav"
  normalize="$(python3 - "$work/premix.wav" <<'PY3'
import json, subprocess, sys
sys.path.insert(0, 'scripts')
from audio_standards import loudnorm_filter
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', sys.argv[1], '-af', loudnorm_filter(print_json=True),
                      '-f', 'null', '-'], capture_output=True, text=True).stderr
m, _ = json.JSONDecoder().raw_decode(log[log.rindex('{'):])
print(loudnorm_filter() + (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
      f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
      f":offset={m['target_offset']}:linear=true"))
PY3
)"
fi
if [[ "$mode" == --story ]]; then
  ffmpeg -n -v error -i "$work/picture.mp4" -i "$work/premix.wav" -af "$normalize" \
    -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -t "$seconds" "$output"
else
  ffmpeg -n -v error -i "$work/picture.mp4" \
    -ss 18 -t "$seconds" -i assets/foley/public-domain/ambient-kitchen.ogg \
    -ss 0.53 -t 0.36 -i assets/foley/freesound-cc0/634155-ceramic-slide.mp3 \
    -i "$work/voice.wav" -filter_complex "$room;$slide;$voice;$mix" \
    -map 0:v:0 -map '[audio]' -c:v copy -c:a aac -b:a 192k -ar 48000 -t "$seconds" "$output"
fi

printf 'Exported %s\n' "$output"

if [[ "$mode" == --story ]]; then
  if ! python3 scripts/qa-local-video.py --video "$output" --expected-seconds "$seconds" \
    --work-dir "$work" --report "${output%.mp4}.qa.json"; then
    echo 'Technical QA failed: inspect the cartoon export report.' >&2
    exit 5
  fi
  printf 'Studio verified export: %s\n' "$output"
fi
