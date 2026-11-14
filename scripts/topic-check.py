#!/usr/bin/env python3
"""Warn when a new Short repeats a topic the channel already published or scheduled.

  python3 scripts/topic-check.py "Would you pay $5 million for one melon?"

Compares content words against episodes/channel-performance.json. Needs 2 shared subject words (1 when a title has only one). Exit 1 when a close match exists (override with --allow).
Words that name the format ("worth", "pay", "guess", "price", "would") are ignored so only the subject is compared.
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'episodes' / 'channel-performance.json'
FORMAT_WORDS = set('would you pay worth it guess the price of this that for and with from costs cost sold one two million thousand dollars yen who why what how which more most world worlds same cut and are is a an to in on your only can'.split())
DISH_FORMS = {
    'hot dog': r'\bhot[ -]?dogs?\b|\bfrankfurters?\b',
    'burger': r'\bburgers?\b', 'steak': r'\bsteaks?\b', 'pizza': r'\bpizzas?\b',
    'cupcake': r'\bcupcakes?\b', 'coffee': r'\bcoffee\b', 'scallop': r'\bscallops?\b',
    'ice cream': r'\bice[ -]?cream\b', 'melon': r'\bmelons?\b',
}


def dish_forms(text):
    return {name for name, pattern in DISH_FORMS.items() if re.search(pattern, text, re.I)}


def subject(text):
    words = re.findall(r"[a-z]{3,}", text.lower())
    stems = {w[:-1] if w.endswith('s') and len(w) > 3 else w for w in words}
    return {w for w in stems if w not in FORMAT_WORDS}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    new = subject(args[0])
    new_forms = dish_forms(args[0])
    best = (0.0, None)
    for item in json.loads(DATA.read_text())['shorts']:
        old_forms = dish_forms(item['title'] + ' ' + item.get('keywords', ''))
        if new_forms and old_forms and new_forms.isdisjoint(old_forms):
            continue
        old = subject(item['title'] + ' ' + item.get('keywords', ''))
        if not old or not new:
            continue
        shared = len(new & old)
        overlap = shared / min(len(new), len(old)) if shared >= min(2, len(new), len(old)) else 0
        if overlap > best[0]:
            best = (overlap, item)
    score, item = best
    if score >= 0.5:
        print(f"Repeat topic ({score:.0%} match): \"{item['title']}\" - {item.get('views', item.get('status'))} views, {item['published']}")
        sys.exit(0 if '--allow' in sys.argv else 1)
    print(f'New topic (closest match {score:.0%}).')


if __name__ == '__main__':
    main()
