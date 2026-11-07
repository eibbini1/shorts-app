"""Render a reviewed local scenario with FLUX, LTX, Kokoro and FFmpeg."""
import argparse
import hashlib
import json
import math
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FPS = 24


def run(*args, env=None):
    subprocess.run([str(item) for item in args], cwd=ROOT, env=env, check=True)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:16]


def file_hash(path):
    sha = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def valid_video(path):
    if not path.is_file(): return False
    try:
        stream = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
            '-select_streams', 'v:0', '-show_entries',
            'stream=nb_frames,width,height,r_frame_rate', '-of', 'json', str(path)]))['streams'][0]
        return stream['nb_frames'] == '97' and stream['r_frame_rate'] == '24/1' and (stream['width'], stream['height']) in ((384, 640), (640, 384))
    except (KeyError, IndexError, ValueError, subprocess.CalledProcessError):
        return False


def still(work, index, shot, seed, source, width, height):
    key = digest({'prompt': shot['imagePrompt'], 'seed': seed, 'sourceHash': file_hash(source) if source else None,
                  'model': 'flux2-klein-4b-q4', 'width': width, 'height': height})
    target = work / 'refs' / f'shot-{index:02d}-{key}.png'
    if target.is_file() and target.with_suffix('.json').is_file():
        print(f'Reusing image {index + 1}: {target.name}', flush=True)
        return target
    print(f'Generating local FLUX image {index + 1}: {target.name}', flush=True)
    command = ['python3', ROOT / 'scripts/create-flux-image.py', '--prompt', shot['imagePrompt'],
               '--seed', seed, '--width', width, '--height', height, '--output', target]
    if source: command.extend(['--source', source])
    run(*command)
    return target


def clip(work, index, part, shot, seed, reference, width, height, model, gemma):
    prompt = shot['motionPrompt'].strip() + ' One continuous camera take with coherent physical movement, stable subject identity and lighting.'
    key = digest({'prompt': prompt, 'seed': seed, 'referenceHash': file_hash(reference),
                  'model': model, 'gemma': gemma, 'frames': 97, 'width': width, 'height': height})
    target = work / 'motion' / f'shot-{index:02d}-part-{part:02d}-{key}.mp4'
    if valid_video(target):
        print(f'Reusing motion {index + 1}.{part + 1}: {target.name}', flush=True)
        return target
    print(f'Generating local LTX motion {index + 1}.{part + 1}: {target.name}', flush=True)
    run(ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx', 'generate',
        '--model', model, '--gemma', gemma, '--distilled', '--low-ram', '--no-audio',
        '--seed', seed, '--image', reference, 0, 1.0, '--prompt', prompt,
        '-H', height, '-W', width, '-f', 97, '--frame-rate', FPS, '-o', target)
    if not valid_video(target): raise RuntimeError(f'Motion failed verification: {target}')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--chain-images', action='store_true', help='Edit previous still to preserve one subject')
    args = parser.parse_args()
    scenario = args.scenario.expanduser().resolve()
    output = args.output.expanduser().resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).expanduser().resolve()
    if output.exists(): parser.error(f'Output already exists: {output}')
    if not scenario.is_file(): parser.error(f'Missing scenario: {scenario}')
    run('node', ROOT / 'scripts/bb-local-scenario.mjs', '--validate', scenario)
    source_data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    plan, settings = source_data['plan'], source_data['settings']
    actual_seconds = sum(shot['seconds'] for shot in plan['shots'])
    if actual_seconds != settings['seconds']:
        parser.error(f'Shot timings add to {actual_seconds}s; edit them to equal {settings["seconds"]}s before rendering')
    if settings['seconds'] > 60: parser.error('Interactive local renderer supports up to 60 seconds per run')
    aspect = settings['format']
    width, height = (384, 640) if aspect == 'short' else (640, 384)
    work.joinpath('refs').mkdir(parents=True, exist_ok=True)
    work.joinpath('motion').mkdir(exist_ok=True)
    run('node', ROOT / 'scripts/narrate-any-local.mjs', scenario, work)
    run(ROOT / 'storage/tools/ComfyUI/.venv/bin/python', ROOT / 'scripts/sound-any-local.py', scenario, work)
    model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
    gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
    expected = sum(math.ceil(shot['seconds'] / 5) for shot in plan['shots'])
    print(f'{len(plan["shots"])} shots require {expected} new motion clips; allow several minutes per uncached clip.', flush=True)
    segments = []
    previous = None
    for index, shot in enumerate(plan['shots']):
        reference = still(work, index, shot, 1200 + index,
                          previous if args.chain_images else None, width, height)
        previous = reference
        parts = math.ceil(shot['seconds'] / 5)
        total_frames = shot['seconds'] * FPS
        frame_counts = [total_frames // parts + (1 if part < total_frames % parts else 0) for part in range(parts)]
        for part, frames in enumerate(frame_counts):
            if part:
                anchor = work / 'motion' / f'shot-{index:02d}-part-{part - 1:02d}-anchor.png'
                run('ffmpeg', '-y', '-v', 'error', '-sseof', '-0.05', '-i', previous_clip,
                    '-frames:v', 1, anchor)
                reference = anchor
            previous_clip = clip(work, index, part, shot, 2200 + index * 10 + part,
                                 reference, width, height, model, gemma)
            segments.append({'file': str(previous_clip), 'seconds': frames / FPS})
    manifest = {'aspect': aspect, 'shots': segments,
                'soundtrack': 'soundtrack.wav',
                'voice': {'file': 'voice-timeline.wav', 'startSeconds': 0}}
    manifest_path = work / 'film-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    run('python3', ROOT / 'scripts/assemble-motion-video.py', '--manifest', manifest_path, '--output', output)
    provenance = {'scenario': str(scenario), 'scenarioSha256': file_hash(scenario),
                  'output': str(output), 'outputSha256': file_hash(output),
                  'imageModel': 'FLUX.2 Klein 4B q4 via MFLUX', 'videoModel': model,
                  'textEncoder': gemma, 'voice': 'Kokoro ONNX local',
                  'sound': 'original local synthesis', 'chainImages': args.chain_images,
                  'motionClips': len(segments), 'totalSeconds': settings['seconds']}
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'Finished local video: {output}')


if __name__ == '__main__': main()
