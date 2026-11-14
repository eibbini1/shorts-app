#!/usr/bin/env python3
"""Check this Mac can run the local pipeline before a long render starts. Prints OK or FAIL with the fix.

  python3 scripts/check-env.py [--min-disk-gb 15]

Exit 1 when something required is missing. Takes about a second.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--min-disk-gb', type=float, default=15)
    args = parser.parse_args()
    failures = 0

    def report(ok, name, fix=''):
        nonlocal failures
        print(f"{'OK  ' if ok else 'FAIL'} {name}" + ('' if ok else f'  -> {fix}'))
        failures += 0 if ok else 1

    for tool in ('ffmpeg', 'ffprobe', 'node', 'python3'):
        report(shutil.which(tool) is not None, tool, f'brew install {"ffmpeg" if tool.startswith("ff") else tool}')
    if sys.platform == 'darwin':
        power = subprocess.run(['pmset', '-g', 'batt'], capture_output=True, text=True).stdout.lower()
        import re
        match = re.search(r'(\d+)%', power)
        if match:
            battery = int(match.group(1))
            charging = 'charging' in power and 'discharging' not in power
            report(battery > 10 or charging, f'Mac power ({battery}% battery, {"charging" if charging else "discharging"})',
                   'connect the charger and confirm pmset -g batt says charging before GPU rendering')
    if shutil.which('ffmpeg'):
        filters = subprocess.run(['ffmpeg', '-hide_banner', '-filters'], capture_output=True, text=True).stdout
        report(' subtitles ' in filters, 'ffmpeg subtitles filter (captions)', 'install ffmpeg with libass: brew install ffmpeg')
    needed = {
        'FLUX image tool (mflux)': ROOT / 'storage/tools/mflux/.venv/bin/mflux-generate-flux2',
        'FLUX model': ROOT / 'storage/models/flux2-klein-4b-4bit',
        'LTX video tool': ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx',
        'Kokoro voice (node)': ROOT / 'storage/tools/kokoro/node_modules/kokoro-js',
        'Soundtrack python': ROOT / 'storage/tools/ComfyUI/.venv/bin/python',
    }
    for name, path in needed.items():
        report(path.exists(), name, f'missing {path.relative_to(ROOT)}; run the setup script for it (scripts/setup-*.sh)')
    mflux_python = ROOT / 'storage/tools/mflux/.venv/bin/python'
    if mflux_python.exists():
        try:
            gpu = subprocess.run([str(mflux_python), '-c', 'import mlx.core as mx; mx.ones((1,))'],
                                 capture_output=True, text=True, timeout=15)
            gpu_ready = gpu.returncode == 0
        except subprocess.TimeoutExpired:
            gpu_ready = False
        report(gpu_ready, 'Metal GPU available to this shell',
               'run from a normal Mac Terminal with GPU access; this shell cannot run FLUX/LTX')
    free_gb = shutil.disk_usage(ROOT).free / 1e9
    report(free_gb >= args.min_disk_gb, f'free disk {free_gb:.0f} GB (need {args.min_disk_gb:.0f})', 'free space: delete old storage/any-local work folders')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
