#!/usr/bin/env python3
"""Generate all inexpensive FLUX storyboards before committing to LTX motion."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('local_renderer', ROOT / 'scripts/render-any-local.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('scenario', type=Path)
    p.add_argument('--output', type=Path)
    p.add_argument('--chain-images', action='store_true', help='Edit the preceding image for scene continuity')
    a = p.parse_args()
    scenario = a.scenario.resolve()
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    shots = data['plan']['shots']
    work = ROOT / 'storage/any-local' / scenario.stem
    (work / 'refs').mkdir(parents=True, exist_ok=True)
    width, height = (384, 640) if data['settings']['format'] == 'short' else (640, 384)
    stills = []
    for i, shot in enumerate(shots):
        previous = stills[-1] if a.chain_images and stills else None
        stills.append(renderer.still(work, i, shot, 1200+i, previous, width, height))
    cell_width, cell_height = 210, 360
    columns = min(3, len(stills))
    rows = (len(stills) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * cell_width, rows * cell_height + 40), '#17110d')
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), data['plan']['title'][:70], fill='white')
    for i, path in enumerate(stills):
        image = Image.open(path).convert('RGB')
        image.thumbnail((190, 315))
        x = (i % columns) * cell_width + 10
        y = (i // columns) * cell_height + 40
        sheet.paste(image, (x + (190-image.width)//2, y))
        draw.text((x, y + 320), f'{i+1}. {data.get("storyArc", {}).get("beats", [{}]*len(stills))[i].get("label", "Shot")}', fill='white')
    output = (a.output or work / 'stills-preview.jpg').resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=88)
    print(f'Review six stills before LTX motion: {output}')
    print('Check same focal food, kitchen, props, lighting, chronological actions, and final payoff. Edit the scenario and regenerate a failed still before the long render.')


if __name__ == '__main__': main()
