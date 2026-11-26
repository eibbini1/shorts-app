"""Assemble generated motion clips and local audio into a reviewed video."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_standards import loudnorm_filter  # noqa: E402

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


def build_segment_filter(start_frame, end_frame, target_frames, width, height, fps=FPS):
    """Build FFmpeg video filter for a shot segment.

    Skips CPU bidirectional optical flow (minterpolate) when native clip frames already
    satisfy target_frames within the 8k+1 margin (target_frames <= source_frames <= target_frames + 2),
    preserving native motion fidelity and avoiding optical-flow CPU overhead.
    """
    source_frames = end_frame - start_frame
    scale_crop = (f'scale={width}:{height}:force_original_aspect_ratio=increase,'
                  f'crop={width}:{height},setsar=1,format=yuv420p')
    if target_frames <= source_frames <= target_frames + 2:
        exact_end = start_frame + target_frames
        return f'trim=start_frame={start_frame}:end_frame={exact_end},setpts=PTS-STARTPTS,{scale_crop}'
    speed = (target_frames + 2) / source_frames
    return (f'trim=start_frame={start_frame}:end_frame={end_frame},'
            f'setpts={speed:.9f}*(PTS-STARTPTS),'
            f'minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,'
            f'tpad=stop_mode=clone:stop_duration=0.125,'
            f'trim=end_frame={target_frames},setpts=PTS-STARTPTS,'
            f'{scale_crop}')


def assemble_segment(index, total_shots, shot, base, work, width, height):
    source = resolve(base, shot['file'])
    if not source.is_file():
        raise ValueError(f'Missing motion clip: {source}')
    frames = round(float(shot['seconds']) * FPS)
    if frames < FPS // 2:
        raise ValueError(f'Shot {index} is too short')
    data = probe(source)
    if data['r_frame_rate'] != '24/1':
        raise ValueError(f'Shot {index} must be 24 fps')
    source_frames = int(data['nb_frames'])
    start_frame = int(shot.get('startFrame', 0))
    end_frame = int(shot.get('endFrame', source_frames))
    if not 0 <= start_frame < end_frame <= source_frames:
        raise ValueError(f'Shot {index} has invalid source frame bounds')
    destination = work / f'segment-{index:03d}.mp4'
    vf = build_segment_filter(start_frame, end_frame, frames, width, height, fps=FPS)
    fast = 'minterpolate' not in vf
    mode = 'native-trim' if fast else 'minterpolate'
    print(f'Assembling shot {index + 1}/{total_shots} ({mode}): {source.name}', flush=True)
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', source,
        '-vf', vf, '-frames:v', frames, '-an', '-c:v', 'libx264',
        '-crf', 18, '-preset', 'veryfast', '-r', FPS, destination)
    if int(probe(destination)['nb_frames']) != frames:
        raise RuntimeError(f'Wrong frame count in shot {index}')
    return destination, frames


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
    max_workers = max(1, min(len(shots), int(os.environ.get('SHORTS_ASSEMBLE_WORKERS', min(4, os.cpu_count() or 2)))))
    try:
        if max_workers == 1:
            built = [assemble_segment(i, len(shots), shot, base, work, width, height) for i, shot in enumerate(shots)]
        else:
            with ThreadPoolExecutor(max_workers=max_workers) as pool:
                futures = [pool.submit(assemble_segment, i, len(shots), shot, base, work, width, height)
                           for i, shot in enumerate(shots)]
                built = [future.result() for future in futures]
    except ValueError as error:
        parser.error(str(error))
    segments = [item[0] for item in built]
    total_frames = sum(item[1] for item in built)
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
                        f'{loudnorm_filter()}[a]')
    else:
        audio_filter = (f'[1:a]aresample=48000,{loudnorm_filter()}[a]'
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
