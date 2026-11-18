#!/usr/bin/env python3
"""Read-only syntax and npm entry-point check; never runs uploads or model jobs."""
import ast
import json
import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'


def main():
    errors = []
    package = json.loads((ROOT / 'package.json').read_text())
    entries = package['scripts']
    for name, command in entries.items():
        try:
            parts = shlex.split(command)
        except ValueError as error:
            errors.append(f'{name}: invalid command quoting: {error}')
            continue
        if len(parts) >= 3 and parts[:2] == ['node', '--test']:
            target = ROOT / parts[2]
            if not target.is_file():
                errors.append(f'{name}: missing entry point {parts[2]}')
            continue
        if len(parts) >= 2 and parts[0] in {'bash', 'python3', 'node', 'tsx'}:
            target = ROOT / parts[1]
            if not target.is_file():
                errors.append(f'{name}: missing entry point {parts[1]}')
    counts = {}
    for suffix, checker in (('.py', None), ('.sh', 'bash'), ('.mjs', 'node')):
        files = list(SCRIPTS.rglob(f'*{suffix}'))
        counts[suffix] = len(files)
        for file in files:
            try:
                if checker:
                    result = subprocess.run([checker, '-n' if checker == 'bash' else '--check', str(file)],
                                            capture_output=True, text=True)
                    if result.returncode:
                        errors.append(f'{file.relative_to(ROOT)}: {result.stderr.strip()}')
                else:
                    ast.parse(file.read_text(encoding='utf-8-sig'), filename=str(file))
            except (SyntaxError, UnicodeError) as error:
                errors.append(f'{file.relative_to(ROOT)}: {error}')
    print(f"Checked {len(entries)} npm entries and syntax of {counts['.py']} Python, "
          f"{counts['.sh']} shell, {counts['.mjs']} Node scripts")
    for error in errors:
        print('FAIL:', error)
    if errors:
        raise SystemExit(1)
    print('Static script checks passed; runtime jobs still need their own tests')


if __name__ == '__main__':
    main()
