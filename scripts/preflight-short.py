#!/usr/bin/env python3
"""Check a local scenario against what the channel has learned, before spending an hour rendering it.

  python3 scripts/preflight-short.py drafts/generated/ID.local-scenario.json [--allow]

Checks (from the Billionaire Bites data in episodes/channel-performance.json):
  1. Repeat topic: same subject as a published or scheduled Short. Blocks the render unless --allow.
  2. Hook strength: rough 0-100 score of the first narration line, from the hook rubric. Warns below 60. It is a heuristic, not a prediction.
  3. Length: 10-35 s, and the narration fits the time (about 2.5 words a second).
  4. Currency: warns on non-USD money in the first line (the yen melons Short got 25 views).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from presentation_mode import choose as choose_presentation  # noqa: E402
import hook_bank  # noqa: E402
from scenario_v1 import validate_scenario  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
NON_USD = re.compile(r'\b(yen|dirhams?|rupees?|pounds?|euros?|£|€)\b|[£€¥]', re.I)
CONTRAST = re.compile(r'\b(vs\.?|versus|same|instead|but|only|yet)\b', re.I)
BANNED = re.compile(r'\b(illegal|banned|ban|forbidden|outlawed)\b', re.I)
NUMBER = re.compile(r'\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b', re.I)
VAGUE_OPEN = re.compile(r'^(this|these|the|a|an)\b', re.I)
VISIBLE_ACTION = re.compile(r'\b(lift\w*|lower\w*|spread\w*|pull\w*|push\w*|pour\w*|drizzl\w*|drip\w*|jump\w*|run\w*|walk\w*|roll\w*|spin\w*|bite\w*|chew\w*|slic\w*|chop\w*|stir\w*|grab\w*|reach\w*|open\w*|clos\w*|arrang\w*|coat\w*|melt\w*|bubbl\w*|rac\w*|carry\w*|drop\w*|catch\w*|cross\w*|serv\w*|eat\w*|driv\w*|pedal\w*|sprinkl\w*|squeez\w*|sear\w*|bast\w*|dip\w*|taste\w*|flip\w*|toss\w*|fold\w*|trac\w*|step\w*|climb\w*|break\w*|crack\w*|glid\w*|add\w*|present\w*|adjust\w*|smash\w*|press\w*|toast\w*|stack\w*)\b', re.I)
PLATE_ACTION = re.compile(r'\b(?:plate|plates|plating)\s+(?:the|a|an|one|each|it|their|her|his|beside)\b', re.I)
# Hand-and-tool contact actions that the local motion model renders poorly (seen on a patty flip, 2026-11-22 bench).
# Heuristic, warning only: it never blocks a render.
HARD_CONTACT = re.compile(r'\b(flip|flips|flipping|flipped|toss|tosses|tossing|catch|catches|catching|juggl\w*|knead\w*|whisking|twirl\w*|chopping|slicing|peeling)\b', re.I)


def hard_motion(prompt):
    """Sorted, de-duplicated hand-tool contact verbs found in a motion prompt."""
    return sorted({m.group(0).lower() for m in HARD_CONTACT.finditer(prompt or '')})


def motion_pack(pack_id):
    if not isinstance(pack_id, str):
        return None
    data = json.loads((ROOT / 'data/topic-packs.json').read_text(encoding='utf-8'))
    return next((pack for pack in data['packs'] if pack['id'] == pack_id), None)


def pack_motion_warning(pack, prompt):
    if not pack or not (pattern := pack.get('motionRiskPattern')):
        return None
    matches = sorted({match.group().lower() for match in re.finditer(pattern, prompt, re.I)})
    if not matches:
        return None
    alternatives = f' Try {", ".join(pack["safe"])} if it still serves the story.' if pack['safe'] else ''
    return f'{pack["id"]}: local motion risk ({", ".join(matches)}). Review the action before rendering.{alternatives}'


def hook_score(line, topic=''):
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
    subject_words = {word for word in re.findall(r'[a-z]{4,}', topic.lower())
                     if word not in {'with', 'from', 'this', 'that', 'video', 'short', 'story', 'cooking'}}
    if subject_words.intersection(re.findall(r'[a-z]{4,}', line.lower())):
        score += 15; notes.append('names the subject')
    if VISIBLE_ACTION.search(line):
        score += 10; notes.append('visible action')
    return max(0, min(100, score)), notes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    data = json.loads(Path(args[0]).read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    presentation = choose_presentation(data)
    pack = motion_pack(data.get('motionPackId'))
    problems, warnings = [], []
    for issue in validate_scenario(data):
        warnings.append(f'Scenario v1: {issue}')
    topic = subprocess.run([sys.executable, str(ROOT / 'scripts/topic-check.py'), plan['title'] + ' ' + data.get('topic', ''), '--allow'],
                           capture_output=True, text=True)
    print('Topic:', topic.stdout.strip())
    if topic.stdout.startswith('Repeat'):
        problems.append('repeat topic')
    first = plan['shots'][0]['narration']
    score, notes = hook_score(first, data.get('topic', '') or plan.get('title', ''))
    if presentation['voice']:
        print(f'Hook: "{first}" -> {score}/100 ({"; ".join(notes)})')
        mechanisms = hook_bank.detect_mechanisms(first)
        print(f'Hook mechanism: {", ".join(mechanisms) if mechanisms else "none detected"}')
        template = hook_bank.anti_pattern_hit(first)
        if template:
            warnings.append(f'hook uses a banned template phrase: "{template}"')
    else:
        print('Visual hook: ASMR mode; inspect the first moving shot before release.')
    if presentation['voice'] and score < 60:
        message = f'weak hook ({score}/100): open with a concrete subject and a short curiosity gap'
        (problems if '--strict' in sys.argv else warnings).append(message)
    seconds = settings['seconds']
    words = sum(len(s['narration'].split()) for s in plan['shots'])
    if presentation['voice']:
        print(f'Length: {seconds} s, {words} narrated words ({words / seconds:.1f} per second)')
    else:
        print(f'Length: {seconds} s, no narration in {presentation["mode"]} mode; shot text is for planning only')
    if not 10 <= seconds <= 35:
        warnings.append('length outside the 10-35 s local Short band')
    if presentation['voice'] and words / seconds > 3.2:
        warnings.append('narration too dense for the time')
    # Per-shot pacing: speech runs about 2.6 words per second. A shot much longer than its line leaves dead air.
    for i, shot in enumerate(plan['shots'], 1):
        if presentation['voice']:
            speech = len(shot['narration'].split()) / 2.6 + 0.3
            gap = shot['seconds'] - speech
            if gap > 1.2:
                warnings.append(f'shot {i}: line fills about {speech:.1f} s of {shot["seconds"]} s, so about {gap:.1f} s of silence; shorten the shot to {speech + 0.6:.0f} s or add words')
            elif gap < -0.2:
                warnings.append(f'shot {i}: line needs about {speech:.1f} s but the shot is {shot["seconds"]} s; trim words or lengthen the shot')
        if not VISIBLE_ACTION.search(shot['motionPrompt']) and not PLATE_ACTION.search(shot['motionPrompt']):
            warnings.append(f'shot {i}: motion prompt has no recognizable physical action; review it for camera-only movement before rendering')
        pack_warning = pack_motion_warning(pack, shot['motionPrompt'])
        if pack_warning:
            warnings.append(f'shot {i}: {pack_warning}')
        risky = hard_motion(shot['motionPrompt'])
        if risky:
            warnings.append(f'shot {i}: hand-tool contact action ({", ".join(risky)}) often looks fake in local motion; prefer the moment before or after (melt, steam, drop, slow push-in) or keep hands still')
    if NON_USD.search(first):
        warnings.append('non-USD money in the first line: use dollars')
    for w in warnings:
        print('WARNING:', w)
    for p in problems:
        print('BLOCKED:', p)
    if problems and '--allow' not in sys.argv:
        sys.exit(1)


if __name__ == '__main__':
    main()
