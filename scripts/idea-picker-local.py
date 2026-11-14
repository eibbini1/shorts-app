#!/usr/bin/env python3
"""Suggest five original local video concepts from fresh public signals, then pick one."""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOOD_SPINES = [
    {'title': 'The Scallop Sear', 'hook': 'Can one wet scallop develop a golden crust?', 'anchor': 'scallop', 'subject': 'A chef sears one sea scallop in a copper pan and serves it to one guest',
     'obstacle': 'Surface moisture prevents the scallop from browning',
     'turn': 'The chef pats the scallop dry, heats the pan, and bastes it with butter',
     'ending': 'The guest cuts the scallop to reveal its moist center and takes a bite'},
    {'title': 'The Chocolate Shell', 'hook': 'Listen for the snap of this chocolate shell.', 'anchor': 'chocolate', 'subject': 'A pastry chef makes one thin chocolate shell around a chilled mousse',
     'obstacle': 'A thick coating would hide the delicate mousse and lose its snap',
     'turn': 'The chef spreads a thin layer of tempered chocolate in the mold',
     'ending': 'A spoon cracks the glossy shell to reveal the mousse inside'},
    {'title': 'The Crisp Pizza Slice', 'hook': 'Will this pizza crust stay crisp?', 'anchor': 'pizza', 'subject': 'A pizzaiolo bakes one margherita pizza and serves a slice',
     'obstacle': 'Wet tomato topping threatens to soften the crust',
     'turn': 'The chef drains the tomatoes and places the pizza on a preheated stone',
     'ending': 'A guest lifts one crisp slice with bubbling cheese and takes a bite'},
    {'title': 'The Hotel Hot Dog', 'hook': 'One hot dog. Could this belong in fine dining?', 'anchor': 'hot dog', 'subject': 'A chef sears one long sausage, assembles one brioche hot dog, and serves it',
     'obstacle': 'The bun may soften before the sausage develops a browned crust',
     'turn': 'The chef sears the sausage separately and toasts the split bun just before assembly',
     'ending': 'A guest bites the finished hot dog, revealing crisp bun and juicy sausage'},
    {'title': 'The Chocolate Strawberry', 'hook': 'A thin chocolate snap around one strawberry.', 'anchor': 'strawberry', 'subject': 'A chocolatier coats one fresh strawberry with dark chocolate and pistachio',
     'obstacle': 'Moisture on the berry would stop the chocolate from setting cleanly',
     'turn': 'The chocolatier dries the berry and dips it in tempered chocolate',
     'ending': 'A guest bites through the thin shell to reveal the red strawberry'},
]


