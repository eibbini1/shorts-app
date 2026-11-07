"""Generate connected LTX shots for the chocolate Short on Apple Silicon."""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'storage/chocolate-short-local/motion'
CLI = ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx'


def model_dir(name):
    override = os.environ.get(f'CHOCOLATE_{name.upper().replace("-", "_")}_DIR')
    if override:
        return Path(override).expanduser().resolve()
    pointer = ROOT / ('storage/setup/ltx-model-dir.txt' if name == 'ltx-motion'
                      else 'storage/setup/gemma-model-dir.txt')
    if pointer.is_file():
        selected = Path(pointer.read_text().strip())
        if selected.is_dir():
            return selected
        raise SystemExit(f'Active {name} model is missing: {selected}')
    raise SystemExit(f'Missing active {name} model pointer. Run npm run setup:mac first.')


def run(args):
    print('Running:', ' '.join(map(str, args)), flush=True)
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def generate(name, prompt, seed, anchor, final_anchor=None):
    clip = OUT / f'{name}.mp4'
    last = OUT / f'{name}-anchor.png'
    valid = False
    if clip.is_file():
        try:
            probe = json.loads(subprocess.check_output([
                'ffprobe', '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=nb_frames,width,height,r_frame_rate',
                '-of', 'json', str(clip),
            ]))['streams'][0]
            valid = (int(probe['nb_frames']) == 97 and probe['width'] == 384
                     and probe['height'] == 640 and probe['r_frame_rate'] == '24/1')
        except (subprocess.CalledProcessError, IndexError, KeyError, ValueError):
            pass
    if not valid:
        args = [CLI, 'generate', '--model', model_dir('ltx-motion'),
                '--gemma', model_dir('gemma-text'), '--distilled', '--low-ram',
                '--no-audio', '--seed', seed, '--image', anchor, 0, 1.0]
        if final_anchor:
            args += ['--image', final_anchor, 'last', 0.7]
        args += ['--prompt', prompt, '-H', 640, '-W', 384, '-f', 97,
                 '--frame-rate', 24, '-o', clip]
        run(args)
    else:
        print('Using existing', clip, flush=True)
    run(['ffmpeg', '-loglevel', 'error', '-y', '-sseof', '-0.05', '-i', clip,
         '-frames:v', 1, '-update', 1, last])
    return last


def main():
    if not CLI.is_file():
        raise SystemExit('Missing LTX CLI. Run npm run setup:mac first.')
    OUT.mkdir(parents=True, exist_ok=True)
    opening = ROOT / 'assets/demo/chocolate-shell/opening.png'
    reveal = ROOT / 'assets/demo/chocolate-shell/reveal.png'
    anchor = generate(
        'crack-to-reveal',
        'Locked macro cinematic food shot of the same dark chocolate dome with edible gold leaf on top. A silver spoon slowly presses down at the gold, a hairline crack opens exactly at contact, the shell breaks into natural shards, and glossy pistachio cream with a vivid raspberry center is revealed beneath. Continuous physical movement, same dessert, same dark plate, warm side light, shallow depth of field, no camera movement, no extra hands, no text.',
        77, opening, reveal)
    shots = [
        ('lift', 81, 'Continuous macro food cinematography of the exact same cracked dark chocolate dome with gold leaf, on the same charcoal plate. The silver spoon carrying pistachio cream and raspberry slowly rises from the opening, a thick ribbon of green cream stretches and then releases, small chocolate fragments settle naturally. One spoon only, same warm sidelight and dark background, gentle physical motion, no cuts, no new objects, no text.'),
        ('ribbon', 82, 'Continuous cinematic macro shot of the same opened dark chocolate dessert and silver spoon on the charcoal plate. The spoon moves gradually across the split shell; rich pistachio cream folds over the spoon and glossy raspberry filling glistens and slowly drips back into the shell. Tiny chocolate shards shift. Maintain dessert identity, warm light, dark background, shallow depth of field, physically plausible movement, no text.'),
        ('scoop', 83, 'The same luxury dark chocolate dome dessert, now broken open to show pistachio cream and raspberry, remains on the same charcoal plate. In one continuous macro video shot the silver spoon gently scoops a generous bite from the soft center and lifts it, showing dark chocolate flakes clinging to the cream while a red raspberry ribbon trails. Slow appetizing real movement, warm sidelight, dark background, no cuts or text.'),
        ('hero', 84, 'Close-up continuation of the same pistachio and raspberry filled dark chocolate dessert on the dark plate. The same silver spoon with its layered bite moves slowly toward the lens; green cream gleams, the red raspberry center remains clearly visible, a tiny bead of cream drips back toward the cracked chocolate shell. Cinematic food macro, realistic motion, gold leaf detail, warm sidelight, dark background, no additional dessert, no text.'),
        ('finish', 85, 'Final continuous hero shot of the same broken dark chocolate dome with pistachio cream and raspberry on the charcoal plate. The silver spoon gently lowers the layered bite toward the shell while the glossy filling flows and catches warm light; a final dark chocolate shard falls lightly onto the plate. Slow luxurious macro food cinematography, coherent same dessert and setting, no text, no cuts.'),
    ]
    for name, seed, prompt in shots:
        anchor = generate(name, prompt, seed, anchor)
    print('All six connected motion clips are ready.')


if __name__ == '__main__':
    main()
