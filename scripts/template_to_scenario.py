#!/usr/bin/env python3
"""Turn a filled Shorts template (templates/shorts/*.json) into a local-scenario JSON the Mac pipeline can render.

  python3 scripts/template_to_scenario.py guess-the-price --slot item="Gold-leaf wagyu hot dog" --slot price='$95' \
      --slot rarity_fact="Wagyu, truffle cream and caviar on one bun." --slot source="https://example.com/menu" --out drafts/generated/x.local-scenario.json

One shot per template beat, narration = the beat text. A single local Ollama pass refines visuals and sound by default;
--offline-template uses deterministic prompts for troubleshooting. Validate with: node scripts/bb-local-scenario.mjs --validate FILE
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shorts_templates as T  # noqa: E402

CONTINUITY = 'Continuity: keep the same dish, serving surface, tools, hands and lighting across shots unless a visible action changes them.'
STYLE = 'photoreal cinematic food film, warm tungsten hotel kitchen, close macro detail, shallow depth of field, rich natural texture'
DEFAULT_SETS = {
    'guess-the-price': ('dark restaurant pass', 'black slate', 'copper pan', 'white-gloved hand'),
    'process-reveal': ('sunlit home kitchen', 'walnut board', 'cast-iron pan', 'bare hand'),
    'countdown': ('bright tasting counter', 'cream stone counter', 'steel pan', 'chef hand'),
    'same-item-two-prices': ('warm hotel service kitchen', 'marble service counter', 'steel pan', 'chef hand'),
    'would-you-rather-menu': ('modern restaurant table', 'ceramic serving board', 'steel pan', 'chef hand'),
    'banned-foods': ('food-history studio kitchen', 'wooden display board', 'steel pan', 'chef hand'),
}
FORMAT_FAMILY = {
    'guess-the-price': 'guess-the-price', 'process-reveal': 'food-process-story',
    'countdown': 'food-process-story', 'same-item-two-prices': 'ingredient-basket-level-up',
    'would-you-rather-menu': 'guess-the-price', 'banned-foods': 'food-process-story',
}
# role -> (image direction, motion direction); {item} is filled from the template slots
VISUALS = {
    'hook': ('Macro hero close-up of {item} on a black slate beside a copper pan, steam rising', 'The camera slowly pushes in on {item} while steam drifts; a gloved hand enters and adjusts it slightly'),
    'clue': ('Close detail of the textures and ingredients of {item}, a white-gloved hand pointing with a small spoon', 'The camera glides along {item} as a gloved hand lifts a small spoon over it'),
    'countdown': ('{item} on the slate under warm light, a gloved hand hovering just above it', 'The gloved hand lowers toward {item} and pauses; steam curls upward'),
    'reveal': ('Wide hero shot of the finished {item} centred on a black slate, copper pan behind', 'A hand rotates the serving surface a quarter turn to reveal {item} fully as the camera pulls back slightly'),
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
    default_set, default_surface, default_pan, default_hand = DEFAULT_SETS[template_id]
    setting = slots.pop('visual_set', default_set).strip()
    surface = slots.pop('surface', default_surface).strip()
    pan = slots.pop('pan', default_pan).strip()
    hand = slots.pop('hand', default_hand).strip()
    visual_style = slots.pop('visual_style', STYLE).strip()
    if not all((setting, surface, pan, hand, visual_style)):
        raise ValueError('visual set, surface, pan, hand and style must be nonempty')
    def contextualize(text):
        text = re.sub(r'\b(?:white-)?gloved hand\b', hand, text)
        text = re.sub(r'\b(?:black )?slate\b', surface, text)
        return text.replace('copper pan', pan)
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
        image_text = contextualize(image.format(item=role_item))
        motion_text = contextualize(motion.format(item=role_item))
        sound = ('soft plate tap' if any(word in motion_text.lower() for word in ('places', 'sets', 'slides', 'presents'))
                 else 'quiet kitchen room tone')
        shots.append({
            'seconds': beat['end'] - beat['start'],
            'narration': beat['text'],
            'imagePrompt': f"{image_text}. Set: {setting}. Visual style: {visual_style}. {CONTINUITY}"[:1000],
            'motionPrompt': f"{motion_text}. One continuous take, no cuts."[:1000],
            'sound': sound,
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
    visible_ending = f'A {hand} presents {item} toward the camera on the same {surface}.'
    shots[-1]['motionPrompt'] = f'The {hand} presents {item} toward the camera on the same {surface}. One continuous take, no cuts.'
    plan = {'ideas': ideas, 'title': f'{templates[template_id]["name"]}: {item}'[:200], 'hook': filled['hook'],
            'payoff': visible_ending, 'shots': shots, 'claimsToCheck': claims}
    return {'status': 'review-required', 'settings': {'brand': 'Billionaire Bites', 'format': 'short', 'seconds': seconds, 'voice': 'af_heart'},
            'model': 'template', 'topic': f'{templates[template_id]["name"]}: {item}', 'style': visual_style,
            'templateItem': item,
            'storyArc': {'protagonist': item, 'setting': setting,
                         'visualBible': f'{item}; {setting}; {surface}; {pan}; {hand}; {visual_style}'},
            'creativeSignature': {'format': FORMAT_FAMILY[template_id], 'set': setting, 'hookPattern': template_id},
            'requestedEnding': visible_ending, 'totalSeconds': total, 'template': template_id, 'plan': plan}


def refine_with_ollama(scenario, model='qwen3:8b'):
    """One local model pass to vary physical shots; preserve fixed template facts and timing."""
    if model.endswith(':cloud'):
        raise ValueError('template refinement requires an installed local Ollama model')
    shots = scenario['plan']['shots']
    count = len(shots)
    shape = {'type': 'object', 'properties': {'shots': {'type': 'array', 'minItems': count,
             'maxItems': count, 'items': {'type': 'object', 'properties': {
                 'imagePrompt': {'type': 'string'}, 'motionPrompt': {'type': 'string'},
                 'sound': {'type': 'string'}},
                 'required': ['imagePrompt', 'motionPrompt', 'sound'], 'additionalProperties': False}}},
             'required': ['shots'], 'additionalProperties': False}
    fixed = [{'shot': i + 1, 'seconds': shot['seconds'], 'narration': shot['narration'],
              'startingImage': shot['imagePrompt'], 'startingMotion': shot['motionPrompt']}
             for i, shot in enumerate(shots)]
    system = ('You are a food-film director improving one template into a coherent local video. '
              'Return exactly one visual shot plan per supplied shot, in the same order. '
              'Keep the exact dish, ingredient identity, kitchen set, serving surface, hand and tools continuous. '
              'Each image is the beginning of a distinct physical action, each motion is one continuous take '
              'with a visible changed end state, and each sound is caused by that visible action. '
              'Vary shot scale and camera motivation without inventing a new dish, extra hands, floating tools, '
              'magic cooking, unsupported prices, facts, a different ending or a second location. '
              'Do not rewrite narration, timing, titles, claims or price text. Output JSON only.')
    payload = {'title': scenario['plan']['title'], 'hook': scenario['plan']['hook'],
               'payoff': scenario['plan']['payoff'], 'setting': scenario['creativeSignature']['set'],
               'shots': fixed}
    body = {'model': model, 'stream': False, 'think': False, 'format': shape,
            'options': {'temperature': 0.25, 'num_predict': 3200, 'num_ctx': 8192},
            'messages': [{'role': 'system', 'content': system},
                         {'role': 'user', 'content': json.dumps(payload)}]}
    request = urllib.request.Request('http://127.0.0.1:11434/api/chat',
                                     data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=240) as response:
        raw = json.loads(response.read())['message']['content']
    revised = json.loads(raw[raw.find('{'):raw.rfind('}') + 1])['shots']
    if len(revised) != count:
        raise ValueError(f'local model returned {len(revised)} shots; expected {count}')
    for i, row in enumerate(revised):
        for field in ('imagePrompt', 'motionPrompt', 'sound'):
            if not isinstance(row.get(field), str) or not 12 <= len(row[field].strip()) <= 1000:
                raise ValueError(f'local model returned an invalid {field} for shot {i + 1}')
        if re.search(r'\b(cut to|quick cut|montage|transition to)\b', row['motionPrompt'], re.I):
            raise ValueError(f'local model put an edit inside shot {i + 1}')
    if len({re.sub(r'\s+', ' ', row['motionPrompt']).lower() for row in revised}) != count:
        raise ValueError('local model repeated a motion prompt')
    anchor = f"Same {scenario['templateItem']} in {scenario['creativeSignature']['set']}. "
    if len(anchor) >= 1000:
        raise ValueError('template dish and set are too long for a shot prompt')
    for shot, row in zip(shots, revised):
        shot['imagePrompt'] = (anchor + row['imagePrompt'].strip())[:1000]
        shot['motionPrompt'] = row['motionPrompt'].strip()
        shot['sound'] = row['sound'].strip()
    scenario['model'] = f'template+ollama/{model}'
    scenario['templateRefinement'] = {'model': model, 'shotCount': count,
                                      'fixedNarrationAndTiming': True,
                                      'reviewRequired': 'Run story, evidence, sound and frame gates; local model text is not visual proof.'}
    return scenario


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('template'); parser.add_argument('--slot', action='append', default=[])
    parser.add_argument('--allow-repeat', action='store_true')
    parser.add_argument('--seconds', type=int); parser.add_argument('--out', required=True)
    parser.set_defaults(smart=True)
    parser.add_argument('--smart', action='store_true', help='Refine shot visuals and sound with installed local Ollama (default)')
    parser.add_argument('--offline-template', dest='smart', action='store_false', help='Use deterministic prompts without a model call')
    parser.add_argument('--model', default='qwen3:8b', help='Installed local Ollama model for --smart')
    args = parser.parse_args()
    try:
        scenario = build(args.template, dict(s.split('=', 1) for s in args.slot), args.seconds, args.allow_repeat)
        if args.smart:
            scenario = refine_with_ollama(scenario, args.model)
    except (ValueError, KeyError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        sys.exit(f'Cannot build locally: {error}. Check Ollama and the selected model; --smart never calls a paid API.')
    Path(args.out).write_text(json.dumps(scenario, indent=2))
    print(f'Wrote {args.out}: {len(scenario["plan"]["shots"])} shots, {scenario["totalSeconds"]} s')


if __name__ == '__main__':
    main()