def trend_signals(niche, region):
    try:
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/trend-brief.py'),
                                 '--niche', niche, '--region', region], capture_output=True,
                                text=True, timeout=40, check=True)
        brief = json.loads(result.stdout)
        return brief.get('matches', [])[:5], brief.get('fetchedAt'), brief.get('sourceUrl')
    except (subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        return [], None, None


def local_ideas(niche, signals, model, spines=None):
    titles = [item['trend'] for item in signals]
    prompt = ('Create exactly five DISTINCT, ORIGINAL short-video ideas for the niche below. '
              'Each must have a coherent, physically filmable start, goal, visible obstacle, change of approach, and visible finish in 30 seconds. '
              'The obstacle must be a real physical or texture constraint; the turn must visibly solve it. '
              'Avoid generic beauty montages, repeated concepts, edible gold or caviar unless requested, and impossible one-shot transformations. '
              'No unsupported facts or promises of views. '
              'A public search signal is only inspiration, never proof that a video idea is trending. '
              'Use sourceTitle only when it is EXACTLY one of the supplied signal titles and genuinely relevant; otherwise use an empty string. '
              'Return only JSON: {"ideas":[{"title":"...","subject":"one-sentence subject and action",'
              '"obstacle":"visible physical problem","turn":"visible action that solves it",'
              '"ending":"specific visible final action","style":"visual style, lighting, lens",'
              '"hook":"first-frame question or visual action","sourceTitle":""}]}. '
              f'Niche: {niche}. Fresh matching Google search signal titles: {json.dumps(titles)}. '
              f'{"Use these five physical story spines in the same order; preserve each subject, obstacle, turn, and ending exactly, but improve title, hook and style: " + json.dumps(spines) if spines else ""}')
    idea_fields = {key: {'type': 'string'} for key in ('title', 'subject', 'obstacle', 'turn', 'ending', 'style', 'hook', 'sourceTitle')}
    schema = {'type': 'object', 'properties': {'ideas': {'type': 'array', 'minItems': 5, 'maxItems': 5,
              'items': {'type': 'object', 'properties': idea_fields,
                        'required': list(idea_fields), 'additionalProperties': False}}},
              'required': ['ideas'], 'additionalProperties': False}
    body = {'model': model, 'stream': False, 'think': False, 'format': schema,
            'options': {'temperature': 0.65, 'num_predict': 1300, 'num_ctx': 4096},
            'messages': [{'role': 'user', 'content': prompt}]}
    request = urllib.request.Request('http://127.0.0.1:11434/api/chat',
                                     data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = json.loads(response.read())['message']['content']
    except (urllib.error.URLError, TimeoutError, KeyError) as error:
        raise SystemExit(f'Local Ollama idea model unavailable: {error}. Start Ollama or choose your own subject in npm run direct:mac.')
    try:
        ideas = json.loads(raw)['ideas']
        if len(ideas) != 5:
            raise ValueError('expected five ideas')
        for idea in ideas:
            if not all(isinstance(idea.get(key), str) and idea[key].strip()
                       for key in ('title', 'subject', 'obstacle', 'turn', 'ending', 'style', 'hook')):
                raise ValueError('missing idea field')
            if idea.get('sourceTitle', '') not in titles:
                idea['sourceTitle'] = ''
        if len({idea['subject'].lower().strip() for idea in ideas}) != 5:
            raise ValueError('ideas repeat')
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit(f'Local model returned invalid ideas: {error}. Try again or choose your own subject in npm run direct:mac.')
    if spines:
        for idea, spine in zip(ideas, spines):
            for key in ('title', 'subject', 'obstacle', 'turn', 'ending'):
                idea[key] = spine[key]
            if spine['anchor'] not in idea['hook'].lower():
                idea['hook'] = spine['hook']
            idea['sourceTitle'] = ''  # Curated dish spines are not claims of live trend relevance.
    return ideas


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--niche', help='Idea category, such as luxury food cooking')
    p.add_argument('--region', default='US')
    p.add_argument('--model', default='qwen3:8b')
    p.add_argument('--no-trends', action='store_true', help='Generate evergreen ideas without live search')
    p.add_argument('--output', type=Path)
    p.add_argument('--ideas-file', type=Path, help='Reopen a saved idea list without fetching trends or running the model again')
    p.add_argument('--pick', action='store_true', help='Ask which idea to carry into the director')
    p.add_argument('--choice', type=int, choices=range(0, 6), help='Choose 1–5 without a prompt; 0 means enter your own')
    p.add_argument('--selection-out', type=Path)
    a = p.parse_args()
    if a.ideas_file:
        output = a.ideas_file
        report = json.loads(output.read_text())
        ideas = report['ideas']
        signals = report.get('signals', [])
        spines = report.get('ideaBasis', '').startswith('curated food')
    else:
        if not a.niche: p.error('--niche is required unless --ideas-file is used')
        signals, fetched, source_url = ([], None, None) if a.no_trends else trend_signals(a.niche, a.region)
        spines = FOOD_SPINES if any(word in a.niche.lower() for word in ('food', 'cook', 'chef', 'recipe', 'dessert', 'chocolate', 'restaurant')) else None
        ideas = local_ideas(a.niche, signals, a.model, spines)
        report = {'createdAt': datetime.now(timezone.utc).isoformat(), 'niche': a.niche,
                  'region': a.region, 'model': a.model, 'signalFetchedAt': fetched,
                  'signalSourceUrl': source_url, 'signals': signals, 'ideas': ideas,
                  'ideaBasis': 'curated food story spines, local model hook and style' if spines else 'local model suggestions',
                  'note': 'Google search signals are not proof of video-platform popularity. Ideas are original suggestions, not verified trends.'}
        output = a.output or ROOT / 'drafts/research' / f'ideas-{datetime.now():%Y%m%d-%H%M%S}.json'
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + '\n')
    basis = 'curated food stories with local model styling' if spines else ('signal-informed concepts' if signals else 'evergreen concepts')
    print(f'Idea source: {basis}. Relevant fresh Google search signals: {len(signals)}.')
    for signal in signals:
        print(f'  Search signal: {signal["trend"]} ({signal.get("publishedAt") or "date unavailable"})')
    for index, idea in enumerate(ideas, 1):
        print(f'\n{index}. {idea["title"]}\n   Hook: {idea["hook"]}\n   Story: {idea["subject"]}\n   Obstacle: {idea["obstacle"]}\n   Turn: {idea["turn"]}\n   Ending: {idea["ending"]}')
        if idea['sourceTitle']:
            print(f'   Search signal: {idea["sourceTitle"]}')
    print(f'\nSaved ideas: {output}')
    if a.pick or a.choice is not None:
        answer = str(a.choice) if a.choice is not None else None
        while answer is None:
            candidate = input('Choose an idea 1–5, or 0 to enter your own: ').strip()
            if candidate in ('0', '1', '2', '3', '4', '5'):
                answer = candidate
            else:
                print('Enter 0, 1, 2, 3, 4, or 5.')
        if answer != '0':
            selection = {'idea': ideas[int(answer) - 1], 'ideasFile': str(output)}
            selected = a.selection_out or output.with_suffix('.selected.json')
            selected.parent.mkdir(parents=True, exist_ok=True)
            selected.write_text(json.dumps(selection, indent=2) + '\n')
            print(f'Selected idea: {selected}')


if __name__ == '__main__':
    main()
