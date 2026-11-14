#!/usr/bin/env python3
"""Turn a filled Shorts template (templates/shorts/*.json) into a local-scenario JSON the Mac pipeline can render.

  python3 scripts/template_to_scenario.py guess-the-price --slot item="Gold-leaf wagyu hot dog" --slot price='$95' \
      --slot rarity_fact="Wagyu, truffle cream and caviar on one bun." --slot source="https://example.com/menu" --out drafts/generated/x.local-scenario.json

One shot per template beat, narration = the beat text, no model call. Prompts are role-based and carry the continuity clause so the
same hand, pan and slate appear in every shot. Validate with: node scripts/bb-local-scenario.mjs --validate FILE
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shorts_templates as T  # noqa: E402

CONTINUITY = 'Continuity: one chef, one white-gloved hand, same copper pan and black slate, warm tungsten light.'
STYLE = 'photoreal cinematic food film, warm tungsten hotel kitchen, close macro detail, shallow depth of field, rich natural texture'
# role -> (image direction, motion direction); {item} is filled from the template slots
VISUALS = {
    'hook': ('Macro hero close-up of {item} on a black slate beside a copper pan, steam rising', 'The camera slowly pushes in on {item} while steam drifts; a gloved hand enters and adjusts it slightly'),
    'clue': ('Close detail of the textures and ingredients of {item}, a white-gloved hand pointing with a small spoon', 'The camera glides along {item} as a gloved hand lifts a small spoon over it'),
    'countdown': ('{item} on the slate under warm light, a gloved hand hovering just above it', 'The gloved hand lowers toward {item} and pauses; steam curls upward'),
    'reveal': ('Wide hero shot of the finished {item} centred on a black slate, copper pan behind', 'The camera pulls back slowly to reveal {item} fully, light glinting on its surface'),
    'cta': ('A white-gloved hand presents {item} toward the camera on a black slate', 'The gloved hand slides {item} gently toward the camera and holds it still, inviting viewers to comment how close their guess was'),
    'why': ('A chef points to one visible detail of {item} on the black slate', 'The chef lifts {item} slightly and points to its surface in one continuous take'),
    'twist': ('A chef turns {item} on the black slate to reveal another side', 'The gloved hand turns {item} once, revealing its other side'),
    'third': ('The first featured dish, {item}, is set down on the black slate', 'A gloved hand places {item} on the slate and withdraws'),
    'second': ('The second featured dish, {item}, arrives beside the first', 'A gloved hand slides {item} beside the first dish'),
    'first': ('The final featured dish, {item}, completes the display', 'A gloved hand sets {item} beside the other dishes and reveals all three'),
    'item A': ('The first version of {item} is held above the slate', 'A gloved hand places the first version of {item} on the left of the slate'),
    'item B': ('The second version of {item} is held above the slate', 'A gloved hand places the second version of {item} on the right of the slate'),
    'option A': ('The first menu option, {item}, is presented on the slate', 'A gloved hand places {item} on the left of the slate'),
    'option B': ('The second menu option, {item}, is presented beside the first', 'A gloved hand places {item} in the center of the slate'),
    'option C': ('The third menu option, {item}, completes the display', 'A gloved hand places {item} on the right of the slate'),
    'step 1': ('A chef prepares {item} by hand before the final finish', 'The chef arranges one component of {item} by hand'),
    'step 2': ('A chef adds the next component to {item}', 'The chef adds one finishing component to {item}'),
    'result': ('The completed {item} is revealed on a black slate', 'A gloved hand lifts the finished {item} into the warm light'),
}
DEFAULT_VISUAL = ('Macro close-up of {item}, white-gloved hand, copper pan, black slate', 'The camera pushes in slowly on {item} while a gloved hand moves it slightly')


def build(template_id, slots, seconds=None, allow_repeat=False):
    templates = T.load_all()
    if template_id not in templates:
        raise ValueError(f'unknown template {template_id!r}; choose from {sorted(templates)}')
    slots = dict(slots)
    focal = slots.get('item') or slots.get('food') or slots.get('category') or slots.get('option_a') or 'the dish'
    defaults = {'twist': f'The chef turns {focal} to reveal another side.',
                'detail_a': 'one carefully finished surface', 'detail_b': 'one simpler finish',
                'step_1': f'First, the chef prepares {focal} by hand.',
                'step_2': f'Then the chef adds one defining detail to {focal}.',
                'result': f'The finished {focal} is revealed.'}
    for name, value in defaults.items():
        slots.setdefault(name, value)
    hook_line = slots.pop('hook_line', None)   # optional override of the spoken hook beat (scored with preflight-short.py)
    filled = T.fill(templates[template_id], slots, allow_repeat)
    if hook_line:
        for beat in filled['beats']:
            if beat['role'] == 'hook':
                beat['text'] = hook_line.strip()
        filled['hook'] = hook_line.strip()
        first, rest = filled['beats'][0], filled['beats'][1:]
        need = -(-len(hook_line.split()) * 2 // 5)   # ceil(words / 2.5 words per second), the story gate's limit
        extra = max(0, need - (first['end'] - first['start']))
        if extra and rest and rest[0]['end'] - rest[0]['start'] > extra + 2:   # borrow from the next beat, keep the runtime
            first['end'] += extra; rest[0]['start'] += extra
    item = str(focal).strip()
    shots = []
    for beat in filled['beats']:
        image, motion = VISUALS.get(beat['role'], DEFAULT_VISUAL)
        role_item = {'third': slots.get('item_1'), 'second': slots.get('item_2'), 'first': slots.get('item_3'),
                     'option A': slots.get('option_a'), 'option B': slots.get('option_b'), 'option C': slots.get('option_c')}.get(beat['role']) or item
        shots.append({
            'seconds': beat['end'] - beat['start'],
            'narration': beat['text'],
            'imagePrompt': f"{image.format(item=role_item)}. Visual style: {STYLE}. {CONTINUITY}"[:1000],
            'motionPrompt': f"{motion.format(item=role_item)}. One continuous take, no cuts."[:1000],
            'sound': 'soft kitchen ambience, gentle sizzle',
        })
    for shot in shots:   # keep narration speakable; a long hook may need longer than its template slot
        spoken = -(-len(shot['narration'].split()) * 2 // 5)
        shot['seconds'] = max(2, spoken)
    total = sum(s['seconds'] for s in shots)
    if seconds is not None and seconds != total:
        raise ValueError(f'--seconds {seconds} differs from the speech-fit shot total {total}; adjust the template narration instead')
    seconds = total
    others = [t for i, t in templates.items() if i != template_id]
    ideas = [{'title': f'{item}: {t["name"]}', 'angle': t['hook']['formula'].split('.')[0]} for t in others[:5]]
    while len(ideas) < 5:
        ideas.append({'title': f'{item}: {templates[template_id]["name"]} variant {len(ideas)}', 'angle': filled['hook']})
    claims = [f'{k} = {v} (source required before upload)' for k, v in slots.items() if T.is_price_slot(k)]
    claims += [f'source: {slots["source"]}'] if slots.get('source') else []
    visible_ending = f'A gloved hand presents {item} toward the camera on the same black slate.'
    shots[-1]['motionPrompt'] = f'The gloved hand presents {item} toward the camera on the same black slate. One continuous take, no cuts.'
    plan = {'ideas': ideas, 'title': f'{templates[template_id]["name"]}: {item}'[:200], 'hook': filled['hook'],
            'payoff': visible_ending, 'shots': shots, 'claimsToCheck': claims}
    return {'status': 'review-required', 'settings': {'brand': 'Billionaire Bites', 'format': 'short', 'seconds': seconds, 'voice': 'af_heart'},
            'model': 'template', 'topic': f'{templates[template_id]["name"]}: {item}', 'style': STYLE,
            'requestedEnding': visible_ending, 'totalSeconds': total, 'template': template_id, 'plan': plan}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('template'); parser.add_argument('--slot', action='append', default=[])
    parser.add_argument('--allow-repeat', action='store_true')
    parser.add_argument('--seconds', type=int); parser.add_argument('--out', required=True)
    args = parser.parse_args()
    try:
        scenario = build(args.template, dict(s.split('=', 1) for s in args.slot), args.seconds, args.allow_repeat)
    except (ValueError, KeyError) as error:
        sys.exit(f'Cannot build: {error}')
    Path(args.out).write_text(json.dumps(scenario, indent=2))
    print(f'Wrote {args.out}: {len(scenario["plan"]["shots"])} shots, {scenario["totalSeconds"]} s')


if __name__ == '__main__':
    main()
