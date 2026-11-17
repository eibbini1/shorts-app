#!/usr/bin/env python3
"""Studio draft loop: write the story, check it, repair it, and redraft if needed (up to 3 tries).

Usage: studio-draft.py --answers FILE [--allow-repeat] [--tries 3]
Never shows a dead end for a fixable problem. Exit 0 = a plan that passed every gate;
exit 3 = still blocked (the last BLOCKED lines say why; NEEDS-CHOICE lines name a user decision).
"""
import argparse, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCN = re.compile(r'(drafts/generated/[^\s\'"]+\.local-scenario\.json)')


def say(*a):
    print(*a, flush=True)


def checks(scn, allow_repeat):
    """Same gates the render runs before any media work; returns the BLOCKED reasons."""
    found = []
    pre = ['--strict'] + (['--allow'] if allow_repeat else [])
    for script, extra in (('preflight-short.py', pre), ('audit-local-story.py', [])):
        out = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), scn, *extra], cwd=ROOT, capture_output=True, text=True).stdout
        found += [l[9:] for l in out.splitlines() if l.startswith('BLOCKED: ')]
    if allow_repeat:
        found = [p for p in found if p != 'repeat topic']
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--answers', required=True)
    p.add_argument('--allow-repeat', action='store_true')
    p.add_argument('--tries', type=int, default=3)
    a = p.parse_args()
    last, scn = [], None
    for attempt in range(1, a.tries + 1):
        say(f'Attempt {attempt}/{a.tries}: writing the story')
        proc = subprocess.Popen(['bash', 'scripts/make-local-video.sh', '--draft-only', '--answers', a.answers], cwd=ROOT,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        scn = None
        for line in proc.stdout:
            line = line.rstrip('\n')
            if m := SCN.search(line): scn = m.group(1)
            # Gate lines are re-checked below; showing them raw now would look like a dead end.
            if line.startswith('BLOCKED: '): line = 'CHECK: ' + line[9:]
            elif 'blocked it' in line or 'Story gate blocked' in line: continue
            say(line)
        proc.wait()
        if not scn or not (ROOT / scn).is_file():
            say('Fixing: the story model did not save a plan; trying again'); continue
        last = checks(scn, a.allow_repeat)
        if not last:
            say(f'Story passed every check on attempt {attempt}.'); say('Plan ready:', scn); return 0
        if last == ['repeat topic']:
            break
        say('Fixing: ' + '; '.join(last))
        rep = subprocess.run([sys.executable, str(ROOT / 'scripts/repair-local-story.py'), scn], cwd=ROOT, capture_output=True, text=True)
        for line in rep.stdout.splitlines():
            if line.startswith('FIXED: '): say('Fixed automatically: ' + line[7:])
        last = checks(scn, a.allow_repeat)
        if not last:
            say(f'Story passed every check after automatic fixes (attempt {attempt}).'); say('Plan ready:', scn); return 0
        if attempt < a.tries:
            say('Fixing: still not right (' + '; '.join(last) + '); writing a fresh version')
    if scn: say('Plan saved:', scn)
    for b in last:
        say('BLOCKED:', b)
    if 'repeat topic' in last:
        say('NEEDS-CHOICE: repeat-topic')
    else:
        say('NEEDS-CHOICE: still-blocked')
    return 3


if __name__ == '__main__':
    sys.exit(main())
