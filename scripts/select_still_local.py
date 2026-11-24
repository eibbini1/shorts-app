#!/usr/bin/env python3
"""Select one of three FLUX stills using local Qwen vision; inspect the result yourself."""
import argparse
import base64
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from first_checks import check_still

VISION_UNAVAILABLE = False


def provisional_selection(reason):
    return 1, {'status': 'unverified', 'reason': reason,
               'note': 'Candidate 1 passed only the blank/dark image check. Inspect all candidates and the rendered shot manually before release.'}


def select(images, image_prompt, model='qwen3-vl:4b', checks=None):
    global VISION_UNAVAILABLE
    if len(images) != 3:
        raise ValueError('exactly three stills are required')
    rejected = {}
    for index, path in enumerate(images, 1):
        problem = check_still(path)
        if problem:
            rejected[index] = problem
    if len(rejected) == len(images):
        raise ValueError('All three still candidates failed the picture check. Regenerate shot candidates.')
    if rejected:
        chosen = next(index for index in range(1, len(images) + 1) if index not in rejected)
        return chosen, {
            'status': 'unverified',
            'reason': 'Some candidates failed the picture check. Review the remaining frames manually.',
            'rejectedCandidates': rejected,
        }
    if VISION_UNAVAILABLE:
        return provisional_selection('Vision model was unavailable earlier in this render')
    checks = checks or {}
    must_show = checks.get('mustShow', [])
    must_not_show = checks.get('mustNotShow', [])
    questions = checks.get('questions', [])
    schema = {'type': 'object', 'properties': {
        'selectedIndex': {'type': 'integer', 'minimum': 1, 'maximum': 3},
        'candidates': {'type': 'array', 'minItems': 3, 'maxItems': 3, 'items': {
            'type': 'object', 'properties': {'index': {'type': 'integer'},
                'handsPlausible': {'type': 'boolean'}, 'toolContactPlausible': {'type': 'boolean'},
                'foodAndSetMatch': {'type': 'boolean'}, 'visualChecksPass': {'type': 'boolean'},
                'issues': {'type': 'array', 'items': {'type': 'string'}}},
            'required': ['index', 'handsPlausible', 'toolContactPlausible', 'foodAndSetMatch', 'visualChecksPass', 'issues'],
            'additionalProperties': False}},
        'reason': {'type': 'string'}},
        'required': ['selectedIndex', 'candidates', 'reason'], 'additionalProperties': False}
    prompt = ('Images are candidates 1, 2, 3 in that order. Pick the most usable image for an original food video. '
              'Check fingers and hand count when hands are requested; check whether the stated utensil touches the food plausibly; '
              'check food identity and kitchen continuity against this shot prompt. If no hand or utensil is requested, mark its check true. '
              'Set visualChecksPass true only when every required visible item is present and every forbidden item is absent. '
              'Do not infer ingredient varieties from appearance when they are not visually distinguishable; report uncertainty as a failed check. '
              f'Required visible items: {json.dumps(must_show)}. Forbidden items: {json.dumps(must_not_show)}. '
              f'Additional direct questions that must be answered yes: {json.dumps(questions)}. '
              'Return JSON only. Be conservative; list visible defects, not imagined ones. '
              f'Shot: {image_prompt[:1500]}')
    request_body = {'model': model, 'stream': False, 'think': False, 'format': schema,
                    'options': {'temperature': 0, 'num_predict': 650, 'num_ctx': 4096},
                    'messages': [{'role': 'user', 'content': prompt,
                                  'images': [base64.b64encode(path.read_bytes()).decode() for path in images]}]}
    request = urllib.request.Request('http://127.0.0.1:11434/api/chat',
                                     data=json.dumps(request_body).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.loads(response.read())
        raw = result.get('message', {}).get('content', '').strip()
        if not raw or result.get('done_reason') == 'length':
            raise ValueError('empty or token-limited vision response')
        review = json.loads(raw[raw.find('{'):raw.rfind('}') + 1])
    except (ValueError, KeyError, urllib.error.URLError) as error:
        VISION_UNAVAILABLE = True
        return provisional_selection(f'Vision review unavailable: {error}')
    rows = review['candidates']
    if len(rows) != 3 or sorted(row['index'] for row in rows) != [1, 2, 3]:
        raise ValueError('vision model did not assess all three candidates')
    eligible = [row for row in rows if all(row[k] for k in (
        'handsPlausible', 'toolContactPlausible', 'foodAndSetMatch', 'visualChecksPass'))]
    chosen = review['selectedIndex']
    if eligible and chosen not in [row['index'] for row in eligible]:
        raise ValueError('vision model selected a still that failed its own checks')
    if not eligible:
        chosen = min(rows, key=lambda row: (
            sum(not row[key] for key in ('handsPlausible', 'toolContactPlausible', 'foodAndSetMatch', 'visualChecksPass')),
            len(row['issues']), row['index']))['index']
        review['status'] = 'review-required'
        review['reason'] = 'No candidate passed all visual checks; selected the least-flagged candidate for correction or attended review.'
    else:
        review['status'] = 'passed'
    return chosen, review


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--image', type=Path, action='append', required=True)
    p.add_argument('--prompt', required=True)
    p.add_argument('--visual-checks', type=Path, help='JSON object with mustShow, mustNotShow and questions lists')
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--model', default='qwen3-vl:4b')
    args = p.parse_args()
    checks = json.loads(args.visual_checks.read_text()) if args.visual_checks else None
    chosen, review = select(args.image, args.prompt, args.model, checks)
    args.output.write_text(json.dumps({'checkedAt': datetime.now(timezone.utc).isoformat(),
                                       'selectedIndex': chosen, 'model': args.model,
                                       'images': [str(path) for path in args.image], 'review': review,
                                       'note': 'Advisory vision selection; human frame review remains required.'}, indent=2) + '\n')
    print(f'Selected still {chosen}: {args.image[chosen - 1]}')


if __name__ == '__main__':
    main()
