#!/usr/bin/env python3
"""A/B test of an original FLUX still prompt against a structured one, then optional image-to-video clips.

  python3 scripts/flux_ab.py run [--preset car|food] [--out DIR] [--skip-clips] make stills (and ~4 s clips), metrics, metadata
  python3 scripts/flux_ab.py report DIR                          side-by-side report.md and report.html

Both variants use the same model, seed, size and steps; clips use the same motion prompt, seed and LTX settings
(the same clip() the renderer uses). Quality scores come from scores.json in DIR, filled in after looking at the
results (see RUBRIC). Nothing here calls a paid service.
"""
import argparse
import html
import importlib.util
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from first_checks import check_clip, check_still, frame_stats, gray_pixels, longest_freeze  # noqa: E402
from flux_prompt import build_prompt, check_prompt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SEED, MOTION_SEED, WIDTH, HEIGHT = 1200, 2200, 384, 640

# Existing Ferrari scene: assets/demo/ferrari-source.jpg (red Ferrari 458 Italia) and its motion prompt from docs/MAC_HANDOFF.md.
# No FLUX still prompt for it exists in the repo, so A is written in the pipeline's own style (free text + the
# "Consistent subject / Visual style" suffix that story-scenario.mjs appends).
ORIGINAL = ('A red sports car, a Ferrari 458 Italia, on a road. '
            'Consistent subject: A red Ferrari 458 Italia. Visual style: cinematic.')
SPEC = {'subject': 'A red Ferrari 458 Italia sports car',
        'action': 'parked on an empty coastal asphalt road, ready to roll forward',
        'environment': 'a winding road with a softly blurred hillside and pale sky behind'}
MOTION = ('The red sports car rolls forward slowly a short distance. The wheels rotate naturally. '
          'Keep the same body shape, paint, background and lighting. The camera stays still.')

RUBRIC = {  # criterion: what a 5 looks like. Score 1 to 5.
    'geometry': 'Car body, wheels, mirrors and badges are correctly shaped and attached; nothing melted, doubled or missing.',
    'visual_clarity': 'Sharp subject, clean edges, readable reflections, no artefacts or stray text.',
    'composition': 'Fits vertical 9:16: subject well placed, headroom, room for motion, nothing awkwardly cropped.',
    'subject_consistency': 'In the clip the same car keeps its shape, colour and details from first frame to last.',
    'animation_readiness': 'Clip shows the requested motion (rolls forward, wheels turn) smoothly, with a steady camera and no warping.',
}

FOOD = {
    'original': ('A raw pizza before baking on a wooden peel, topped only with pineapple and five cheeses. '
                 'Keep the pale dough and each separate topping clearly visible. Photorealistic vertical kitchen photo.'),
    'spec': {
        'subject': 'Raw pizza with pineapple and five shredded cheeses: mozzarella, cheddar, provolone, parmesan and fontina',
        'action': 'rests before baking on a wooden peel, with pale dough, red sauce and separate unmelted toppings',
        'style': 'photorealistic editorial food photograph',
        'composition': 'vertical 9:16, whole pizza centered in the lower frame with space above',
        'camera': '35-degree angle, 50mm lens, crisp focus on the toppings',
        'lighting': 'soft warm window light from the left',
        'environment': 'a dark rustic kitchen counter with a softly blurred oven in the background',
        'materials': 'pale dough, red tomato sauce, five distinct shredded cheeses, pineapple and cheese as the only toppings',
        'motion_ready': 'whole pizza visible, each topping distinct, peel has room to slide, simple background',
    },
    'motion': ('The wooden peel slides slowly toward the open oven while the pizza stays flat and intact. '
               'Keep the same toppings, dough shape, kitchen and lighting; the camera stays still.'),
    'rubric': {
        'ingredient_match': 'Pineapple is visible and the pizza has the requested distinct cheese toppings without substitutions.',
        'prep_state': 'The dough and toppings look raw and unbaked, not already cooked or plated.',
        'visual_clarity': 'Food textures and topping edges are clear, with no melted, duplicated or stray objects.',
        'composition': 'The whole pizza is visible in the vertical frame with room for the peel to move.',
        'motion_consistency': 'The clip moves the peel toward the oven while preserving the pizza, toppings and scene.',
    },
}

