#!/usr/bin/env python3
"""Turn a fresh Google Trends snapshot into evidence-backed, niche-matched video briefs.

Examples:
  python3 scripts/trend-brief.py --region US --niche 'food cooking'
  python3 scripts/trend-brief.py --snapshot storage/trends/us.json --niche 'luxury food'
Never labels an unrelated or stale item as a current niche trend.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    'food': {'food', 'cooking', 'recipe', 'chef', 'chocolate', 'pizza', 'steak', 'burger', 'dessert', 'baking', 'restaurant'},
    'cars': {'car', 'cars', 'auto', 'automotive', 'racing', 'race', 'vehicle', 'vehicles'},
    'animation': {'animation', 'animated', 'cartoon', 'character', 'anime'},
}
STOP = {'the', 'and', 'for', 'with', 'video', 'short', 'shorts', 'about', 'latest', 'trend', 'trending'}


def words(text):
    return set(re.findall(r'[a-z0-9]+', text.lower())) - STOP


def niche_words(niche):
    tokens = words(niche)
    expanded = set(tokens)
    for group in GROUPS.values():
        if tokens & group: expanded |= group
    return expanded


def select(snapshot, niche, max_age_hours, now=None):
    now = now or datetime.now(timezone.utc)
    fetched = datetime.fromisoformat(snapshot['fetchedAt'].replace('Z', '+00:00'))
    age = (now - fetched).total_seconds() / 3600
    if age < -0.25 or age > max_age_hours:
        raise ValueError(f'Trend snapshot is {age:.1f} hours old; refresh it before claiming a current trend.')
    target = niche_words(niche)
    matches = []
    for item in snapshot.get('items', []):
        title = item.get('title', '').strip()
        overlap = words(title) & target
        if overlap:
            matches.append({'trend': title, 'matchedWords': sorted(overlap),
                            'publishedAt': item.get('publishedAt'), 'approxTraffic': item.get('approxTraffic'),
                            'sourceUrl': snapshot.get('sourceUrl'),
                            'storyPrompt': (f'Create an original 30-second {niche} video prompted by the search topic "{title}". '
                                            'Use one consistent subject and six moving story beats: visual hook, goal, obstacle, new plan, action, payoff. '
                                            'Give each shot a distinct physical action, one continuous camera move, a precise sound cue, and a connected ending. '
                                            'Do not assert the topic is trending on a video platform or invent facts; verify claims before publishing.')})
    return sorted(matches, key=lambda item: (-len(item['matchedWords']), item['trend']))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--region', default='US')
    p.add_argument('--niche', required=True)
    p.add_argument('--snapshot', type=Path, help='Use a saved snapshot instead of fetching the live feed')
    p.add_argument('--max-age-hours', type=float, default=24)
    p.add_argument('--output', type=Path, help='Save the brief as JSON')
    a = p.parse_args()
    if a.max_age_hours <= 0: p.error('--max-age-hours must be positive')
    if a.snapshot:
        data = json.loads(a.snapshot.read_text())
    else:
        raw = subprocess.check_output([sys.executable, str(ROOT / 'scripts/fetch-trends.py'), '--region', a.region], text=True)
        data = json.loads(raw)
    try: matches = select(data, a.niche, a.max_age_hours)
    except (KeyError, ValueError) as error: p.error(str(error))
    brief = {'niche': a.niche, 'region': data.get('region'), 'fetchedAt': data['fetchedAt'],
             'sourceUrl': data.get('sourceUrl'), 'matches': matches[:10],
             'note': 'These are keyword matches to a Google search-trend feed, not verified TikTok or YouTube video trends. Check the subject and date before producing.'}
    if a.output:
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(json.dumps(brief, indent=2)+'\n')
    print(json.dumps(brief, indent=2))
    if not matches: print('No verified niche match in this snapshot. Choose an evergreen idea or research another source; do not claim it is trending.', file=sys.stderr)


if __name__ == '__main__': main()
