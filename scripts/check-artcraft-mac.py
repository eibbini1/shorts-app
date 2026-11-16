#!/usr/bin/env python3
"""Report installed ArtCraft desktop apps and automation CLIs without changing the Mac."""
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = ('PhotoCraft', 'FilmCraft', 'EffectCraft', 'SoundCraft')


def main():
    if sys.platform != 'darwin':
        print('ArtCraft desktop check is for macOS.')
        return 0
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
        key = f'SHORTS_{name.upper()}_CLI'
        cli = os.environ.get(key) or shutil.which(f'{name.lower()}-cli')
        if cli and Path(cli).is_file():
            result = subprocess.run([cli, '--version'], capture_output=True, text=True, timeout=15)
            detail = (result.stdout or result.stderr).strip().splitlines()
            print(f'  CLI: {detail[0] if detail else "unavailable"} at {cli}')
        else:
            print(f'  CLI: missing (set {key} to its downloaded CLI path)')
    print('Desktop apps alone do not enable headless pipeline editing.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
