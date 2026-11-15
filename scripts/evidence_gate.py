#!/usr/bin/env python3
"""Check factual prices, record claims and recent creative repetition before a local render."""
import argparse
import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORMATS = json.loads((ROOT / 'data/format-rotation.json').read_text())['formats']
MONEY = re.compile(r'(?<!\w)(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|€\s?\d[\d,]*(?:\.\d{1,2})?|(?:\d[\d,]*\s?(?:dollars?|euros?)))', re.I)
NUM = r'(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and|a)'
WORD_MONEY = re.compile(rf'\b{NUM}(?:[\s-]+{NUM})*[\s-]+(?:dollars?|euros?|bucks)\b', re.I)
MOST = re.compile(r"world[’']?s\s+most\s+expensive", re.I)
RECORDS = (
    {'dish': 'pizza', 'price': re.compile(r'\$\s?2,?700\b'), 'year': '2017', 'url': 'https://www.guinnessworldrecords.com/world-records/most-expensive-pizza'},
    {'dish': 'burger', 'price': re.compile(r'€\s?5,?000\b'), 'year': '2021', 'url': 'https://www.guinnessworldrecords.com/world-records/463544-most-expensive-hamburger-single-portion'},
)


def visible_text(data):
    plan = data['plan']
    parts = [plan.get('title', ''), plan.get('hook', ''), plan.get('payoff', '')]
    parts += [shot.get('narration', '') for shot in plan.get('shots', [])]
    parts += [str(x) for x in data.get('onScreenText', [])]
    parts += [str(x) for x in data.get('priceLevels', []) if isinstance(x, str)]
    return ' '.join(parts)


def cents(value):
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def basket_total(lines, table):
    total = Decimal('0')
    used = []
    for line in lines:
        item = table.get(line['id'])
        if not item:
            raise ValueError(f"price item not in data/prices.json: {line['id']}")
        qty = Decimal(str(line.get('quantity', 1)))
        if qty <= 0:
            raise ValueError('basket quantity must be positive')
        if item['currency'] != 'USD':
            raise ValueError('basket mixes currencies; use one market and currency')
        total += Decimal(item['packagePrice']) * qty
        used.append(item)
    return cents(total), used


def check(data, prices, history):
    problems, notes, sources = [], [], []
    text = visible_text(data)
    claims = MONEY.findall(text)
    allowed_amounts = set()
    record = None
    if MOST.search(text):
        matches = [row for row in RECORDS if row['dish'] in text.lower() and row['price'].search(text) and row['year'] in text]
        if len(matches) != 1:
            problems.append("world's most expensive requires the documented pizza ($2,700, 2017) or burger (€5,000, 2021), with dish, value and year")
        else:
            record = matches[0]
            sources.append(record['url'])
            allowed_amounts.add(record['price'].search(text).group(0).replace(' ', '').replace(',', ''))
    table = {item['id']: item for item in prices.get('items', [])}
    basket = data.get('priceBasket')
    if basket:
        try:
            total, used = basket_total(basket['lines'], table)
            allowed_amounts.add(f'${total}')
            sources.extend(item['sourceUrl'] for item in used)
            shown = basket.get('displayTotal')
            if shown is not None and cents(shown) != total:
                problems.append(f'price basket displays {shown} but sourced items total ${total}')
            if basket.get('label') not in ('retail package basket', 'illustrative'):
                problems.append('price basket needs label: retail package basket or illustrative')
            if basket.get('currency') != 'USD':
                problems.append('price basket currency must match sourced USD prices')
        except (KeyError, ValueError, ArithmeticError) as exc:
            problems.append(str(exc))
    for level in data.get('priceLevels', []):
        try:
            total, used = basket_total(level['lines'], table)
            sources.extend(item['sourceUrl'] for item in used)
            if cents(level['displayTotal']) != total:
                problems.append(f"level {level.get('label', '?')} displays {level['displayTotal']} but sourced items total ${total}")
            allowed_amounts.add(f'${total}')
        except (KeyError, ValueError, ArithmeticError) as exc:
            problems.append(str(exc))
    for claim in claims:
        normalized = claim.replace(' ', '').replace(',', '')
        if normalized.lower().endswith('dollars'):
            normalized = '$' + normalized[:-7]
        if normalized.lower().endswith('euros'):
            normalized = '€' + normalized[:-5]
        if normalized.startswith(('$', '€')):
            normalized = normalized[0] + str(cents(normalized[1:]))
        if normalized not in {a[0] + str(cents(a[1:])) for a in allowed_amounts}:
            problems.append(f'visible price {claim} is not a sourced basket total or documented record')
    for spoken in WORD_MONEY.findall(text):
        problems.append(f'price written in words ({spoken.strip()}) cannot be checked; write the sourced amount in digits')
    if claims and basket and basket.get('label') == 'illustrative':
        notes.append('illustrative price must be visibly marked illustrative in the film and description')
    signature = data.get('creativeSignature')
    films = history.get('films', [])
    if not signature or any(not signature.get(k) for k in ('format', 'set', 'hookPattern')):
        notes.append('creative signature missing; variety cannot be verified for this draft')
    else:
        if signature['format'] not in FORMATS:
            notes.append(f"format is outside the four-format rotation: {signature['format']}")
        if not films:
            notes.append('published-signatures history is empty; populate it from actual uploads before release')
        else:
            previous = films[-1].get('creativeSignature', {})
            if all(signature[k].strip().lower() == previous.get(k, '').strip().lower() for k in ('format', 'set', 'hookPattern')):
                problems.append('same format, set and hook pattern as the previous published film')
            next_format = FORMATS[(FORMATS.index(previous.get('format')) + 1) % len(FORMATS)] if previous.get('format') in FORMATS else None
            if next_format and signature['format'] != next_format:
                notes.append(f'rotation suggestion after {previous.get("format")}: {next_format}')
    return problems, notes, sorted(set(sources))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('scenario', type=Path)
    p.add_argument('--prices', type=Path, default=ROOT / 'data/prices.json')
    p.add_argument('--history', type=Path, default=ROOT / 'data/published-signatures.json')
    args = p.parse_args()
    data = json.loads(args.scenario.read_text(encoding='utf-8-sig'))
    problems, notes, sources = check(data, json.loads(args.prices.read_text()), json.loads(args.history.read_text()))
    for note in notes: print('REVIEW:', note)
    for problem in problems: print('BLOCKED:', problem)
    if sources: print('Price/record sources:', ', '.join(sources))
    if not problems: print('Evidence gate passed; visual and audio review remain required.')
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
