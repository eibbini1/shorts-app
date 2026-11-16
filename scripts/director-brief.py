#!/usr/bin/env python3
"""Ask a compact director's brief, save it, then draft a local scenario without rendering."""
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]

QUESTIONS = (
    ('topic', 'What is the video about? Name the exact dish or subject', ''),
    ('style', 'Visual style and mood (example: warm realistic macro)', 'cinematic, warm'),
    ('set', 'One consistent set (example: walnut kitchen, copper tools)', ''),
    ('hook', 'First 2 seconds: what physical image stops the scroll?', ''),
    ('mustShow', 'Which food action must visibly happen on camera?', ''),
    ('obstacle', 'What makes the result difficult? (optional)', ''),
    ('turn', 'What technique or decision changes the result? (optional)', ''),
    ('ending', 'What must we see at the end?', ''),
    ('audio', 'Sound: auto, asmr (cooking sounds), or voiced (Kokoro)', 'auto'),
    ('seconds', 'Length in seconds, 10–60', '30'),
    ('orientation', 'Orientation: vertical or wide (wide requires 60 seconds)', 'vertical'),
)


def idea_defaults(idea_id):
    bank = json.loads((ROOT / 'data/creative-evidence-bank.json').read_text())
    idea = next((item for item in bank['originalProductionIdeas'] if item['id'] == idea_id), None)
    if idea is None:
        raise ValueError(f'Unknown bank idea: {idea_id}. Run npm run ideas:bank to list choices.')
    sound = 'asmr' if idea['soundMode'].lower().startswith('asmr') else 'auto'
    return {'topic': idea['recipe'], 'hook': idea['hook'], 'mustShow': idea['payoff'],
            'ending': idea['payoff'], 'audio': sound}


def collect(initial=None):
    initial = initial or {}
    answers = {}
    for key, label, default in QUESTIONS:
        default = initial.get(key, default)
        suffix = f' [{default}]' if default else ' [model chooses]' if key not in ('topic',) else ''
        print(f'{label}{suffix}: ', end='', file=sys.stderr, flush=True)
        line = sys.stdin.readline()
        if not line:
            raise ValueError('Input ended before the director brief was complete')
        answers[key] = line.strip() or default
    return answers


def validate(raw):
    brief = {key: str(raw.get(key, default)).strip() for key, _, default in QUESTIONS}
    if not brief['topic']:
        raise ValueError('Name the exact dish or subject')
    if any(len(value) > 240 for value in brief.values()):
        raise ValueError('Keep each answer under 240 characters')
    if brief['audio'] not in ('auto', 'asmr', 'voiced'):
        raise ValueError('Sound must be auto, asmr, or voiced')
    if brief['orientation'] not in ('vertical', 'wide'):
        raise ValueError('Orientation must be vertical or wide')
    try:
        brief['seconds'] = int(brief['seconds'])
    except ValueError as error:
        raise ValueError('Length must be a whole number of seconds') from error
    if not 10 <= brief['seconds'] <= 60:
        raise ValueError('Length must be 10–60 seconds')
    if brief['orientation'] == 'wide' and brief['seconds'] != 60:
        raise ValueError('The current wide scenario path requires 60 seconds')
    return brief


def draft_command(brief, identifier, model):
    return ['node', 'scripts/story-scenario.mjs', brief['topic'], identifier,
            '--style', brief['style'], '--set', brief['set'], '--hook', brief['hook'],
            '--must-show', brief['mustShow'], '--obstacle', brief['obstacle'],
            '--turn', brief['turn'], '--ending', brief['ending'], '--audio', brief['audio'],
            '--format', 'long' if brief['orientation'] == 'wide' else 'short',
            '--seconds', str(brief['seconds']), '--model', model]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model', help='Local story model (defaults to installed Gemma, else qwen3:1.7b)')
    p.add_argument('--idea', help='Prefill the director questions from an original idea in npm run ideas:bank')
    p.add_argument('--answers', type=Path, help='Use saved answer JSON instead of interactive questions')
    p.add_argument('--dry-run', action='store_true', help='Validate and show the brief without calling a model')
    args = p.parse_args()
    try:
        defaults = idea_defaults(args.idea) if args.idea else {}
        brief = validate({**defaults, **json.loads(args.answers.read_text())} if args.answers else collect(defaults))
    except (ValueError, json.JSONDecodeError, OSError) as error:
        p.error(str(error))
    model = args.model or ('gemma-local' if (ROOT / 'storage/setup/gemma-model-dir.txt').is_file() else 'qwen3:1.7b')
    identifier = f'guided-{datetime.now().strftime("%Y%m%d-%H%M%S")}-{uuid4().hex[:6]}'
    command = draft_command(brief, identifier, model)
    if args.dry_run:
        print(json.dumps({'brief': brief, 'bankIdeaId': args.idea, 'model': model, 'draftCommand': command}, indent=2))
        return
    brief_path = ROOT / 'drafts/generated' / f'{identifier}.brief.json'
    brief_path.parent.mkdir(parents=True, exist_ok=True)
    brief_path.write_text(json.dumps({'model': model, 'bankIdeaId': args.idea, 'answers': brief}, indent=2) + '\n')
    print(f'Saved director brief: {brief_path.relative_to(ROOT)}', file=sys.stderr)
    subprocess.run(command, cwd=ROOT, stdout=sys.stderr, stderr=sys.stderr, check=True)
    scenario = ROOT / 'drafts/generated' / f'{identifier}.local-scenario.json'
    if not scenario.is_file():
        raise RuntimeError('The local model returned without saving a scenario')
    for script, extra in (('preflight-short.py', ['--strict']), ('audit-local-story.py', [])):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), str(scenario), *extra],
                                cwd=ROOT, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout, end='', file=sys.stderr)
        if result.stderr:
            print(result.stderr, end='', file=sys.stderr)
        if result.returncode:
            raise SystemExit(f'Draft saved at {scenario.relative_to(ROOT)}, but {script} blocked it. '
                             'Edit the listed shot problems, then render with --scenario. No media render started.')
    print(scenario.relative_to(ROOT))


if __name__ == '__main__':
    main()
