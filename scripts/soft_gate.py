#!/usr/bin/env python3
"""Run one pre-render gate; downgrade its soft problems to warnings.

Usage: soft_gate.py [--soft-all] -- COMMAND [ARGS...]
Streams the gate's output. Every 'BLOCKED: x' line whose problem is soft (scripts/gate_severity.py)
is printed as 'WARNING: x'. The exit code is the gate's own code unless every blocking line was soft,
in which case it is 0. --soft-all treats the whole gate as style-class (the prompt-score gate, which
prints scores and no BLOCKED lines). A gate that fails with no recognisable lines keeps its exit code.
"""
import re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gate_severity import is_soft  # noqa: E402


def main(argv):
    if '--' not in argv:
        sys.exit(__doc__)
    split_at = argv.index('--')
    soft_all = '--soft-all' in argv[:split_at]
    command = argv[split_at + 1:]
    if not command:
        sys.exit(__doc__)
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    blocked, soft_blocked, saw_scores = 0, 0, False
    for line in proc.stdout:
        line = line.rstrip('\n')
        saw_scores = saw_scores or bool(re.search(r'\(prompts \d+, story \d+\)', line))
        if line.startswith('BLOCKED: '):
            blocked += 1
            if soft_all or is_soft(line[9:]):
                soft_blocked += 1
                line = 'WARNING: ' + line[9:]
        print(line, flush=True)
    code = proc.wait()
    if code == 0:
        return 0
    if soft_all and saw_scores:  # a crash with no score table is a real failure, not a style warning
        print('WARNING: this check failed but only affects picture style; rendering continues. Review the notes above.', flush=True)
        return 0
    if blocked and blocked == soft_blocked:
        return 0
    return code


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
