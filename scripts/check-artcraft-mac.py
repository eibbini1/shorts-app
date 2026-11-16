#!/usr/bin/env python3
"""Report installed ArtCraft desktop apps and automation CLIs without changing the Mac."""
import argparse
import os
import plistlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = ('PhotoCraft', 'FilmCraft', 'EffectCraft', 'SoundCraft')
ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-cli', action='store_true', help='Fail when a desktop app or matching CLI is missing')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        print('ArtCraft desktop check is for macOS.')
        return 1 if args.require_cli else 0
    problems = []
    for name in TOOLS:
        app = Path('/Applications') / f'{name}.app'
        if app.is_dir():
            info = app / 'Contents/Info.plist'
            try:
                version = plistlib.loads(info.read_bytes()).get('CFBundleShortVersionString', 'unknown')
            except (OSError, ValueError):
                version = 'unknown'
            print(f'{name}: desktop {version} at {app}')
        else:
            print(f'{name}: desktop missing')
            version = None
            problems.append(f'{name} desktop missing')
        key = f'SHORTS_{name.upper()}_CLI'
        bundled = ROOT / 'storage/tools/artcraft' / f'{name.lower()}-cli'
        cli = os.environ.get(key) or (str(bundled) if bundled.is_file() else None) or shutil.which(f'{name.lower()}-cli')
        if cli and Path(cli).is_file():
            result = subprocess.run([cli, '--version'], capture_output=True, text=True, timeout=15)
            detail = (result.stdout or result.stderr).strip().splitlines()
            print(f'  CLI: {detail[0] if detail else "unavailable"} at {cli}')
            found = re.search(r'\b\d+\.\d+\.\d+\b', detail[0] if detail else '')
            if result.returncode or not found or (version and found.group() != version):
                problems.append(f'{name} CLI version does not match desktop {version}')
        else:
            print(f'  CLI: missing (set {key} to its downloaded CLI path)')
            problems.append(f'{name} CLI missing')
    print('Desktop apps alone do not enable headless pipeline editing.')
    if problems and args.require_cli:
        print('ArtCraft path blocked: ' + '; '.join(problems), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
