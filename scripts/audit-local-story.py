#!/usr/bin/env python3
"""Fast editorial gate before spending time on FLUX or LTX."""
import argparse
import json
import math
import re
import sys
from pathlib import Path
from presentation_mode import choose as choose_presentation

STOP = {'the','and','with','from','into','that','this','one','same','scene','shot','film','video','warm','cinematic','real','local'}
ACTION = re.compile(r'\b(place|drop|sear|bast|pour|squeeze|lift|lower|slide|sets|arrange|rotate|cut|slice|bite|stir|chop|melt|sizzle|open|close|pull|push|run|walk|jump|turn|catch|serve|mix|roll|spin|crack|break|assemble|brown|cook|garnish|add|present|adjust|smash|press|toast|stack)\w*\b', re.I)
CAMERA_ONLY = re.compile(r'^(?:the )?camera (?:slowly )?(?:pan|tilt|zoom|track)', re.I)


def physical_action(motion):
    """Editing instructions such as 'no cuts' are not food or character actions."""
    action_text = re.sub(r'\b(?:no|without) (?:internal )?cuts?\b', '', motion, flags=re.I)
    return bool(ACTION.search(action_text))


def words(value):
    return {w for w in re.findall(r'[a-z]{4,}', str(value).lower()) if w not in STOP}


def concepts(value):
    """A small culinary vocabulary for comparing concrete brief actions to prompts."""
    normal = {}
    for word in words(value):
        if word.startswith(('tear', 'torn', 'pull')): word = 'tear'
        elif word.startswith(('sizzl', 'bubbl', 'foam', 'hiss')): word = 'sizzle'
        elif word.startswith(('crisp', 'crunch', 'crust', 'blister')): word = 'crisp'
        elif word.startswith(('melt', 'stretch', 'strand')): word = 'melt'
        elif word.startswith(('pour', 'drizzl', 'stream')): word = 'pour'
        normal[word] = True
    return set(normal)


def creative_brief_problems(data):
    """Check that a drafted shot plan actually uses the viewer's concrete directions."""
    brief = data.get('creativeBrief') or {}
    if not brief:
        return []
    shots = data['plan']['shots']
    problems = []
    hook_words = concepts(brief.get('hookImage', ''))
    if hook_words:
        opening = concepts(shots[0]['imagePrompt'] + ' ' + shots[0]['motionPrompt'])
        if len(hook_words & opening) < min(2, len(hook_words)):
            problems.append('first shot does not depict the requested visual hook')
    action_words = concepts(brief.get('mustShow', ''))
    if action_words:
        motions = concepts(' '.join(shot['motionPrompt'] for shot in shots))
        if len(action_words & motions) < min(2, len(action_words)):
            problems.append('no moving shot depicts the required physical action')
    return problems


def recipe_sequence_problems(data):
    """Check structured ingredient order before model work; visual truth still needs review."""
    sequence = data.get('recipeSequence')
    if sequence is None:
        return []
    shots = data['plan']['shots']
    if len(sequence) != len(shots):
        return ['recipeSequence must have one entry per shot']
    problems = []
    phases = [step.get('phase') for step in sequence]
    if phases[0] != 'teaser' or phases[-1] != 'serve':
        problems.append('recipe sequence must open with a finished-food teaser and end with serving')
    if 'bake' not in phases:
        problems.append('recipe sequence needs an explicit cooking-time cut')
    order = {'teaser': 0, 'prep': 1, 'bake': 2, 'serve': 3}
    if any(phase not in order for phase in phases) or any(order[a] > order[b] for a, b in zip(phases, phases[1:])):
        problems.append('recipe sequence phases must progress from teaser through prep and bake to serving')
    vessel = sequence[0].get('vessel')
    if not vessel or any(step.get('vessel') != vessel for step in sequence):
        problems.append('recipe sequence changes or omits the hero vessel')
    for number, (shot, step) in enumerate(zip(shots, sequence), 1):
        prompt = (shot.get('imagePrompt', '') + ' ' + shot.get('motionPrompt', '')).lower()
        for item in step.get('adds', []):
            if str(item).lower() not in prompt:
                problems.append(f'shot {number} does not visibly add {item}')
    return problems


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('scenario', type=Path)
    a = p.parse_args()
    data = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    presentation = choose_presentation(data)
    shots = plan['shots']
    problems, notes = [], []
    problems.extend(creative_brief_problems(data))
    problems.extend(recipe_sequence_problems(data))
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
        if not physical_action(shot['motionPrompt']): problems.append(f'shot {i} has no recognizable physical action')
        if CAMERA_ONLY.search(shot['motionPrompt']) and not physical_action(shot['motionPrompt']): problems.append(f'shot {i} is camera movement over a still')
        if presentation['voice'] and len(shot['narration'].split()) > math.ceil(shot['seconds'] * 2.5):
            problems.append(f'shot {i} narration cannot fit')
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
    print(f'Story gate: {plan["title"]} | {len(shots)} shots | {seconds}s | {clips} motion clips')
    print(f'Potential new motion time: up to about {math.ceil(clips * 4.5)} minutes on this Mac, plus stills and finishing. '
          f'{len(cached)} prior clip files may be reused only if prompt and reference hashes still match.')
    for item in notes: print('REVIEW:', item)
    for item in problems: print('BLOCKED:', item)
    if problems: return 1
    print('Story structure passed. Review the actual generated frames before publishing.')
    return 0


if __name__ == '__main__': sys.exit(main())
