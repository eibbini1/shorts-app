#!/usr/bin/env python3
"""Make an editable FilmCraft project and a graded export from a finished local MP4."""
import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def filmcraft_cli():
    candidates = (os.environ.get('SHORTS_FILMCRAFT_CLI'),
                  str(ROOT / 'storage/tools/artcraft/filmcraft-cli'),
                  shutil.which('filmcraft-cli'))
    cli = next((Path(item) for item in candidates if item and Path(item).is_file()), None)
    if cli is None:
        raise SystemExit('FilmCraft CLI missing. Run npm run artcraft:check:mac and install the matching macOS CLI.')
    actual = subprocess.check_output([str(cli), '--version'], text=True).strip().split()[-1]
    app_info = Path('/Applications/FilmCraft.app/Contents/Info.plist')
    if app_info.is_file():
        expected = plistlib.loads(app_info.read_bytes()).get('CFBundleShortVersionString')
        if expected and actual != expected:
            raise SystemExit(f'FilmCraft CLI {actual} does not match desktop {expected}; update the CLI first.')
    return cli, actual


def call(cli, project, *parts, save=False, new=False):
    cmd = [str(cli)]
    cmd += ['--save-as', str(project)] if new else ['--project', str(project)]
    if save:
        cmd.append('--save')
    cmd.extend(map(str, parts))
    done = subprocess.run(cmd, check=True, capture_output=True, text=True)
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return done.stdout


def media_info(video):
    raw = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                   '-show_entries', 'stream=width,height,avg_frame_rate',
                                   '-of', 'json', str(video)], text=True)
    return json.loads(raw)['streams'][0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--project', type=Path)
    parser.add_argument('--contrast', type=float, default=6, help='Small FilmCraft contrast adjustment, 0–15')
    args = parser.parse_args()
    video = args.video.resolve()
    if not video.is_file():
        parser.error(f'No video: {video}')
    if not 0 <= args.contrast <= 15:
        parser.error('Contrast must be 0–15 for the controlled local finishing pass')
    output = (args.output or video.with_name(video.stem + '.filmcraft.mp4')).resolve()
    project = (args.project or output.with_suffix('.fcproj')).resolve()
    if output == video or output.exists() or project.exists():
        parser.error('Use new output and project paths; this tool never overwrites an existing film')
    output.parent.mkdir(parents=True, exist_ok=True)
    project.parent.mkdir(parents=True, exist_ok=True)
    cli, version = filmcraft_cli()
    stream = media_info(video)
    num, den = map(int, stream['avg_frame_rate'].split('/'))
    if num <= 0 or den <= 0:
        parser.error('Could not read source frame rate')
    started = time.monotonic()
    call(cli, project, 'exec', 'file.newProject', f'name={video.stem}', new=True)
    call(cli, project, 'exec', 'file.newSequence', f'name={video.stem}',
         f'width={stream["width"]}', f'height={stream["height"]}', f'fps={num / den}',
         'video=1', 'audio=1', save=True)
    imported = call(cli, project, 'import', video, save=True)
    if imported.get('errors') or len(imported.get('items', [])) != 1:
        raise SystemExit(f'FilmCraft could not import the finished video: {imported}')
    placed = call(cli, project, 'exec', 'timeline.place', f'item={imported["items"][0]}', 'frame=0', save=True)
    if not placed.get('clips'):
        raise SystemExit('FilmCraft did not place a video clip on the timeline')
    if args.contrast:
        clip = placed['clips'][0]
        applied = call(cli, project, 'exec', 'effects.apply',
                       json.dumps({'clips': [clip], 'effect': 'brightness_contrast'}), save=True)
        index = applied['applied'][0]['index']
        call(cli, project, 'exec', 'effects.setParam',
             json.dumps({'clip': clip, 'effect': index, 'param': 'contrast', 'value': args.contrast}), save=True)
    exported = call(cli, project, 'export', output, '--preset', 'Match Source – Adaptive Medium Bitrate')
    if not output.is_file() or not output.stat().st_size:
        raise SystemExit(f'FilmCraft export failed: {exported}')
    report = {'input': str(video), 'inputSha256': hashlib.sha256(video.read_bytes()).hexdigest(),
              'output': str(output), 'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'project': str(project), 'filmcraftCliVersion': version, 'contrast': args.contrast,
              'elapsedSeconds': round(time.monotonic() - started, 2), 'export': exported}
    report_path = output.with_suffix('.filmcraft.json')
    report_path.write_text(json.dumps(report, indent=2, default=str) + '\n')
    print(f'FilmCraft export: {output} ({report["elapsedSeconds"]}s)')
    print(f'Editable project: {project}')
    print(f'Report: {report_path}')


if __name__ == '__main__':
    main()
