"""Read-only inventory and upstream revision check for the Mac local models."""

import json
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISIONS = ROOT / 'storage/setup/model-revisions.json'
MODELS = (
    'dgrauet/ltx-2.3-mlx-q4',
    'mlx-community/gemma-3-12b-it-4bit',
    'stable-diffusion-v1-5/stable-diffusion-v1-5',
)
TOOLS = {'LTX MLX': ROOT / 'storage/tools/ltx-2-mlx',
         'ComfyUI': ROOT / 'storage/tools/ComfyUI'}


def command(*args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL,
                                       timeout=15).strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None


def remote_model_sha(repo):
    url = 'https://huggingface.co/api/models/' + repo
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return json.load(response).get('sha')
    except (OSError, ValueError, urllib.error.HTTPError):
        return None


def remote_kokoro_version():
    try:
        with urllib.request.urlopen('https://registry.npmjs.org/kokoro-js/latest',
                                    timeout=15) as response:
            return json.load(response).get('version')
    except (OSError, ValueError, urllib.error.HTTPError):
        return None


def main():
    recorded = json.loads(REVISIONS.read_text()) if REVISIONS.is_file() else {}
    print('Mac local model inventory (read-only)')
    for repo in MODELS:
        installed = recorded.get(repo)
        latest = remote_model_sha(repo)
        state = ('current' if installed and latest == installed else
                 'update available' if installed and latest else
                 'remote unavailable' if installed else 'not recorded')
        print(f'  {repo}: {state}')
        print(f'    installed: {installed or "unknown"}')
        print(f'    upstream:  {latest or "unknown"}')
    for label, folder in TOOLS.items():
        installed = command('git', '-C', str(folder), 'rev-parse', 'HEAD')
        remote = command('git', '-C', str(folder), 'ls-remote', 'origin', 'HEAD')
        latest = remote.split()[0] if remote else None
        state = 'current' if installed and latest == installed else (
            'update available' if installed and latest else 'remote unavailable')
        print(f'  {label}: {state} ({(installed or "unknown")[:12]} / {(latest or "unknown")[:12]})')
    for label, name in [('Active LTX', 'ltx-model-dir.txt'),
                        ('Active Gemma', 'gemma-model-dir.txt')]:
        pointer = ROOT / 'storage/setup' / name
        location = pointer.read_text().strip() if pointer.is_file() else None
        print(f'  {label}: {location or "not selected"}')
    package = ROOT / 'storage/tools/kokoro/package.json'
    if package.is_file():
        version = json.loads(package.read_text()).get('dependencies', {}).get('kokoro-js')
        latest = remote_kokoro_version()
        state = 'current' if version and latest == version else (
            'update available' if version and latest else 'remote unavailable')
        print(f'  Kokoro JS: {state} ({version or "unknown"} / {latest or "unknown"})')
    ollama = command('ollama', 'list')
    print('  Ollama models:')
    for line in (ollama or 'unavailable').splitlines():
        print('    ' + line)
    print('Check reports updates only. Keep the active model pinned until a sample render passes review.')


if __name__ == '__main__':
    main()
