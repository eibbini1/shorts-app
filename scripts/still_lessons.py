"""Remember why local vision review rejected a first still, and which prompts passed, per shot type.

Two append-only JSONL files under storage/learning/ (override with STILL_LESSONS_DIR):
  still-rejections.jsonl  one record per automatic correction: shot type, reason, prompt before and after
  still-recipes.jsonl     one record per still that passed review: shot type and the prompt that passed
Lessons are advice shown to the prompt writer (prompt-lint.py prints them); they never rewrite a prompt.
"""
import json
import os
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT_TYPES = (('overhead', r'overhead|top-down|top down|bird'),
              ('mid-air', r'mid-air|hang|hovering|floating|suspended'),
              ('pour', r'\bpour'),
              ('macro-close-up', r'macro|close-up|close up'),
              ('hero', r'hero'))


def directory():
    return Path(os.environ.get('STILL_LESSONS_DIR') or ROOT / 'storage' / 'learning')


def shot_type(prompt):
    text = (prompt or '').lower()
    for name, pattern in SHOT_TYPES:
        if re.search(pattern, text):
            return name
    return 'general'


def _append(name, record):
    folder = directory()
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / name).open('a', encoding='utf-8') as handle:
        handle.write(json.dumps({'at': time.strftime('%Y-%m-%dT%H:%M:%S'), **record}, ensure_ascii=False) + '\n')


def _read(name):
    path = directory() / name
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def record_rejection(prompt_before, prompt_after, reason, scenario=''):
    _append('still-rejections.jsonl', {'shotType': shot_type(prompt_before), 'reason': ' '.join(str(reason).split())[:400],
                                       'promptBefore': prompt_before, 'promptAfter': prompt_after, 'scenario': scenario})


def record_recipe(prompt, scenario=''):
    text = (prompt or '').strip()
    if text:  # a prompt that needed automatic correction is kept but marked, so clean recipes are preferred
        _append('still-recipes.jsonl', {'shotType': shot_type(text), 'prompt': text, 'scenario': scenario,
                                        'repaired': 'Automatic frame correction' in text})


def lessons_for(prompt, limit=3):
    """Recent rejection reasons and the latest passing recipe for this prompt's shot type."""
    kind = shot_type(prompt)
    reasons = []
    for row in reversed(_read('still-rejections.jsonl')):
        if row.get('shotType') == kind and row['reason'] not in reasons:
            reasons.append(row['reason'])
        if len(reasons) >= limit:
            break
    recipes = [row for row in _read('still-recipes.jsonl') if row.get('shotType') == kind]
    clean = [row for row in recipes if not row.get('repaired')]
    best = (clean or recipes)[-1]['prompt'] if recipes else None
    return {'shotType': kind, 'rejected': reasons, 'recipe': best}
