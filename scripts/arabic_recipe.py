#!/usr/bin/env python3
"""Preflight and finish a reviewed Arabic recipe with the existing ArtCraft path.

The six scene clips and recorded narration are inputs. This adapter never
generates footage or invents a voice, and never replaces an existing export.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from arabic_reel_captions import build as build_captions


ROOT = Path(__file__).resolve().parents[1]


def probe(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries',
         'format=duration:stream=codec_type,width,height,r_frame_rate',
         '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def check(spec, base=ROOT):
    errors, warnings = [], []
    if spec.get('language') != 'ar-JO' or (spec.get('width'), spec.get('height'), spec.get('fps')) != (1080, 1920, 30):
        errors.append('Recipe must specify ar-JO, 1080x1920, 30 fps')
    scenes = spec.get('scenes') or []
    if len(scenes) != 6:
        errors.append('Exactly six story scenes are required')
    cursor = 0
    for number, scene in enumerate(scenes, 1):
        start, end = scene.get('startSeconds'), scene.get('endSeconds')
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or start != cursor or end <= start:
            errors.append(f'Scene {number}: invalid or non-contiguous timing')
            continue
        cursor = end
        for field, kind in [('media', 'video'), ('voiceFile', 'audio')]:
            value = scene.get(field)
            if not value:
                errors.append(f'Scene {number}: missing {field} path')
                continue
            path = base / value
            if not path.is_file():
                errors.append(f'Scene {number}: missing {field}: {path}')
                continue
            try:
                metadata = probe(path)
                streams = [s for s in metadata.get('streams', []) if s.get('codec_type') == kind]
                if not streams:
                    errors.append(f'Scene {number}: {field} has no {kind} stream')
                    continue
                duration = float(metadata['format']['duration'])
                length = end - start
                if kind == 'video':
                    if abs(duration - length) > 0.1:
                        errors.append(f'Scene {number}: video is {duration:.2f}s; scene needs {length:.2f}s')
                    stream = streams[0]
                    if (stream.get('width'), stream.get('height')) != (1080, 1920):
                        warnings.append(f'Scene {number}: source is not native 1080x1920')
                    if stream.get('r_frame_rate') != '30/1':
                        warnings.append(f'Scene {number}: source is not native 30 fps')
                elif duration > length + 0.05:
                    errors.append(f'Scene {number}: voice is {duration:.2f}s; scene holds {length:.2f}s')
            except (subprocess.CalledProcessError, KeyError, ValueError, json.JSONDecodeError) as exc:
                errors.append(f'Scene {number}: cannot probe {field}: {exc}')
    if cursor != spec.get('seconds') or cursor != 60:
        errors.append('Scene timing must cover exactly 60 seconds')
    voice = spec.get('voice') or {}
    if voice.get('approvalStatus') != 'verified-by-listening-and-rights-review':
        errors.append('Jordanian female voice and commercial rights have not been verified')
    bed = spec.get('soundBed') or {}
    bed_path = base / bed.get('file', '') if bed.get('file') else None
    if not bed_path or not bed_path.is_file():
        errors.append('Missing natural kitchen audio bed')
    elif bed.get('licenseStatus') != 'verified-commercial-use':
        errors.append('Natural kitchen audio bed rights are unverified')
    else:
        try:
            info = probe(bed_path)
            if not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
                errors.append('Natural kitchen bed has no audio stream')
            elif abs(float(info['format']['duration']) - 60) > 0.1:
                errors.append('Natural kitchen audio bed must last 60 seconds')
        except (subprocess.CalledProcessError, KeyError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f'Cannot probe kitchen audio bed: {exc}')
    music = spec.get('music') or {}
    if music.get('file'):
        errors.append('Music is specified but this ArtCraft adapter does not mix it yet; use a reviewed kitchen bed only')
    try:
        build_captions(spec, require_verified=True)
    except ValueError as exc:
        errors.append(str(exc))
    return errors, warnings


def run_recipe(spec, output, base=ROOT):
    errors, warnings = check(spec, base)
    if errors:
        raise ValueError('\n'.join(errors))
    if output.exists() or output.with_suffix('.fcproj').exists():
        raise ValueError(f'Output or FilmCraft project already exists: {output}')
    stem = output.with_suffix('')
    assembly = Path(f'{stem}.assembly')
    voice = Path(f'{stem}.voice-timeline.wav')
    captions = Path(f'{stem}.captions.ass')
    if assembly.exists() or voice.exists() or captions.exists():
        raise ValueError('Staging outputs already exist; choose a new output name')
    output.parent.mkdir(parents=True, exist_ok=True)
    assembly.mkdir()
    for index, scene in enumerate(spec['scenes']):
        (assembly / f'segment-{index:03d}.mp4').symlink_to((base / scene['media']).resolve())
    captions.write_text(build_captions(spec, require_verified=True), encoding='utf-8')
    inputs = []
    for scene in spec['scenes']:
        inputs += ['-i', str(base / scene['voiceFile'])]
    delayed = []
    for index, scene in enumerate(spec['scenes']):
        milliseconds = round(scene['startSeconds'] * 1000)
        delayed.append(f'[{index}:a]aresample=48000,adelay={milliseconds}|{milliseconds}[v{index}]')
    graph = ';'.join(delayed) + ';' + ''.join(f'[v{i}]' for i in range(len(delayed))) + f'amix=inputs={len(delayed)}:duration=longest:normalize=0,apad,atrim=duration=60[a]'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', graph,
                    '-map', '[a]', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', str(voice)], check=True)
    cmd = [sys.executable, str(ROOT / 'scripts/artcraft-finish.py'), '--assembly', str(assembly),
           '--voice', str(voice), '--bed', str(base / spec['soundBed']['file']),
           '--captions', str(captions), '--fps', '30', '--output', str(output)]
    subprocess.run(cmd, check=True)
    result = probe(output)
    video_streams = [stream for stream in result.get('streams', []) if stream.get('codec_type') == 'video']
    audio_streams = [stream for stream in result.get('streams', []) if stream.get('codec_type') == 'audio']
    if (not video_streams or not audio_streams or
            (video_streams[0].get('width'), video_streams[0].get('height')) != (1080, 1920) or
            video_streams[0].get('r_frame_rate') != '30/1' or
            abs(float(result['format']['duration']) - 60) > 0.15):
        raise ValueError(f'ArtCraft export failed technical format check: {output}')
    return warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path, default=ROOT / 'examples/recipes/avocado-egg-salad-ar-60.json')
    parser.add_argument('--output', type=Path, help='New MP4 path; omit to check readiness only')
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding='utf-8-sig'))
    errors, warnings = check(spec)
    for warning in warnings:
        print(f'WARNING: {warning}')
    if errors:
        for error in errors:
            print(f'BLOCKED: {error}')
        if args.output:
            return 2
    else:
        print('READY: six scenes, voice, audio rights and caption timing verified for ArtCraft finishing')
    if args.output:
        try:
            run_recipe(spec, args.output.resolve())
        except (ValueError, subprocess.CalledProcessError) as exc:
            parser.error(str(exc))
    return 0 if not errors else 1


if __name__ == '__main__':
    raise SystemExit(main())
