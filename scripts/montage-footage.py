#!/usr/bin/env python3
"""Build a fast, story-ordered montage from existing moving footage.

Example:
  python3 scripts/montage-footage.py --footage assets/my-clips --output outputs/my-montage.mp4 --seconds 30 --title 'The First Bite'
Use --check to print the cut plan without encoding. Clips are sorted by filename; name them 01-hook.mp4, 02-prep.mp4, etc.
"""
import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

FPS = 24
TRANSITION = 0.20
EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm'}
FONT = Path(__file__).resolve().parents[1] / 'assets/fonts/Poppins-Bold.ttf'


def probe(path):
    data = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,width,height', '-of', 'json', str(path)], text=True))
    video = next((stream for stream in data.get('streams', []) if stream['codec_type'] == 'video'), None)
    if not video:
        raise ValueError(f'No video stream: {path.name}')
    return float(data['format']['duration']), any(s['codec_type'] == 'audio' for s in data['streams'])


def slots_for(seconds, count):
    # Use each ordered source once, up to about one cut every 2.5 s.
    pattern = [2.0, 2.4, 1.8, 2.8, 2.1, 2.6, 1.9, 2.7]
    weights = [pattern[i % len(pattern)] for i in range(count)]
    slots = [round(seconds * weight / sum(weights) * FPS) / FPS for weight in weights[:-1]]
    slots.append(seconds - sum(slots))
    return slots


def cut_plan(files, seconds, transition):
    metadata = {path: probe(path) for path in files}
    if len(files) < 3:
        raise ValueError('Use at least three distinct moving clips for a montage.')
    if seconds < 6 or seconds > 180:
        raise ValueError('Montage length must be 6–180 seconds.')
    count = min(len(files), math.ceil(seconds / 2.5))
    if transition:
        slots = slots_for(seconds, count)
    else:
        slots = [round(seconds / count * FPS) / FPS for _ in range(count-1)]
        slots.append(seconds - sum(slots))
    ordered = [files[round(i * (len(files)-1) / (count-1))] for i in range(count)]
    plan = []
    for index, display in enumerate(slots):
        raw = display + (transition if index < len(slots)-1 else 0)
        source = ordered[index]
        if metadata[source][0] < raw - 0.02:
            raise ValueError(f'{source.name} is too short for cut {index+1} ({raw:.1f}s needed). Add a longer clip or request a shorter video; footage is never silently repeated.')
        plan.append({'source': source, 'start': 0.0, 'length': round(raw, 3),
                     'display': round(display, 3), 'audio': metadata[source][1]})
    return plan


