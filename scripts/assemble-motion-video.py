"""Assemble generated motion clips and local audio into a reviewed video."""

import argparse
import json
import subprocess
from pathlib import Path

FPS = 24


def run(*args):
    subprocess.run([str(item) for item in args], check=True)


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames,width,height,r_frame_rate',
        '-of', 'json', str(path)]))['streams'][0]


def resolve(base, value):
    path = Path(value).expanduser()
    return (path if path.is_absolute() else base / path).resolve()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    manifest = args.manifest.expanduser().resolve()
    config = json.loads(manifest.read_text())
    base = manifest.parent
    output = args.output.expanduser().resolve()
    if output.exists():
        parser.error(f'Output already exists: {output}')
    aspect = config.get('aspect', 'short')
    if aspect not in ('short', 'wide'):
        parser.error('aspect must be short or wide')
    width, height = (720, 1280) if aspect == 'short' else (1280, 720)
    shots = config.get('shots')
    if not isinstance(shots, list) or not shots:
        parser.error('Manifest needs a nonempty shots array')
    total_frames = 0
    work = output.parent / (output.stem + '.assembly')
    work.mkdir(parents=True, exist_ok=True)
    segments = []
    for index, shot in enumerate(shots):
        source = resolve(base, shot['file'])
        if not source.is_file():
            parser.error(f'Missing motion clip: {source}')
        frames = round(float(shot['seconds']) * FPS)
        if frames < FPS // 2:
            parser.error(f'Shot {index} is too short')
        data = probe(source)
        if data['r_frame_rate'] != '24/1':
            parser.error(f'Shot {index} must be 24 fps')
        source_frames = int(data['nb_frames'])
        speed = (frames + 2) / source_frames
        destination = work / f'segment-{index:03d}.mp4'
        vf = (f'setpts={speed:.9f}*(PTS-STARTPTS),'
              f'minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,'
              f'scale={width}:{height}:force_original_aspect_ratio=increase,'
              f'crop={width}:{height},setsar=1,format=yuv420p')
        print(f'Assembling shot {index + 1}/{len(shots)}: {source.name}', flush=True)
        run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', source,
            '-vf', vf, '-frames:v', frames, '-an', '-c:v', 'libx264',
            '-crf', 18, '-preset', 'veryfast', '-r', FPS, destination)
        if int(probe(destination)['nb_frames']) != frames:
            raise RuntimeError(f'Wrong frame count in shot {index}')
        segments.append(destination)
        total_frames += frames
    listing = work / 'concat.txt'
    listing.write_text(''.join(f"file '{item}'\n" for item in segments))
    base_video = work / 'base.mp4'
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat',
        '-safe', '0', '-i', listing, '-c', 'copy', base_video)
    seconds = total_frames / FPS
    soundtrack = config.get('soundtrack')
    voice = config.get('voice')
    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
               '-i', base_video]
    if soundtrack:
        bed = resolve(base, soundtrack)
        if not bed.is_file():
            parser.error(f'Missing soundtrack: {bed}')
        command += ['-i', bed]
    else:
        command += ['-f', 'lavfi', '-t', str(seconds), '-i',
                    'anullsrc=r=48000:cl=stereo']
    if voice:
        spoken = resolve(base, voice['file'])
        if not spoken.is_file():
            parser.error(f'Missing voice recording: {spoken}')
        delay = round(float(voice.get('startSeconds', 0)) * 1000)
        if delay < 0:
            parser.error('Voice startSeconds cannot be negative')
        command += ['-i', spoken]
        audio_filter = (f'[1:a]aresample=48000[bed];[2:a]highpass=f=80,'
                        f'volume=2.1,adelay={delay}:all=1[voice];'
                        '[bed][voice]amix=inputs=2:duration=first:normalize=0,'
                        'loudnorm=I=-16:TP=-1.5:LRA=11[a]')
    else:
        audio_filter = ('[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[a]'
                        if soundtrack else '[1:a]aresample=48000[a]')
    output.parent.mkdir(parents=True, exist_ok=True)
    command += ['-filter_complex', audio_filter, '-map', '0:v', '-map', '[a]',
                '-t', str(seconds), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                '-movflags', '+faststart', output]
    run(*command)
    data = probe(output)
    if (int(data['nb_frames']) != total_frames or data['width'] != width
            or data['height'] != height or data['r_frame_rate'] != '24/1'):
        raise RuntimeError('Final video frame count, aspect, or rate is wrong')
    run('ffmpeg', '-v', 'error', '-xerror', '-i', output, '-f', 'null', '-')
    print(f'Completed {seconds:.3f} s {aspect} video: {output}')


if __name__ == '__main__':
    main()
