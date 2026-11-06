#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo "This installer requires an Apple Silicon Mac." >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p storage/setup storage/tools
exec > >(tee -a storage/setup/mac-install.log) 2>&1
echo "Installing local AI tools and downloading models. This may take substantial time and disk space."
if [[ $(df -Pk . | awk 'END {print $4}') -lt 52428800 ]]; then
  echo "At least 50 GiB free disk space is required for this setup budget." >&2
  exit 1
fi
if ! command -v brew >/dev/null; then
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  else
    curl --fail --location --retry 3 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o storage/setup/homebrew-install.sh
    /bin/bash storage/setup/homebrew-install.sh
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
fi
for tool in node@24 ffmpeg uv ollama git; do
  brew list --versions "$tool" >/dev/null 2>&1 || brew install "$tool"
done
export PATH="$(brew --prefix node@24)/bin:$PATH"
npm ci
npm run build
if ! uv python find 3.12 >/dev/null 2>&1; then
  uv python install 3.12
fi

# Keep local runtimes isolated and reuse the exact checkout on repeat runs.
checkout() {
  local url="$1" folder="$2"
  if [[ ! -d "$folder" ]]; then git clone --depth 1 "$url" "$folder"; fi
  git -C "$folder" rev-parse HEAD
}
checkout https://github.com/Comfy-Org/ComfyUI.git storage/tools/ComfyUI > storage/setup/comfy-revision.txt
if [[ ! -x storage/tools/ComfyUI/.venv/bin/python ]]; then
  uv venv --python 3.12 storage/tools/ComfyUI/.venv
fi
uv pip install --python storage/tools/ComfyUI/.venv/bin/python -r storage/tools/ComfyUI/requirements.txt huggingface-hub
checkout https://github.com/dgrauet/ltx-2-mlx.git storage/tools/ltx-2-mlx > storage/setup/ltx-revision.txt
(cd storage/tools/ltx-2-mlx && uv sync --frozen --python 3.12)
storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx --help > storage/setup/ltx-help.txt

brew services start ollama
export OLLAMA_HOST=http://127.0.0.1:11434
ready=0
for attempt in {1..60}; do
  if curl --fail --silent "$OLLAMA_HOST/api/tags" >/dev/null; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo "Ollama failed to start. Inspect brew services info ollama."; exit 1; }
ollama pull qwen3:1.7b

# Models are saved outside Git. Download only the weights used by the Mac
# distilled image-to-video smoke test; the full pack also contains dev and
# older distilled transformers, LoRAs, and unused upscalers (tens of GB).
export HF_HOME="$ROOT/storage/models/huggingface"
storage/tools/ComfyUI/.venv/bin/python - <<'PY'
import json
from pathlib import Path
from huggingface_hub import HfApi, hf_hub_download, snapshot_download
api = HfApi()
record = {}
image_repo = "stable-diffusion-v1-5/stable-diffusion-v1-5"
video_repo = "dgrauet/ltx-2.3-mlx-q4"
for repo in [image_repo, video_repo]:
    record[repo] = api.model_info(repo).sha
hf_hub_download(image_repo, "v1-5-pruned-emaonly.safetensors",
    revision=record[image_repo], local_dir="storage/tools/ComfyUI/models/checkpoints")
video_files = [
    "config.json", "embedded_config.json", "quantize_config.json", "split_model.json",
    "transformer-distilled-1.1.safetensors", "connector.safetensors",
    "vae_encoder.safetensors", "vae_decoder.safetensors",
    "spatial_upscaler_x2_v1_1.safetensors", "spatial_upscaler_x2_v1_1_config.json",
    "audio_vae.safetensors", "vocoder.safetensors",
]
print("Downloading the 12 files required for the distilled Mac motion test.", flush=True)
video_path = snapshot_download(video_repo, revision=record[video_repo],
    allow_patterns=video_files, max_workers=2)
missing = [name for name in video_files if not (Path(video_path) / name).is_file()]
if missing:
    raise RuntimeError(f"LTX snapshot is missing required files: {', '.join(missing)}")
Path("storage/setup/ltx-model-dir.txt").write_text(video_path + "\n")
Path("storage/setup/model-revisions.json").write_text(json.dumps(record, indent=2))
PY
storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx info --model "$(cat storage/setup/ltx-model-dir.txt)" > storage/setup/ltx-model-info.txt
mkdir -p storage/tools/kokoro
if [[ ! -f storage/tools/kokoro/package.json ]]; then
  printf '{"private":true,"type":"module"}\n' > storage/tools/kokoro/package.json
fi
npm install --prefix storage/tools/kokoro --save-exact kokoro-js@1.2.1
node scripts/setup-kokoro.mjs
uv pip freeze --python storage/tools/ComfyUI/.venv/bin/python > storage/setup/comfy-python.txt
node scripts/local-media.mjs doctor > storage/setup/mac-diagnostics.json
echo "Installation steps completed. Model generation quality and performance still require the Mac smoke test."
echo "Start images: npm run start:comfy:mac"
echo "Test video: npm run test:motion:mac -- IMAGE 'motion prompt' OUTPUT.mp4"
