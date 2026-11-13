#!/usr/bin/env python3
"""Check a local scenario against what the channel has learned, before spending an hour rendering it.

  python3 scripts/preflight-short.py drafts/generated/ID.local-scenario.json [--allow]

Checks (from the Billionaire Bites data in episodes/channel-performance.json):
  1. Repeat topic: same subject as a published or scheduled Short. Blocks the render unless --allow.
  2. Hook strength: rough 0-100 score of the first narration line, from the hook rubric. Warns below 60. It is a heuristic, not a prediction.
  3. Length: 20-35 s, and the narration fits the time (about 2.5 words a second).
  4. Currency: warns on non-USD money in the first line (the yen melons Short got 25 views).
  5. Claims: warns when the plan lists no claims to check or sources.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NON_USD = re.compile(r'\b(yen|dirhams?|rupees?|pounds?|euros?|£|€)\b|[£€¥]', re.I)
CONTRAST = re.compile(r'\b(vs\.?|versus|same|instead|but|only|yet)\b', re.I)
BANNED = re.compile(r'\b(illegal|banned|ban|forbidden|outlawed)\b', re.I)
NUMBER = re.compile(r'\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b', re.I)
VAGUE_OPEN = re.compile(r'^(this|these|the|a|an)\b', re.I)
VISIBLE_ACTION = re.compile(r'\b(lift\w*|pull\w*|push\w*|pour\w*|drip\w*|jump\w*|run\w*|walk\w*|roll\w*|spin\w*|bite\w*|chew\w*|slic\w*|chop\w*|stir\w*|grab\w*|reach\w*|open\w*|clos\w*|arrang\w*|melt\w*|bubbl\w*|rac\w*|carry\w*|drop\w*|catch\w*|cross\w*|serv\w*|eat\w*|driv\w*|pedal\w*|sprinkl\w*|flip\w*|toss\w*|fold\w*|trac\w*|step\w*|climb\w*|break\w*|crack\w*|glid\w*)\b', re.I)


def hook_score(line):
    words = line.split()
    score, notes = 40, []
    if NUMBER.search(line):
        score += 20; notes.append('number in the first line')
    else:
        notes.append('no number in the first line')
    if BANNED.search(line):
        score += 15; notes.append('banned/illegal angle')
    if CONTRAST.search(line):
        score += 10; notes.append('contrast word')
    if '?' in line:
        score += 5
    if len(words) <= 12:
        score += 10
    else:
        score -= 10; notes.append('first line over 12 words')
    if VAGUE_OPEN.match(line) and not NUMBER.search(line):
        score -= 10; notes.append('vague opening')
    if NON_USD.search(line):
        score -= 15; notes.append('non-USD currency')
    return max(0, min(100, score)), notes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    data = json.loads(Path(args[0]).read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    problems, warnings = [], []
    topic = subprocess.run([sys.executable, str(ROOT / 'scripts/topic-check.py'), plan['title'] + ' ' + data.get('topic', ''), '--allow'],
                           capture_output=True, text=True)
    print('Topic:', topic.stdout.strip())
    if topic.stdout.startswith('Repeat'):
        problems.append('repeat topic')
    first = plan['shots'][0]['narration']
    score, notes = hook_score(first)
    print(f'Hook: "{first}" -> {score}/100 ({"; ".join(notes)})')
    if score < 60:
        warnings.append(f'weak hook ({score}/100): lead with the number or the banned angle, under 12 words')
    seconds = settings['seconds']
    words = sum(len(s['narration'].split()) for s in plan['shots'])
    print(f'Length: {seconds} s, {words} narrated words ({words / seconds:.1f} per second)')
    if not 20 <= seconds <= 35:
        warnings.append('length outside the 20-35 s band')
    if words / seconds > 3.2:
        warnings.append('narration too dense for the time')
    # Per-shot pacing: speech runs about 2.6 words per second. A shot much longer than its line leaves dead air.
    for i, shot in enumerate(plan['shots'], 1):
        speech = len(shot['narration'].split()) / 2.6 + 0.3
        gap = shot['seconds'] - speech
        if gap > 1.2:
            warnings.append(f'shot {i}: line fills about {speech:.1f} s of {shot["seconds"]} s, so about {gap:.1f} s of silence; shorten the shot to {speech + 0.6:.0f} s or add words')
        elif gap < -0.2:
            warnings.append(f'shot {i}: line needs about {speech:.1f} s but the shot is {shot["seconds"]} s; trim words or lengthen the shot')
        if not VISIBLE_ACTION.search(shot['motionPrompt']):
            warnings.append(f'shot {i}: motion prompt has no recognizable physical action; review it for camera-only movement before rendering')
    if NON_USD.search(first):
        warnings.append('non-USD money in the first line: use dollars')
    if not plan.get('claimsToCheck'):
        warnings.append('no claims or sources listed')
    for w in warnings:
        print('WARNING:', w)
    for p in problems:
        print('BLOCKED:', p)
    if problems and '--allow' not in sys.argv:
        sys.exit(1)


if __name__ == '__main__':
    main()
