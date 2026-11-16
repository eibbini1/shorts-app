#!/usr/bin/env python3
"""Browse sourced editorial food-series briefs without consuming GPU or API credits."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_series():
    return json.loads((ROOT / 'data/food-series.json').read_text())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--id', help='Show one series in detail')
    p.add_argument('--json', action='store_true', help='Print machine-readable data')
    args = p.parse_args()
    data = load_series()
    matches = [s for s in data['series'] if not args.id or s['id'] == args.id]
    if not matches:
        p.error(f'Unknown series id: {args.id}')
    if args.json:
        print(json.dumps(matches, indent=2))
        return
    print(data['method'])
    print(data['channelData'])
    for i, series in enumerate(matches, 1):
        print(f"\n{i}. {series['name']} [{series['id']}] — {series['format']}")
        print(f"   Hook: {series['hookPattern']}")
        print(f"   Story: {series['storyRule']}")
        print(f"   Picture: {series['visualRule']}")
        print(f"   Sound: {series['soundRule']}")
        for episode in series['episodes']:
            print(f"   • {episode['title']} [{episode['status']}]")
            if episode.get('scenario'):
                print(f"     Scenario: {episode['scenario']}")


if __name__ == '__main__':
    main()
