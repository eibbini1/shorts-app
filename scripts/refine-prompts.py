#!/usr/bin/env python3
"""Rewrite a scenario's shot prompts into the master format the local models were documented to read best.

FLUX.2 Klein (docs.bfl.ai prompting guide, checked 2026-11-16): no prompt upsampling, no negative prompts,
subject and action first, then setting, details, lighting (source, quality, direction, warmth), atmosphere,
and optional "Style:" / "Mood:" notes at the end.
LTX (docs.ltx.io prompting guide, checked 2026-11-16): one present-tense paragraph of about 4-8 sentences,
each with an action verb, camera movement described relative to the subject, one continuous take from a
first-frame image, and a sound line.

The refiner never invents food, actions or story. It keeps every positive sentence the writer gave, removes
negative clauses (which these models do not use as exclusions), and fills only what is missing from the
studio preset: set, lighting, lens, camera move and mood. Run scripts/prompt-lint.py on the result.

  python3 scripts/refine-prompts.py SCENARIO.json [--studio luxury-kitchen] [--output OUT.json | --in-place]
"""
import argparse
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prompt_lint', ROOT / 'scripts/prompt-lint.py')
lint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lint)

NEG_CLAUSE = re.compile(r'(?:^|(?<=[.;,]))\s*(?:and\s+)?(?:no|not|without|never|avoid)\b[^.;,]*[.;,]?', re.I)


def sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text.strip()) if s.strip()]


def strip_negations(text):
    kept = []
    for sentence in sentences(text):
        cleaned = NEG_CLAUSE.sub(' ', sentence)
        cleaned = re.sub(r'\s+([,.;])', r'\1', re.sub(r'\s{2,}', ' ', cleaned)).strip(' ,;')
        if lint.words(cleaned) >= 3:
            kept.append(cleaned if cleaned.endswith(('.', '!', '?')) else cleaned + '.')
    return ' '.join(kept)


def lighting_parts(text):
    return [name for name, rx in lint.LIGHT_PARTS.items() if rx.search(text)]



def bounded_prompt(text, limit=1000):
    parts = sentences(text)
    while len(' '.join(parts)) > limit and len(parts) > 1:
        parts.pop()
    result = ' '.join(parts)
    if len(result) > limit:
        raise ValueError('The main shot sentence exceeds the schema limit; shorten it before refinement.')
    return result

def refine_image(prompt, studio):
    text = strip_negations(prompt)
    extra = []
    set_words = re.findall(r'[a-z]{5,}', studio.get('set', '').lower())
    if sum(w in text.lower() for w in set(set_words)) < 3 and studio.get('set'):
        extra.append('The setting is ' + studio['set'].rstrip('.')[0].lower() + studio['set'].rstrip('.')[1:] + '.')
    if len(lighting_parts(text)) < 2 and studio.get('lighting'):
        extra.append(studio['lighting'].rstrip('.') + '.')
    if not lint.LENS.search(text) and studio.get('camera'):
        extra.append(studio['camera'].rstrip('.') + '.')
    tail = []
    if studio.get('style') and 'Style:' not in text:
        tail.append(f"Style: {studio['style'].rstrip('.')}.")
    if studio.get('mood') and 'Mood:' not in text:
        tail.append(f"Mood: {studio['mood'].rstrip('.')}.")
    return bounded_prompt(' '.join([text] + extra + tail))


def refine_motion(prompt, studio):
    text = strip_negations(prompt)
    extra = []
    if not (lint.CAMERA.search(text) or re.search(r'\bcamera\b', text, re.I)) and studio.get('cameraMove'):
        extra.append(studio['cameraMove'].rstrip('.') + '.')
    if not re.search(r'continuous (?:take|motion)|one take', text, re.I):
        extra.append('Everything happens in one continuous take.')
    return bounded_prompt(' '.join([text] + extra))


FRAME_HINTS = (('oven', r'\b(?:in|into|out of|from) the (?:\w+ )?oven\b|\boven (?:door|rack)\b|\bopen (?:\w+ )?oven\b'),
               ('pan', r'\b(?:in|into) the (?:\w+ )?(?:skillet|pan|saucepan)\b|\b(?:stove|hob|sizzl\w*|sear\w*)\b'))


def pick_frame(shot, frames):
    """Kitchen plate for this shot: oven, pan or prep, from what the shot shows."""
    text = shot['imagePrompt'] + ' ' + shot['motionPrompt']
    for name, pattern in FRAME_HINTS:
        if name in frames and re.search(pattern, text, re.I):
            return name
    return 'prep' if 'prep' in frames else None


def refine(data, studio):
    changes = []
    frames = studio.get('referenceFrames') or {}
    for number, shot in enumerate(data['plan']['shots'], 1):
        if frames and not shot.get('studioFrame') and pick_frame(shot, frames):
            shot['studioFrame'] = pick_frame(shot, frames)
            changes.append({'shot': number, 'field': 'studioFrame', 'before': None, 'after': shot['studioFrame']})
        for key, fn in (('imagePrompt', refine_image), ('motionPrompt', refine_motion)):
            new = fn(shot[key], studio)
            if new != shot[key]:
                changes.append({'shot': number, 'field': key, 'before': shot[key], 'after': new})
                shot[key] = new
    return changes


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('scenario', type=Path)
    p.add_argument('--studio', help='data/studios/ID.json (default: the scenario\'s "studio" field)')
    out = p.add_mutually_exclusive_group()
    out.add_argument('--output', type=Path)
    out.add_argument('--in-place', action='store_true')
    args = p.parse_args()
    data = json.loads(args.scenario.read_text(encoding='utf-8-sig'))
    studio_id = args.studio or data.get('studio')
    studio = {}
    if studio_id:
        path = ROOT / 'data/studios' / f'{studio_id}.json'
        if not re.fullmatch(r'[a-z0-9-]+', studio_id) or not path.is_file():
            p.error(f'Unknown studio: {studio_id}')
        studio = json.loads(path.read_text())
        data['studio'] = studio_id
    before = lint.lint(str(args.scenario))
    changes = refine(data, studio)
    target = args.scenario if args.in_place else (args.output or args.scenario.with_name(
        args.scenario.name.replace('.local-scenario.json', '.refined.local-scenario.json')))
    data['promptRefinement'] = {'tool': 'scripts/refine-prompts.py', 'studio': studio_id,
                                'changedFields': len(changes),
                                'note': 'Negative clauses removed; missing set, lighting, lens, camera move and mood '
                                        'filled from the studio. Food, actions and story are the writer\'s.'}
    target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    after = lint.lint(str(target))
    print(f'Refined {len(changes)} prompt fields -> {target}')
    print(f"Prompt score {before['prompt_avg']} -> {after['prompt_avg']}; overall {before['overall']} -> {after['overall']}"
          f" (story {after['story']}: story notes are for the writer, not the refiner)")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
