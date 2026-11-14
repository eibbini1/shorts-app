#!/usr/bin/env python3
"""Show sourced 2026 recipe concepts; drafting remains an explicit local model step."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--id', help='Show one idea with its source and a draft command')
    args = p.parse_args()
    data = json.loads((ROOT / 'data/recipe-ideas-2026.json').read_text())
    print(data['ranking'])
    for number, idea in enumerate(data['ideas'], 1):
        if args.id and args.id != idea['id']:
            continue
        print(f"{number}. {idea['title']} [{idea['status']}] — {idea['id']}")
        print(f"   Signal: {idea['signal']}")
        print(f"   Hook: {idea['hook']} | format: {idea['format']} | set: {idea['set']}")
        print(f"   Source: {idea['sourceUrl']}")
    if args.id and not any(i['id'] == args.id for i in data['ideas']):
        p.error(f'Unknown idea id: {args.id}')


if __name__ == '__main__':
    main()
