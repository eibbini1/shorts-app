#!/usr/bin/env python3
"""Fast editorial gate before spending time on FLUX or LTX."""
import argparse
import json
import math
import re
import sys
from pathlib import Path

STOP = {'the','and','with','from','into','that','this','one','same','scene','shot','film','video','warm','cinematic','real','local'}
ACTION = re.compile(r'\b(pat|place|drop|sear|bast|pour|squeeze|lift|plate|cut|slice|bite|take|stir|chop|melt|sizzle|open|close|pull|push|run|walk|jump|turn|catch|serve|mix|roll|spin|crack|break)\w*\b', re.I)
CAMERA_ONLY = re.compile(r'^(?:the )?camera (?:slowly )?(?:pan|tilt|zoom|track)', re.I)


def words(value):
    return {w for w in re.findall(r'[a-z]{4,}', str(value).lower()) if w not in STOP}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('scenario', type=Path)
    a = p.parse_args()
    data = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    shots = plan['shots']
    problems, notes = [], []
    seconds = settings['seconds']
    if sum(s['seconds'] for s in shots) != seconds: problems.append('shot timings do not equal the requested runtime')
    if len(shots) < math.ceil(seconds / 6): problems.append('too few distinct shots; motion would repeat or stretch')
    topic_words = words(data.get('topic', ''))
    title_words = words(plan.get('title', ''))
    if topic_words and not topic_words.intersection(title_words): problems.append('title does not name the requested subject')
    ending = data.get('requestedEnding') or ''
    if ending:
        ending_words = words(ending)
        if len(ending_words.intersection(words(plan.get('payoff', '')))) < min(2, len(ending_words)):
            problems.append('payoff changed the requested ending')
        if len(ending_words.intersection(words(shots[-1]['motionPrompt']))) < min(2, len(ending_words)):
            problems.append('final moving shot does not depict the requested ending')
    first = shots[0]['narration'].strip()
    if len(first.split()) > 12: problems.append('opening narration exceeds 12 words')
    if re.match(r'^(this|these|the|a|an)\b', first, re.I): notes.append('opening could name the subject sooner')
    protagonist_words = words(data.get('storyArc', {}).get('protagonist', ''))
    setting_words = words(data.get('storyArc', {}).get('setting', ''))
    for i, shot in enumerate(shots, 1):
        if not ACTION.search(shot['motionPrompt']): problems.append(f'shot {i} has no recognizable physical action')
        if CAMERA_ONLY.search(shot['motionPrompt']) and not ACTION.search(shot['motionPrompt']): problems.append(f'shot {i} is camera movement over a still')
        if len(shot['narration'].split()) > math.ceil(shot['seconds'] * 2.5): problems.append(f'shot {i} narration cannot fit')
        if not shot.get('sound', '').strip(): notes.append(f'shot {i} has no localized sound cue')
        shot_words = words(shot['imagePrompt'] + ' ' + shot['motionPrompt'])
        if protagonist_words and not protagonist_words.intersection(shot_words):
            notes.append(f'shot {i} omits the named protagonist or focal object; inspect identity continuity')
        if setting_words and not setting_words.intersection(shot_words):
            notes.append(f'shot {i} omits the named setting; inspect location continuity')
    for field in ('imagePrompt','motionPrompt'):
        values = [' '.join(s[field].lower().split()) for s in shots]
        if len(values) != len(set(values)): problems.append(f'repeated {field}')
    if data.get('qualityChecks', {}).get('fieldsNeedingRepair'):
        notes.append('the story model repaired fields automatically; inspect those shots before render')
    if not data.get('sourceReview'):
        notes.append('generated stills and clips must be reviewed for continuity after generation')
    cached = list((Path('storage/any-local') / a.scenario.stem / 'motion').glob('shot-*-part-*.mp4'))
    clips = sum(math.ceil(s['seconds']/5) for s in shots)
    remaining = max(0, clips - len(cached))
    print(f'Story gate: {plan["title"]} | {len(shots)} shots | {seconds}s | {clips} motion clips ({remaining} uncached)')
    print(f'Estimated new motion time: about {math.ceil(remaining * 4.5)} minutes on this Mac, plus stills and finishing. Estimate varies with load.')
    for item in notes: print('REVIEW:', item)
    for item in problems: print('BLOCKED:', item)
    if problems: return 1
    print('Story structure passed. Review the actual generated frames before publishing.')
    return 0


if __name__ == '__main__': sys.exit(main())
