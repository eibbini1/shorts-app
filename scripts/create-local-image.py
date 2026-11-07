"""Create a standalone image with the installed local ComfyUI checkpoint."""

import argparse
import hashlib
import json
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMFY = ROOT / 'storage/tools/ComfyUI'
CHECKPOINT = 'v1-5-pruned-emaonly.safetensors'
BASE = 'http://127.0.0.1:8188'


def request(route, data=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {'Content-Type': 'application/json'} if body else {}
    with urllib.request.urlopen(urllib.request.Request(BASE + route, body, headers),
                                timeout=30) as response:
        return json.load(response)


def graph(prompt, negative, seed, width, height, steps, cfg, denoise, reference):
    nodes = {
        '1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': CHECKPOINT}},
        '2': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['1', 1], 'text': prompt}},
        '3': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['1', 1], 'text': negative}},
        '5': {'class_type': 'KSampler', 'inputs': {
            'model': ['1', 0], 'positive': ['2', 0], 'negative': ['3', 0],
            'latent_image': ['4', 0], 'seed': seed, 'steps': steps, 'cfg': cfg,
            'sampler_name': 'euler', 'scheduler': 'normal', 'denoise': denoise}},
        '6': {'class_type': 'VAEDecode', 'inputs': {'samples': ['5', 0], 'vae': ['1', 2]}},
        '7': {'class_type': 'SaveImage', 'inputs': {
            'images': ['6', 0], 'filename_prefix': 'shorts_local'}},
    }
    if reference:
        nodes['8'] = {'class_type': 'LoadImage', 'inputs': {'image': reference}}
        nodes['4'] = {'class_type': 'VAEEncode', 'inputs': {
            'pixels': ['8', 0], 'vae': ['1', 2]}}
    else:
        nodes['4'] = {'class_type': 'EmptyLatentImage', 'inputs': {
            'width': width, 'height': height, 'batch_size': 1}}
    return nodes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reference', type=Path,
                        help='Optional image to preserve composition and characters')
    parser.add_argument('--preset', type=Path,
                        help='JSON file with positive_prefix, negative, width, height, steps, cfg')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--strength', type=float, default=0.45,
                        help='Amount of change when using a reference (0.1–1.0)')
    parser.add_argument('--timeout', type=int, default=900)
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output.exists() or output.with_suffix('.json').exists():
        parser.error(f'Output already exists: {output}')
    if output.suffix.lower() != '.png':
        parser.error('Output must end in .png')
    if not 0.1 <= args.strength <= 1:
        parser.error('--strength must be between 0.1 and 1')
    if args.reference and not args.reference.is_file():
        parser.error(f'Reference not found: {args.reference}')
    if not (COMFY / 'models/checkpoints' / CHECKPOINT).is_file():
        parser.error('Local checkpoint is missing. Run npm run setup:mac.')
    preset = json.loads(args.preset.read_text()) if args.preset else {}
    width, height = int(preset.get('width', 512)), int(preset.get('height', 768))
    if width % 64 or height % 64 or width < 256 or height < 256:
        parser.error('Preset width and height must be multiples of 64 and at least 256')
    steps, cfg = int(preset.get('steps', 25)), float(preset.get('cfg', 7))
    prefix = preset.get('positive_prefix', '').strip()
    prompt = ', '.join(part for part in (prefix, args.prompt.strip()) if part)
    negative = preset.get('negative', 'text, watermark, duplicate people, duplicate animals, malformed anatomy')
    if not prompt:
        parser.error('Prompt is empty')
    try:
        request('/system_stats')
    except Exception as error:
        parser.error(f'ComfyUI is unavailable at {BASE}: {error}. Run npm run start:comfy:mac in another Terminal.')

    input_file = None
    try:
        if args.reference:
            input_file = f'shorts-reference-{uuid.uuid4().hex}.png'
            destination = COMFY / 'input' / input_file
            destination.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(args.reference),
                            '-vf', f'scale={width}:{height}:force_original_aspect_ratio=increase,'
                                   f'crop={width}:{height}', '-frames:v', '1', str(destination)],
                           check=True)
        workflow = graph(prompt, negative, args.seed, width, height, steps, cfg,
                         args.strength if input_file else 1.0, input_file)
        result = request('/prompt', {'prompt': workflow, 'client_id': uuid.uuid4().hex})
        if result.get('node_errors') or not result.get('prompt_id'):
            raise RuntimeError(f'ComfyUI rejected workflow: {result}')
        prompt_id = result['prompt_id']
        print(f'Generating locally with ComfyUI: {prompt_id}', flush=True)
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            history = request('/history/' + urllib.parse.quote(prompt_id))
            item = history.get(prompt_id)
            if item:
                if item.get('status', {}).get('status_str') == 'error':
                    raise RuntimeError(f'ComfyUI generation failed: {item["status"].get("messages")}')
                images = item.get('outputs', {}).get('7', {}).get('images', [])
                if images:
                    image = images[0]
                    query = urllib.parse.urlencode({key: image.get(key, '') for key in
                                                    ('filename', 'subfolder', 'type')})
                    output.parent.mkdir(parents=True, exist_ok=True)
                    with urllib.request.urlopen(BASE + '/view?' + query, timeout=60) as response:
                        data = response.read()
                    temporary = output.with_suffix('.png.part')
                    temporary.write_bytes(data)
                    temporary.replace(output)
                    manifest = {'prompt': prompt, 'negative': negative,
                                'reference': str(args.reference.resolve()) if args.reference else None,
                                'model': CHECKPOINT, 'seed': args.seed, 'steps': steps,
                                'cfg': cfg, 'strength': args.strength if args.reference else 1,
                                'width': width, 'height': height, 'sha256': hashlib.sha256(data).hexdigest()}
                    output.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n')
                    print(output)
                    return
            time.sleep(2)
        raise TimeoutError(f'ComfyUI did not finish within {args.timeout}s; prompt ID {prompt_id}')
    finally:
        if input_file:
            (COMFY / 'input' / input_file).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
