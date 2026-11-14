#!/usr/bin/env python3
"""Template library for Shorts formats (templates/shorts/*.json): list, pick for a topic, fill with slots.

  python3 scripts/shorts_templates.py list
  python3 scripts/shorts_templates.py pick "Gold wagyu burger vs normal burger"
  python3 scripts/shorts_templates.py fill same-item-two-prices --slot item="A5 wagyu" --slot price_a='$120' ... [--log] [--allow-repeat]

Filling enforces: every slot given, every price in US dollars (price_*, low_price, high_price start with $), and the same item is
not used twice (episodes/template-log.jsonl), because YouTube's July 2025 policy targets repetitious content.
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'templates/shorts'
LOG = ROOT / 'episodes/template-log.jsonl'
REQUIRED = ('id', 'name', 'evidence', 'lengthSeconds', 'hook', 'slots', 'beats', 'captions', 'cta', 'loopBack', 'rules')
OPTIONAL_SLOTS = {'detail_a', 'detail_b', 'twist', 'step_1', 'step_2', 'result'}
KEYWORDS = {'same-item-two-prices': ('vs', 'versus', 'cheap', 'normal', 'regular', 'same'), 'would-you-rather-menu': ('menu', 'pick', 'choose', 'rather'),
            'guess-the-price': ('guess', 'price', 'cost', 'worth'), 'banned-foods': ('banned', 'illegal', 'forbidden', 'outlawed'),
            'countdown': ('top', 'three', 'ranking', 'countdown', 'most expensive'), 'process-reveal': ('made', 'how', 'process', 'takes', 'years')}


def load_all():
    templates = {}
    for path in sorted(DIR.glob('*.json')):
        template = json.loads(path.read_text())
        problems = validate(template)
        if problems:
            raise ValueError(f'{path.name}: {"; ".join(problems)}')
        templates[template['id']] = template
    return templates


def validate(template):
    problems = [f'missing {k}' for k in REQUIRED if k not in template]
    if problems:
        return problems
    length, beats = template['lengthSeconds'], template['beats']
    if beats[0]['start'] != 0:
        problems.append('first beat must start at 0')
    if any(b['end'] <= b['start'] for b in beats) or any(a['end'] != b['start'] for a, b in zip(beats, beats[1:])):
        problems.append('beats must be continuous and positive')
    if not length[0] - 2 <= beats[-1]['end'] <= length[1] + 2:
        problems.append(f'beats end at {beats[-1]["end"]} s, outside {length}')
    used = set(re.findall(r'\{(\w+)\}', json.dumps(beats) + template['cta'] + template['hook']['formula'] + template['loopBack']))
    undeclared = used - set(template['slots']) - OPTIONAL_SLOTS
    if undeclared:
        problems.append(f'undeclared slots {sorted(undeclared)}')
    return problems


def pick(topic, templates):
    text = topic.lower()
    scored = sorted(((sum(k in text for k in KEYWORDS.get(i, ())), i) for i in templates), reverse=True)
    return [i for s, i in scored if s > 0][:3] or ['guess-the-price']


def is_price_slot(name):
    return name.startswith('price') or name in ('low_price', 'high_price')


def fill(template, slots, allow_repeat=False):
    missing = [s for s in template['slots'] if s not in slots]
    if missing:
        raise ValueError(f'missing slots {missing}')
    for name in template['slots']:
        if is_price_slot(name) and not re.match(r'^\$\s?\d', slots[name]):
            raise ValueError(f'{name}={slots[name]!r}: prices must be in US dollars, for example $120')
    item = (slots.get('item') or slots.get('food') or slots.get('category') or slots.get('option_a') or '').strip().lower()
    if item and not allow_repeat and LOG.is_file():
        for line in LOG.read_text().splitlines():
            if json.loads(line)['item'] == item:
                raise ValueError(f'item {item!r} was already used ({json.loads(line)["template"]}); pick a new item or pass --allow-repeat')
    text = lambda s: re.sub(r'\{(\w+)\}', lambda m: slots.get(m.group(1), '{' + m.group(1) + '}'), s)
    return {'template': template['id'], 'item': item, 'hook': text(template['hook']['formula']),
            'beats': [{**b, 'text': text(b['text'])} for b in template['beats']], 'cta': text(template['cta']), 'loopBack': text(template['loopBack']),
            'captions': template['captions'], 'rules': template['rules']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    p = sub.add_parser('pick'); p.add_argument('topic')
    f = sub.add_parser('fill'); f.add_argument('id'); f.add_argument('--slot', action='append', default=[])
    f.add_argument('--log', action='store_true'); f.add_argument('--allow-repeat', action='store_true')
    args = parser.parse_args()
    templates = load_all()
    if args.cmd == 'list':
        for t in templates.values():
            print(f'{t["id"]:24} {t["lengthSeconds"][0]}-{t["lengthSeconds"][1]} s  slots {len(t["slots"])}  evidence: {t["evidence"].split(":")[0]}')
    elif args.cmd == 'pick':
        print('\n'.join(pick(args.topic, templates)))
    else:
        slots = dict(s.split('=', 1) for s in args.slot)
        try:
            result = fill(templates[args.id], slots, args.allow_repeat)
        except (KeyError, ValueError) as error:
            sys.exit(f'Cannot fill: {error}')
        if args.log:
            with LOG.open('a') as log:
                log.write(json.dumps({'date': str(date.today()), 'template': args.id, 'item': result['item']}) + '\n')
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
