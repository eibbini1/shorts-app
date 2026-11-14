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
    'cta': ('A white-gloved hand presents {item} toward the camera on a black slate', 'The gloved hand slides {item} gently toward the camera and holds it still'),
}
DEFAULT_VISUAL = ('Macro close-up of {item}, white-gloved hand, copper pan, black slate', 'The camera pushes in slowly on {item} while a gloved hand moves it slightly')


def build(template_id, slots, seconds=None, allow_repeat=True):
    templates = T.load_all()
    if template_id not in templates:
        raise ValueError(f'unknown template {template_id!r}; choose from {sorted(templates)}')
    filled = T.fill(templates[template_id], slots, allow_repeat)
    item = (slots.get('item') or slots.get('food') or slots.get('category') or slots.get('option_a') or 'the dish').strip()
    shots = []
    for beat in filled['beats']:
        if '{' in beat['text']:   # an optional slot was not given: drop the beat, keep the runtime by lengthening the previous shot
            if shots:
                shots[-1]['seconds'] += beat['end'] - beat['start']
            continue
        image, motion = VISUALS.get(beat['role'], DEFAULT_VISUAL)
        shots.append({
            'seconds': beat['end'] - beat['start'],
            'narration': beat['text'],
            'imagePrompt': f"{image.format(item=item)}. Visual style: {STYLE}. {CONTINUITY}"[:1000],
            'motionPrompt': f"{motion.format(item=item)}. One continuous take, no cuts."[:1000],
            'sound': 'soft kitchen ambience, gentle sizzle',
        })
    total = sum(s['seconds'] for s in shots)
    seconds = seconds or max(10, total)
    others = [t for i, t in templates.items() if i != template_id]
    ideas = [{'title': f'{item}: {t["name"]}', 'angle': t['hook']['formula'].split('.')[0]} for t in others[:5]]
    while len(ideas) < 5:
        ideas.append({'title': f'{item}: {templates[template_id]["name"]} variant {len(ideas)}', 'angle': filled['hook']})
    claims = [f'{k} = {v} (source required before upload)' for k, v in slots.items() if T.is_price_slot(k)]
    claims += [f'source: {slots["source"]}'] if slots.get('source') else []
    plan = {'ideas': ideas, 'title': f'{templates[template_id]["name"]}: {item}'[:200], 'hook': filled['hook'],
            'payoff': filled['cta'], 'shots': shots, 'claimsToCheck': claims}
    return {'status': 'review-required', 'settings': {'brand': 'Billionaire Bites', 'format': 'short', 'seconds': seconds, 'voice': 'af_heart'},
            'model': 'template', 'topic': f'{templates[template_id]["name"]}: {item}', 'style': STYLE,
            'requestedEnding': filled['cta'], 'totalSeconds': total, 'template': template_id, 'plan': plan}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('template'); parser.add_argument('--slot', action='append', default=[])
    parser.add_argument('--seconds', type=int); parser.add_argument('--out', required=True)
    args = parser.parse_args()
    try:
        scenario = build(args.template, dict(s.split('=', 1) for s in args.slot), args.seconds)
    except (ValueError, KeyError) as error:
        sys.exit(f'Cannot build: {error}')
    Path(args.out).write_text(json.dumps(scenario, indent=2))
    print(f'Wrote {args.out}: {len(scenario["plan"]["shots"])} shots, {scenario["totalSeconds"]} s')


if __name__ == '__main__':
    main()