PRESETS = {
    'car': {'original': ORIGINAL, 'spec': SPEC, 'motion': MOTION, 'rubric': RUBRIC, 'domain': 'car'},
    'food': {**FOOD, 'domain': 'food'},
}


def run(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], cwd=ROOT, check=True, **kw)


def edge_energy(path, at=0.0):
    data = gray_pixels(path, at)
    return sum(abs(data[i + 1] - data[i]) for i in range(len(data) - 1)) / len(data)


def frame_diff(a, a_at, b, b_at):
    x, y = gray_pixels(a, a_at), gray_pixels(b, b_at)
    n = min(len(x), len(y))
    return sum(abs(x[i] - y[i]) for i in range(n)) / n


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                capture_output=True, text=True).stdout.strip() or 0)


def still_metrics(path):
    mean, spread = frame_stats(path)
    return {'brightness': round(mean, 1), 'contrast': round(spread, 1), 'edgeEnergy': round(edge_energy(path), 2),
            'gate': check_still(path) or 'pass'}


def clip_metrics(clip, still):
    d = duration(clip)
    motion = [frame_diff(clip, t, clip, t + 0.5) for t in [x * 0.5 for x in range(int(d * 2) - 1)]]
    return {'seconds': round(d, 2), 'longestFreezeSeconds': round(longest_freeze(clip), 2), 'gate': check_clip(clip) or 'pass',
            'meanMotion': round(sum(motion) / max(len(motion), 1), 2),
            'stillToFirstFrameDiff': round(frame_diff(still, 0, clip, 0), 2),
            'firstToLastFrameDiff': round(frame_diff(clip, 0, clip, max(d - 0.1, 0)), 2)}