def run(args):
    subprocess.run([str(item) for item in args], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--footage', required=True, type=Path, help='Folder of ordered, moving clips (01-hook.mp4, 02-action.mp4, ...)')
    parser.add_argument('--output', type=Path, help='MP4 destination; required unless --check is used')
    parser.add_argument('--seconds', type=float, default=30)
    parser.add_argument('--format', choices=['vertical', 'wide'], default='vertical')
    parser.add_argument('--title', default='')
    parser.add_argument('--story', default='', help='One-sentence beginning-to-end story; saved in the montage plan')
    parser.add_argument('--music', type=Path, help='Optional music file you have rights to use')
    parser.add_argument('--voice', type=Path, help='Optional narration WAV/MP3, mixed above footage and music')
    parser.add_argument('--check', action='store_true', help='Validate inputs and show the cut plan without encoding')
    a = parser.parse_args()
    if not a.footage.is_dir(): parser.error(f'No footage folder: {a.footage}')
    files = sorted(p for p in a.footage.iterdir() if p.suffix.lower() in EXTENSIONS and p.is_file())
    if not files: parser.error('No supported footage found (mp4, mov, m4v, webm)')
    if not a.check and not a.output: parser.error('--output is required unless --check is used')
    if a.output and a.output.exists(): parser.error(f'Output already exists: {a.output}')
    for path in (a.music, a.voice):
        if path and not path.is_file(): parser.error(f'Missing audio: {path}')
    if a.seconds * FPS != round(a.seconds * FPS): parser.error('Duration must align to a 24 fps frame')
    if len(a.title) > 100: parser.error('--title must be at most 100 characters')
    try:
        durations = [probe(path)[0] for path in files]
        if sum(durations) + 0.001 < a.seconds:
            parser.error(f'Only {sum(durations):.1f}s of footage for a {a.seconds:g}s montage. Add real moving footage; clips are not silently repeated or frozen.')
        transition = TRANSITION if sum(durations) >= a.seconds + TRANSITION * (len(slots_for(a.seconds, min(len(files), math.ceil(a.seconds / 2.5))))-1) + 0.05 else 0.0
        try:
            plan = cut_plan(files, a.seconds, transition)
        except ValueError:
            transition = 0.0
            plan = cut_plan(files, a.seconds, transition)
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    print(f'Preflight passed: {len(files)} source clips, {len(plan)} cuts, {a.seconds:g}s, {a.format}, {"soft fades" if transition else "clean cuts"}.', flush=True)
    for i, cut in enumerate(plan, 1):
        print(f'  {i:02d} {cut["source"].name} {cut["start"]:.1f}–{cut["start"]+cut["length"]:.1f}s → {cut["display"]:.1f}s on screen', flush=True)
    if not any(c['audio'] for c in plan) and not a.music and not a.voice:
        print('Warning: source clips have no audio; the montage will be silent.', flush=True)
    if a.check: return
    width, height = (720, 1280) if a.format == 'vertical' else (1280, 720)
    output = a.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='shorts-montage-') as directory:
        tmp = Path(directory)
        prepared = []
        for i, cut in enumerate(plan):
            target = tmp / f'cut-{i:03d}.mp4'
            vf = (f'fps={FPS},scale={width}:{height}:force_original_aspect_ratio=increase,'
                  f'crop={width}:{height},setsar=1,eq=contrast=1.04:saturation=1.06,format=yuv420p')
            cmd = ['ffmpeg', '-y', '-v', 'error', '-ss', cut['start'], '-i', cut['source']]
            if not cut['audio']:
                cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
            cmd += ['-t', cut['length'], '-map', '0:v:0', '-map', '0:a:0' if cut['audio'] else '1:a:0',
                    '-vf', vf, '-r', FPS, '-ar', 48000, '-ac', 2, '-c:v', 'libx264', '-preset', 'veryfast',
                    '-crf', 19, '-c:a', 'aac', '-b:a', '160k', '-shortest', target]
            run(cmd)
            prepared.append(target)
        cmd = ['ffmpeg', '-y', '-v', 'error']
        for item in prepared: cmd += ['-i', item]
        graph = []
        video, audio = '[0:v]', '[0:a]'
        elapsed = plan[0]['display']
        if transition:
            for i in range(1, len(plan)):
                nv, na = f'[v{i}]', f'[a{i}]'
                graph.append(f'{video}[{i}:v]xfade=transition=fade:duration={transition}:offset={elapsed:.3f}{nv}')
                graph.append(f'{audio}[{i}:a]acrossfade=d={transition}:c1=tri:c2=tri{na}')
                video, audio = nv, na
                elapsed += plan[i]['display']
        else:
            joined = ''.join(f'[{i}:v][{i}:a]' for i in range(len(plan)))
            graph.append(f'{joined}concat=n={len(plan)}:v=1:a=1[vcat][acat]')
            video, audio = '[vcat]', '[acat]'
        if a.title:
            title_file = tmp / 'title.txt'
            title_file.write_text(a.title, encoding='utf-8')
            graph.append(f"{video}drawtext=fontfile='{FONT}':textfile='{title_file}':fontcolor=white:fontsize={max(32, width//18)}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.12:enable='lt(t,2.2)'[titled]")
            video = '[titled]'
        graph.append(f'{audio}volume=0.75[amb]')
        mixed = '[amb]'
        next_input = len(prepared)
        if a.music:
            cmd += ['-stream_loop', '-1', '-i', a.music]
            graph.append(f'[{next_input}:a]aresample=48000,volume=0.12[music]')
            graph.append('[amb][music]amix=inputs=2:duration=first:normalize=0[withmusic]')
            mixed = '[withmusic]'
            next_input += 1
        if a.voice:
            cmd += ['-i', a.voice]
            graph.append(f'[{next_input}:a]aresample=48000,volume=1.5,asplit=2[voicekey][voicemix]')
            graph.append(f'{mixed}[voicekey]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=300[duck]')
            graph.append('[duck][voicemix]amix=inputs=2:duration=first:normalize=0[mixed]')
            mixed = '[mixed]'
        graph.append(f'{mixed}loudnorm=I=-16:TP=-1.5:LRA=11[outa]')
        run(cmd + ['-filter_complex', ';'.join(graph), '-map', video, '-map', '[outa]',
                   '-t', a.seconds, '-r', FPS, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', 18,
                   '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output])
    actual = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,width,height', '-of', 'json', str(output)], text=True))
    if abs(float(actual['format']['duration'])-a.seconds)>0.08:
        raise RuntimeError(f'Export duration mismatch: {actual["format"]["duration"]}s')
    if not any(s['codec_type']=='audio' for s in actual['streams']): raise RuntimeError('Export has no audio stream')
    output.with_suffix('.montage.json').write_text(json.dumps({
        'title': a.title, 'story': a.story, 'seconds': a.seconds, 'format': a.format,
        'transition': 'soft fade' if transition else 'clean cut',
        'cuts': [{'file': str(c['source'].resolve()), 'startSeconds': c['start'],
                  'sourceSeconds': c['length'], 'screenSeconds': c['display']} for c in plan],
        'music': str(a.music.resolve()) if a.music else None,
        'voice': str(a.voice.resolve()) if a.voice else None,
    }, indent=2)+'\n')
    print(f'Montage ready: {output} ({a.seconds:g}s, {width}×{height}, {len(plan)} cuts)', flush=True)


if __name__ == '__main__': main()
