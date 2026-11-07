"""Create an original crust-focused Short using local FLUX, LTX and cached cooking shots."""
import json
import hashlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get('STEAK_CRUST_WORK_DIR', ROOT / 'storage/steak-crust-local')).expanduser().resolve()
GOLD = Path(os.environ.get('GOLD_STEAK_WORK_DIR', ROOT / 'storage/gold-steak-local')).expanduser().resolve()
MODEL = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
GEMMA = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()


def run(*command):
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True)


def valid_clip(path):
    if not path.is_file(): return False
    data = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames,width,height,r_frame_rate', '-of', 'json', str(path)]))['streams'][0]
    return data['nb_frames'] == '97' and data['width'] == 384 and data['height'] == 640 and data['r_frame_rate'] == '24/1'


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def image(name, prompt, seed):
    target = WORK / 'refs' / f'{name}.png'
    if target.is_file() and target.with_suffix('.json').is_file():
        print('Reusing FLUX reference:', name, flush=True)
        return target
    print('Generating FLUX reference:', name, flush=True)
    run('python3', ROOT / 'scripts/create-flux-image.py', '--prompt', prompt,
        '--seed', seed, '--output', target)
    return target


def motion(name, reference, prompt, seed):
    target = WORK / 'motion' / f'{name}.mp4'
    if valid_clip(target):
        print('Reusing LTX shot:', name, flush=True)
        return target
    print('Generating LTX shot:', name, flush=True)
    run(ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx', 'generate',
        '--model', MODEL, '--gemma', GEMMA, '--distilled', '--low-ram',
        '--no-audio', '--seed', seed, '--image', reference, 0, 1.0,
        '--prompt', prompt, '-H', 640, '-W', 384, '-f', 97,
        '--frame-rate', 24, '-o', target)
    if not valid_clip(target): raise RuntimeError(f'Invalid motion clip: {target}')
    return target


def main():
    output = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else WORK / 'steak-crust-30s.mp4'
    if output.exists(): raise SystemExit(f'Output already exists: {output}')
    (WORK / 'refs').mkdir(parents=True, exist_ok=True)
    (WORK / 'motion').mkdir(exist_ok=True)
    old = [GOLD / 'motion' / f'{name}.mp4' for name in ('sear', 'baste', 'slice', 'gold', 'serve')]
    if not all(valid_clip(item) for item in old):
        raise SystemExit('First run npm run make:gold-steak:mac to create five verified reusable cooking shots.')
    crust = image('crust', 'One thick cooked ribeye steak with a deep browned crisp crust in a single black cast-iron skillet. A few tiny butter bubbles at the lower edge, one rosemary sprig in the pan. Tight vertical macro food photograph, warm side light, dark restaurant kitchen, realistic steak texture, no hands, no other food.', 610)
    raw = image('raw', 'Exactly one thick raw marbled ribeye steak centered on a dark walnut cutting board. A few sparse salt crystals on its surface, one rosemary sprig to the left, one silver chef knife at the top edge. Warm single side light, deep charcoal kitchen background, vertical macro food photograph, no other steaks or plates.', 600)
    hook = motion('crust-hook', crust, 'An extreme close-up of the same single browned steak in its black cast-iron skillet. The crisp crust glistens as a few tiny clear butter bubbles form at its lower edge and pop. A trace of steam rises. The camera makes one slow controlled move closer and stops on the readable browned texture. The steak stays in one piece, the rosemary remains at the pan edge, warm side light, one continuous take.', 810)
    season = motion('sparse-season', raw, 'Locked macro shot of the same single raw marbled steak on its dark walnut board. A brief pinch of a few fine salt crystals falls during the first second, bounces once and settles as a sparse scattering. The sprinkle then stops and the red marbling remains visible. The rosemary and one knife remain in place under warm side light. One continuous take.', 811)
    run('node', ROOT / 'scripts/steak-crust/narrate.mjs')
    subprocess.run([str(ROOT / 'storage/tools/ComfyUI/.venv/bin/python'),
                    str(ROOT / 'scripts/gold-steak/sound.py')], cwd=ROOT, check=True,
                   env={**os.environ, 'GOLD_STEAK_WORK_DIR': str(WORK)})
    shots = [(hook, 4), (season, 4), (old[0], 4), (old[1], 4), (old[2], 5), (old[3], 5), (old[4], 4)]
    manifest = {'aspect': 'short', 'shots': [{'file': str(path), 'seconds': seconds} for path, seconds in shots],
                'soundtrack': 'soundtrack.wav', 'voice': {'file': 'voice-timeline.wav', 'startSeconds': 0}}
    manifest_path = WORK / 'film-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    run('python3', ROOT / 'scripts/assemble-motion-video.py', '--manifest', manifest_path, '--output', output)
    provenance = {'reference': 'https://www.youtube.com/watch?v=y4W3jy0GBqg',
                  'referenceUse': 'broad crust-first craft inspiration; no source media used',
                  'film': str(output), 'filmSha256': digest(output),
                  'newReferences': [str(crust), str(raw)],
                  'newMotion': [str(hook), str(season)],
                  'reusedLocalMotion': [str(path) for path in old],
                  'motionModel': MODEL, 'textEncoder': GEMMA,
                  'voice': 'Kokoro af_heart local ONNX',
                  'musicAndEffects': 'locally synthesized soundtrack',
                  'assembly': 'FFmpeg exact-frame 30 second export'}
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'Review the original creator-inspired Short: {output}')


if __name__ == '__main__': main()
