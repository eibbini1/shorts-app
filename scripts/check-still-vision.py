#!/usr/bin/env python3
"""Check a generated still against its shot before spending minutes on LTX motion.

The local vision model is a screening gate, not an editorial approval. A missing
model or ambiguous response fails closed and leaves the still available to fix.
"""
import argparse
import base64
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


MODEL = 'qwen3-vl:4b'
PROMPT_VERSION = 11
URL = 'http://127.0.0.1:11434/api/chat'
UNCERTAIN_REASON = re.compile(
    r'\b(?:appears?\s+to\s+be|seems?\s+to\s+be|possibly|maybe|perhaps|could\s+be|might\s+be|'
    r'uncertain|unsure|cannot\s+(?:tell|identify)|hard\s+to\s+tell|not\s+clear)\b', re.I)
# One yes/no per question. The older {criticalMatches, missingOrWrong} format made qwen3-vl:4b echo the
# alternative it was asked to rule out ("true" plus "halved baked potato"), which the gate had to treat as
# unusable. A single answer plus a short visible reason was decisive on the same stills (2026-11-16).
SCHEMA = {
    'type': 'object',
    'properties': {
        'answer': {'type': 'string', 'enum': ['yes', 'no']},
        'reason': {'type': 'string', 'maxLength': 80},
    },
    'required': ['answer', 'reason'],
    'additionalProperties': False,
}


def release(model):
    """Unload the vision model early when a check stops before its last question."""
    import http.client
    try:
        connection = http.client.HTTPConnection('127.0.0.1', 11434, timeout=10)
        connection.request('POST', '/api/generate', json.dumps({'model': model, 'keep_alive': 0}),
                           {'Content-Type': 'application/json'})
        connection.getresponse().read()
        connection.close()
    except OSError:
        pass


def review(image, prompt, must_show=(), must_not_show=(), model=MODEL, cache_dir=None, questions=()):
    image = Path(image)
    raw_image = image.read_bytes()
    key = hashlib.sha256(raw_image + json.dumps([PROMPT_VERSION, prompt, list(must_show), list(must_not_show),
                                                list(questions), model],
                                                sort_keys=True).encode()).hexdigest()[:20]
    report_path = Path(cache_dir or image.parent) / f'vision-{key}.json'
    if report_path.is_file():
        saved = json.loads(report_path.read_text())
        if saved.get('status') != 'unavailable':
            return saved, report_path
    first_clause = prompt.split('.', 1)[0][:180]
    first_clause = re.sub(r'^(?:extreme )?(?:macro|wide|close-up) (?:view|shot) of ', '', first_clause,
                          flags=re.I)
    checks = ([('direct', item) for item in questions] if questions else
              ([('required', item) for item in must_show] or [('required', first_clause)]) +
              [('forbidden', item) for item in must_not_show])
    image_b64 = base64.b64encode(raw_image).decode()
    outcomes = []
    diagnostics = []
    for kind, item in checks:
        question = (item[:300] if kind == 'direct' else
                    f'Does this image show {item[:180]}?' if kind == 'required' else
                    f'Is {item[:180]} visible in this image?')
        uncertainty_answer = 'yes' if kind == 'forbidden' else 'no'
        question += (f' Answer yes or no from what is visible; if uncertain, answer {uncertainty_answer}. '
                     'Use a factual reason of at most 10 words. Return only the JSON verdict; no analysis. /no_think')
        wanted = 'no' if kind == 'forbidden' else 'yes'
        last = (kind, item) == checks[-1]
        # Release the 3.4 GB vision model right after the last question: on a 16 GB Mac it otherwise stays
        # resident for Ollama's default five minutes and overlaps the LTX motion job (swap was ~97% full).
        body = {'model': model, 'stream': False, 'think': False, 'format': SCHEMA,
                'keep_alive': 0 if last else '30s',
                'options': {'temperature': 0, 'num_predict': 256, 'num_ctx': 4096},
                'messages': [{'role': 'user', 'content': question, 'images': [image_b64]}]}
        request = urllib.request.Request(URL, data=json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.load(response)
            raw = result.get('message', {}).get('content', '')
            diagnostics.append({'criterion': item, 'doneReason': result.get('done_reason'),
                                'generatedTokens': result.get('eval_count'),
                                'thinkingCharacters': len(result.get('message', {}).get('thinking', ''))})
            if not raw or result.get('done_reason') == 'length':
                raise ValueError('local vision model returned no complete verdict')
            answer = json.loads(raw)
            if answer.get('answer') not in ('yes', 'no') or not isinstance(answer.get('reason'), str):
                raise ValueError('local vision model returned an invalid verdict')
            outcomes.append({'criterion': item, 'kind': kind, 'expected': wanted, 'answer': answer})
            uncertain = bool(UNCERTAIN_REASON.search(answer['reason']))
            if answer['answer'] != wanted or uncertain:
                release(model)
                verdict = {'criticalMatches': False,
                           'missingOrWrong': [
                               f"{item}: {'uncertain visual match: ' if uncertain else ''}{answer['reason'][:200]}".strip()
                           ]}
                status = 'review-required'
                break
        except (OSError, ValueError, json.JSONDecodeError) as error:
            verdict = {'criticalMatches': False, 'missingOrWrong': [str(error)]}
            status = 'unavailable'
            break
    else:
        verdict = {'criticalMatches': True, 'missingOrWrong': []}
        status = 'pass'
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'model': model,
              'image': str(image), 'imageSha256': hashlib.sha256(raw_image).hexdigest(),
              'status': status, 'verdict': verdict, 'checks': outcomes, 'diagnostics': diagnostics,
              'note': 'Local vision is a pre-motion screen; inspect the still and rendered motion yourself.'}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    return report, report_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True, type=Path)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--must-show', action='append', default=[])
    parser.add_argument('--must-not-show', action='append', default=[])
    parser.add_argument('--question', action='append', default=[], help='Short direct visual question for a reviewed shot')
    parser.add_argument('--model', default=MODEL)
    parser.add_argument('--cache-dir', type=Path)
    args = parser.parse_args()
    report, path = review(args.image, args.prompt, args.must_show, args.must_not_show,
                          args.model, args.cache_dir, args.question)
    print(f"Still vision gate: {report['status']} | {path}")
    for issue in report['verdict']['missingOrWrong']:
        print('REVIEW:', issue)
    return 0 if report['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
