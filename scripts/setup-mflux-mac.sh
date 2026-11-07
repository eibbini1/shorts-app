#!/bin/bash
# Optional isolated image-model trial; does not replace ComfyUI or LTX.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
uv venv --python 3.12 --allow-existing storage/tools/mflux/.venv
uv pip install --python storage/tools/mflux/.venv/bin/python 'mflux==0.24.0'
HF_HUB_DISABLE_XET=1 storage/tools/mflux/.venv/bin/python -u - <<'PY'
from huggingface_hub import snapshot_download
from pathlib import Path
import threading
import time

folder = Path('storage/models/flux2-klein-4b-4bit')
finished = threading.Event()
def progress():
    while not finished.wait(15):
        total = 0
        for item in folder.rglob('*'):
            try:
                if item.is_file(): total += item.stat().st_size
            except FileNotFoundError:
                pass
        print(f'Downloaded/cache bytes: {total / 1e9:.2f} GB (expected about 4.62 GB).', flush=True)
threading.Thread(target=progress, daemon=True).start()
print('Downloading 4.62 GB: FLUX.2 Klein 4B q4. Downloads resume on rerun.', flush=True)
snapshot_download(
    'mlx-community/flux2-klein-4b-4bit',
    revision='860e87183ceb29e39627c0612ebd66d8ea66e68c',
    local_dir='storage/models/flux2-klein-4b-4bit',
    allow_patterns=['text_encoder/*', 'tokenizer/*', 'transformer/*', 'vae/*', 'README.md'],
    max_workers=2,
)
finished.set()
print('Download complete. Run a sample and review it before changing image defaults.')
PY
