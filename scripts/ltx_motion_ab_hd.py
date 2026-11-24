#!/usr/bin/env python3
"""Compare LTX motion prompts on one identical, reviewed still and fixed settings."""
import argparse
import html
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from first_checks import check_still  # noqa: E402
from flux_ab import clip_metrics, load_clip_function  # noqa: E402
from studio_references import sha256 as file_hash  # noqa: E402


PROMPTS = {
    'A': ('The wooden peel slides slowly toward the open oven while the pizza stays flat and intact. '
          'Keep the same toppings, dough shape, kitchen and lighting; the camera stays still.'),
    'B': ('The wooden peel and whole pizza slide forward toward the open oven in one clear, steady movement, '
          'then stop. Keep the pizza flat on the peel and every topping fixed in place. The oven and camera stay '
          'still; do not zoom, cut, bake the pizza or add objects.'),
}


def contact_sheet(clip, output):
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(clip),
        '-vf', 'fps=2,scale=192:320,tile=4x2:nb_frames=8', '-frames:v', '1', str(output),
    ], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--still', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--seed', type=int, default=2200)
    parser.add_argument('--prompts', type=Path, help='JSON file {"A": "...", "B": "..."}; defaults to the pizza pair')
    args = parser.parse_args()
    prompts = PROMPTS
    if args.prompts:
        prompts = json.loads(args.prompts.read_text())
        if set(prompts) != {'A', 'B'} or not all(isinstance(v, str) and v.strip() for v in prompts.values()):
            parser.error('--prompts must hold non-empty "A" and "B" strings')
    still = args.still.expanduser().resolve()
    out = args.out.expanduser().resolve()
    if not still.is_file():
        parser.error(f'Missing reviewed still: {still}')
    if (issue := check_still(still)) is not None:
        parser.error(f'The source still failed a technical check: {issue}')
    if out.exists():
        parser.error(f'{out} already exists; choose a fresh output directory')
    model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
    gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
    if not model or not gemma:
        parser.error('The local LTX model configuration is incomplete.')
    clip = load_clip_function()
    common = {'still': str(still), 'stillSha256': file_hash(still), 'seed': args.seed,
              'model': model, 'gemma': gemma, 'width': 704, 'height': 1280, 'frames': 97, 'fps': 24}
    out.mkdir(parents=True)

    class Progress:
        observed = []
        def mark_complete(self, index, part):
            return None
        def __call__(self, *args, **kwargs):
            return ''

    for variant, prompt in prompts.items():
        folder = out / variant
        (folder / 'motion').mkdir(parents=True)
        started = time.monotonic()
        made = clip(folder, 0, 0, {'motionPrompt': prompt}, args.seed, still, 704, 1280,
                    model, gemma, Progress())
        final = folder / 'clip.mp4'
        made.rename(final)
        metrics = clip_metrics(final, still)
        contact_sheet(final, folder / 'contact.png')
        metadata = {'variant': variant, 'motionPrompt': prompt, **common,
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                    'generationSeconds': round(time.monotonic() - started, 1),
                    'clip': str(final.relative_to(out)), 'metrics': metrics}
        (folder / 'meta.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print(f'{variant}: {metrics}', flush=True)

    rows = []
    markdown = [
        f'# LTX motion prompt A/B: {out.name}', '',
        f'Same still `{still}` (SHA-256 `{common["stillSha256"]}`), seed {args.seed}, {model}, '
        '704x1280, 97 frames at 24 fps.', '',
    ]
    for variant in ('A', 'B'):
        metadata = json.loads((out / variant / 'meta.json').read_text())
        markdown += [
            f'## {variant}', '', f'> {metadata["motionPrompt"]}', '',
            f'[Clip]({metadata["clip"]}) · [Contact sheet]({variant}/contact.png) · '
            f'gate {metadata["metrics"]["gate"]} · mean motion {metadata["metrics"]["meanMotion"]} · '
            f'first-to-last diff {metadata["metrics"]["firstToLastFrameDiff"]}.', '',
        ]
        rows.append(
            f'<section><h2>{variant}</h2><p>{html.escape(metadata["motionPrompt"])}</p>'
            f'<img src="{variant}/contact.png" alt="{variant} contact sheet">'
            f'<video src="{html.escape(metadata["clip"])}" controls loop muted playsinline></video>'
            f'<pre>{html.escape(json.dumps(metadata["metrics"], indent=2))}</pre></section>'
        )
    (out / 'report.html').write_text(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        '<title>LTX motion prompt A/B</title><style>body{font:16px system-ui;max-width:1100px;margin:24px auto;padding:0 16px}'
        '.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}'
        'img,video{width:100%;border-radius:8px}pre{white-space:pre-wrap}</style>'
        '<h1>LTX motion prompt A/B</h1><p>Same reviewed still, model, seed, resolution, frame count and FPS. '
        'Metrics do not prove requested direction or preserve every detail; compare the contact sheets and clips.</p>'
        f'<div class="row">{"".join(rows)}</div>\n'
    )
    markdown += [
        'Metrics do not prove requested direction or preserve every detail; compare the contact sheets and clips.',
        'This is one seed and one source still; it is calibration evidence, not a production-default change.',
    ]
    (out / 'report.md').write_text('\n'.join(markdown) + '\n')
    print(f'Report: {out / "report.html"}')


if __name__ == '__main__':
    main()