def load_clip_function():
    spec = importlib.util.spec_from_file_location('render_any_local', ROOT / 'scripts/render-any-local.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.clip


def cmd_run(args):
    preset = PRESETS[args.preset]
    original, spec, motion, rubric, domain = (
        preset['original'], preset['spec'], preset['motion'], preset['rubric'], preset['domain'])
    out = (args.out or ROOT / 'storage/flux-ab' / f'{args.preset}-{datetime.now():%Y%m%d-%H%M%S}').resolve()
    if out.exists() and not args.resume:
        sys.exit(f'{out} exists; choose a new --out or pass --resume to continue it')
    prompts = {'A': original, 'B': build_prompt(spec, domain)}
    for name, text in prompts.items():
        print(f'Prompt {name} check: {check_prompt(text) or "clean"}')
    common = {'model': 'flux2-klein-4b-4bit via mflux', 'steps': 4, 'seed': args.seed, 'width': WIDTH, 'height': HEIGHT}
    for name, text in prompts.items():
        meta_file = out / name / 'meta.json'
        if meta_file.is_file():
            saved = json.loads(meta_file.read_text())
            if saved.get('preset', 'car') != args.preset or saved.get('seed') != args.seed:
                sys.exit(f'{meta_file} belongs to a different preset or seed; choose a new --out')
            print(f'Still {name} already made, keeping it')
            continue
        (out / name).mkdir(parents=True, exist_ok=True)
        (out / name / 'prompt.txt').write_text(text + '\n')
        started = time.monotonic()
        run(['python3', ROOT / 'scripts/create-flux-image.py', '--prompt', text, '--seed', args.seed, '--width', WIDTH,
             '--height', HEIGHT, '--output', out / name / 'still.png'])
        meta = {'variant': name, 'preset': args.preset, 'rubric': rubric,
                'createdAt': datetime.now(timezone.utc).isoformat(), 'prompt': text,
                'promptIssues': check_prompt(text), 'promptWords': len(text.split()), **common,
                'stillSeconds': round(time.monotonic() - started, 1), 'still': still_metrics(out / name / 'still.png')}
        (out / name / 'meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    if not args.skip_clips:
        clip = load_clip_function()
        model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
        gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
        class Progress:
            observed = []
            def mark_complete(self, index, part): return None
            def __call__(self, *a, **k): return ''
        for name in prompts:
            if 'clip' in json.loads((out / name / 'meta.json').read_text()):
                print(f'Clip {name} already made, keeping it')
                continue
            (out / name / 'motion').mkdir(exist_ok=True)
            started = time.monotonic()
            prior_observations = len(Progress.observed)
            made = clip(out / name, 0, 0, {'motionPrompt': motion}, args.motion_seed, out / name / 'still.png', WIDTH, HEIGHT, model, gemma, Progress())
            reused = len(Progress.observed) == prior_observations
            final = out / name / 'clip.mp4'
            made.rename(final)
            meta = json.loads((out / name / 'meta.json').read_text())
            meta.update({'motionPrompt': motion, 'motionSeed': args.motion_seed, 'ltxModel': model, 'frames': 97, 'fps': 24,
                         'clipReused': reused, 'clipSeconds': round(time.monotonic() - started, 1),
                         'clip': clip_metrics(final, out / name / 'still.png')})
            (out / name / 'meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    if (out / 'scores.json').is_file():
        print(f'Done: {out}'); return
    scores = {'rater': 'FILL IN: who looked', 'scale': '1 (poor) to 5 (excellent)',
              **{v: {c: {'score': None, 'note': ''} for c in rubric} for v in prompts}}
    (out / 'scores.json').write_text(json.dumps(scores, indent=2) + '\n')
    print(f'Done: {out}\nNext: look at both, fill scores.json, then python3 scripts/flux_ab.py report {out}')


def total(scores, v, rubric=RUBRIC):
    got = [scores[v][c]['score'] for c in rubric if scores.get(v, {}).get(c, {}).get('score') is not None]
    return (sum(got), len(got) * 5) if got else None


def cmd_report(args):
    out = Path(args.dir).resolve()
    meta = {v: json.loads((out / v / 'meta.json').read_text()) for v in 'AB'}
    if meta['A'].get('preset', 'car') != meta['B'].get('preset', 'car') or meta['A'].get('seed') != meta['B'].get('seed'):
        sys.exit('A and B use different presets or seeds; refusing to compare them')
    rubric = meta['A'].get('rubric', RUBRIC)
    scores = json.loads((out / 'scores.json').read_text()) if (out / 'scores.json').is_file() else {}
    has_clip = all('clip' in meta[v] for v in 'AB')
    rows = [('Prompt words', 'promptWords'), ('Prompt issues', 'promptIssues'), ('Seed', 'seed'), ('Size', None)]
    md = [f'# FLUX prompt A/B report: {out.name}', '', f'Same model ({meta["A"]["model"]}), seed {meta["A"]["seed"]}, {meta["A"]["width"]}x{meta["A"]["height"]}, {meta["A"]["steps"]} steps for both.', '']
    for v, label in (('A', 'Original'), ('B', 'Optimized (structured)')):
        md += [f'## {v}: {label}', '', f'> {meta[v]["prompt"]}', '', f'![still {v}]({v}/still.png)', '']
        s = meta[v]['still']
        md += [f'Still metrics: brightness {s["brightness"]}, contrast {s["contrast"]}, edge energy {s["edgeEnergy"]}, gate {s["gate"]}; made in {meta[v]["stillSeconds"]} s.', '']
        if 'clip' in meta[v]:
            c = meta[v]['clip']
            timing = 'reused in' if meta[v].get('clipReused') else 'generated in'
            md += [f'Clip ({c["seconds"]} s): [clip.mp4]({v}/clip.mp4); gate {c["gate"]}; frozen {c["longestFreezeSeconds"]} s; mean motion {c["meanMotion"]}; '
                   f'still-to-first-frame diff {c["stillToFirstFrameDiff"]}; first-to-last diff {c["firstToLastFrameDiff"]}; {timing} {meta[v]["clipSeconds"]} s.', '']
    if has_clip:
        md += [f'Motion prompt (both): {meta["A"]["motionPrompt"]}', '']
    md += ['## Rubric scores (1 to 5)', '', '| Criterion | What a 5 looks like | A | B |', '|---|---|---|---|']
    for c, text in rubric.items():
        cell = lambda v: (scores.get(v, {}).get(c, {}).get('score') if scores.get(v, {}).get(c, {}).get('score') is not None else 'not scored')
        md.append(f'| {c} | {text} | {cell("A")} | {cell("B")} |')
    ta, tb = total(scores, 'A', rubric) if scores else None, total(scores, 'B', rubric) if scores else None
    md += ['', f'Totals: A {ta[0]}/{ta[1]}' if ta else 'Totals: not scored yet', f'B {tb[0]}/{tb[1]}' if tb else '']
    notes = [f'- {v} {c}: {scores[v][c]["note"]}' for v in 'AB' for c in rubric if scores.get(v, {}).get(c, {}).get('note')]
    if notes: md += ['', '## Notes', *notes]
    md += ['', 'Limits: one image pair, one seed, one rater. A single seed can favour either prompt by luck; treat the result as a hint, not proof.']
    (out / 'report.md').write_text('\n'.join(md) + '\n')
    esc = html.escape
    cols = ''.join(f'<div class="col"><h2>{v}: {l}</h2><p class="p">{esc(meta[v]["prompt"])}</p><img src="{v}/still.png">'
                   + (f'<video src="{v}/clip.mp4" controls loop muted playsinline></video>' if 'clip' in meta[v] else '') + '</div>'
                   for v, l in (('A', 'Original'), ('B', 'Optimized')))
    table = ''.join(f'<tr><td>{c}</td><td>{esc(t)}</td><td>{scores.get("A", {}).get(c, {}).get("score", "-")}</td><td>{scores.get("B", {}).get(c, {}).get("score", "-")}</td></tr>' for c, t in rubric.items())
    (out / 'report.html').write_text(f'<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>FLUX A/B</title>'
        '<style>body{font-family:system-ui;margin:24px;max-width:1000px}.row{display:flex;gap:16px;flex-wrap:wrap}.col{flex:1 1 300px}img,video{width:100%;border-radius:8px;margin-top:8px}.p{font-size:14px}table{border-collapse:collapse}td{border:1px solid #ccc;padding:6px}</style>'
        f'<h1>FLUX prompt A/B: {esc(out.name)}</h1><div class=row>{cols}</div><h2>Rubric (1 to 5)</h2><table><tr><td>Criterion</td><td>5 looks like</td><td>A</td><td>B</td></tr>{table}</table>'
        f'<p>Totals: A {f"{ta[0]}/{ta[1]}" if ta else "not scored"}, B {f"{tb[0]}/{tb[1]}" if tb else "not scored"}. One pair, one seed, one rater.</p>')
    print(f'Wrote {out / "report.md"} and {out / "report.html"}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run'); r.add_argument('--preset', choices=PRESETS, default='car'); r.add_argument('--out', type=Path); r.add_argument('--seed', type=int, default=SEED); r.add_argument('--motion-seed', type=int, default=MOTION_SEED); r.add_argument('--skip-clips', action='store_true'); r.add_argument('--resume', action='store_true'); r.set_defaults(func=cmd_run)
    p = sub.add_parser('report'); p.add_argument('dir'); p.set_defaults(func=cmd_report)
    args = parser.parse_args(); args.func(args)


if __name__ == '__main__':
    main()
