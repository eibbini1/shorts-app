#!/usr/bin/env python3
"""Deterministic repairs for story-gate blocks, so a random draft is fixed instead of thrown away.

Usage: repair-local-story.py SCENARIO
Reads the audit problems itself, edits only the fields a problem names, keeps a
copy as SCENARIO.before-repair.json, and prints one 'FIXED:' line per change.
Problems it cannot fix safely (repeat topic, timing, narration fit) are left for a redraft.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STOP = {'the','and','with','from','into','that','this','then','small','tiny','little','giant'}


def problems(path):
    out = subprocess.run([sys.executable, str(ROOT / 'scripts/audit-local-story.py'), str(path)], capture_output=True, text=True).stdout
    return [l[len('BLOCKED: '):] for l in out.splitlines() if l.startswith('BLOCKED: ')]


def parts_of(text):
    """'A, then B' -> ['A', 'B'], the same split the Studio uses for hook and ending."""
    ps = [p.strip() for p in re.split(r'\s*(?:,\s*(?:and\s+)?then|\bthen\b|[;.])\s*', text, flags=re.I) if len(p.strip()) > 3]
    return ps or [text.strip()]


def sentence(text):
    text = text.strip().rstrip('.')
    return text[:1].upper() + text[1:] + '.' if text else ''


def first_sentence(text):
    return text.split('.', 1)[0].strip()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    found = problems(path)
    if not found:
        print('Nothing to repair.')
        return 0
    path.with_suffix('.before-repair.json').write_text(json.dumps(data, indent=2))
    plan, shots = data['plan'], data['plan']['shots']
    brief = data.get('creativeBrief') or {}
    ending = data.get('requestedEnding') or ''
    action_parts = parts_of(brief.get('mustShow') or data.get('topic', ''))
    fixed = []
    for p in found:
        if p == 'title does not name the requested subject':
            subject = [w for w in re.findall(r'[A-Za-z]{4,}', data.get('topic', '')) if w.lower() not in STOP][:3]
            if subject:
                plan['title'] = ' '.join(w.capitalize() for w in subject) + ': ' + plan.get('title', '').strip()
                fixed.append('title now names the subject')
        elif p == 'payoff changed the requested ending' and ending:
            plan['payoff'] = sentence(ending); fixed.append('payoff set to your ending')
        elif p == 'final moving shot does not depict the requested ending' and ending:
            shots[-1]['motionPrompt'] = shots[-1]['motionPrompt'].rstrip() + ' The shot ends as ' + ending.strip().rstrip('.') + '.'
            fixed.append('final shot now ends on your ending')
        elif p == 'first shot does not depict the requested visual hook' and brief.get('hookImage'):
            shots[0]['imagePrompt'] = shots[0]['imagePrompt'].rstrip() + ' Opening image: ' + brief['hookImage'].strip().rstrip('.') + '.'
            fixed.append('first shot now shows your opening')
        elif p == 'no moving shot depicts the required physical action':
            for i, shot in enumerate(shots):
                part = action_parts[min(i, len(action_parts) - 1)]
                shot['motionPrompt'] = shot['motionPrompt'].rstrip() + ' Action: ' + part.rstrip('.') + '.'
            fixed.append('each shot now carries its part of your action')
        elif m := re.fullmatch(r'shot (\d+) has no recognizable physical action', p):
            i = int(m.group(1)) - 1
            part = action_parts[min(i, len(action_parts) - 1)]
            shots[i]['motionPrompt'] = shots[i]['motionPrompt'].rstrip() + ' Action: ' + part.rstrip('.') + '.'
            fixed.append(f'shot {i+1} now has a clear action')
        elif m := re.fullmatch(r'shots (\d+) and (\d+) have near-identical imagePrompt', p):
            j = int(m.group(2)) - 1
            lead = first_sentence(shots[j]['motionPrompt']) or 'A later moment'
            rest = shots[j]['imagePrompt'].split('.', 1)
            shots[j]['imagePrompt'] = sentence('Later moment: ' + lead) + (' ' + rest[1].strip() if len(rest) > 1 else '')
            fixed.append(f'shot {j+1} first frame now shows a different moment from shot {j}')
    if not fixed:
        print('No safe automatic repair for: ' + '; '.join(found))
        return 1
    path.write_text(json.dumps(data, indent=2) + '\n')
    for f in fixed:
        print('FIXED:', f)
    left = problems(path)
    for l in left:
        print('STILL:', l)
    return 0 if not left else 1


if __name__ == '__main__':
    sys.exit(main())
