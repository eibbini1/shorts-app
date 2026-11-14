#!/usr/bin/env python3
"""Select one of three FLUX stills using local Qwen vision; inspect the result yourself."""
import argparse
import base64
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from first_checks import check_still


def select(images, image_prompt, model='qwen3-vl:4b'):
    if len(images) != 3:
        raise ValueError('exactly three stills are required')
    if any(check_still(path) for path in images):
        raise ValueError('at least one candidate is blank or too dark; regenerate it')
    schema = {'type': 'object', 'properties': {
        'selectedIndex': {'type': 'integer', 'minimum': 1, 'maximum': 3},
        'candidates': {'type': 'array', 'minItems': 3, 'maxItems': 3, 'items': {
            'type': 'object', 'properties': {'index': {'type': 'integer'},
                'handsPlausible': {'type': 'boolean'}, 'toolContactPlausible': {'type': 'boolean'},
                'foodAndSetMatch': {'type': 'boolean'}, 'issues': {'type': 'array', 'items': {'type': 'string'}}},
            'required': ['index', 'handsPlausible', 'toolContactPlausible', 'foodAndSetMatch', 'issues'],
            'additionalProperties': False}},
        'reason': {'type': 'string'}},
        'required': ['selectedIndex', 'candidates', 'reason'], 'additionalProperties': False}
    prompt = ('Images are candidates 1, 2, 3 in that order. Pick the most usable image for an original food video. '
              'Check fingers and hand count when hands are requested; check whether the stated utensil touches the food plausibly; '
              'check food identity and kitchen continuity against this shot prompt. If no hand or utensil is requested, mark its check true. '
              'Return JSON only. Be conservative; list visible defects, not imagined ones. '
              f'Shot: {image_prompt[:1500]}')
    request_body = {'model': model, 'stream': False, 'think': False, 'format': schema,
                    'options': {'temperature': 0, 'num_predict': 650, 'num_ctx': 4096},
                    'messages': [{'role': 'user', 'content': prompt,
                                  'images': [base64.b64encode(path.read_bytes()).decode() for path in images]}]}
    request = urllib.request.Request('http://127.0.0.1:11434/api/chat',
                                     data=json.dumps(request_body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=240) as response:
        raw = json.loads(response.read())['message']['content']
    review = json.loads(raw[raw.find('{'):raw.rfind('}') + 1])
    rows = review['candidates']
    if len(rows) != 3 or sorted(row['index'] for row in rows) != [1, 2, 3]:
        raise ValueError('vision model did not assess all three candidates')
    eligible = [row for row in rows if all(row[k] for k in ('handsPlausible', 'toolContactPlausible', 'foodAndSetMatch'))]
    if not eligible:
        raise ValueError('none of three stills passed the hand, tool and food checks')
    chosen = review['selectedIndex']
    if chosen not in [row['index'] for row in eligible]:
        raise ValueError('vision model selected a still that failed its own checks')
    return chosen, review


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--image', type=Path, action='append', required=True)
    p.add_argument('--prompt', required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--model', default='qwen3-vl:4b')
    args = p.parse_args()
    chosen, review = select(args.image, args.prompt, args.model)
    args.output.write_text(json.dumps({'checkedAt': datetime.now(timezone.utc).isoformat(),
                                       'selectedIndex': chosen, 'model': args.model,
                                       'images': [str(path) for path in args.image], 'review': review,
                                       'note': 'Advisory vision selection; human frame review remains required.'}, indent=2) + '\n')
    print(f'Selected still {chosen}: {args.image[chosen - 1]}')


if __name__ == '__main__':
    main()
