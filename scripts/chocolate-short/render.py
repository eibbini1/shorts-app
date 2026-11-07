"""Render a 30-second chocolate Short entirely from local LTX motion clips."""

import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get('CHOCOLATE_WORK_DIR', ROOT / 'storage/chocolate-short-local')).resolve()
OUT = Path(os.environ.get('CHOCOLATE_OUTPUT', WORK / 'chocolate-short-30s.mp4')).resolve()
MOTION_DIR = ROOT / 'storage/chocolate-short-local/motion'
FPS = 24
FRAMES = [120] * 6
assert sum(FRAMES) == 720
CLIPS = [MOTION_DIR / f'{name}.mp4' for name in
         ('crack-to-reveal', 'lift', 'ribbon', 'scoop', 'hero', 'finish')]
CLIP_FRAMES = [120] * 6
assert sum(CLIP_FRAMES) == 720


def run(*args):
    print('Running:', ' '.join(str(x) for x in args[:8]), '...', flush=True)
    subprocess.run([str(x) for x in args], check=True)


def motion_segment(source, frames, destination):
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames,r_frame_rate', '-of', 'json', str(source),
    ]))['streams'][0]
    if probe['r_frame_rate'] != '24/1':
        raise RuntimeError(f'Expected 24 fps LTX clip: {source}')
    source_frames = int(probe['nb_frames'])
    # minterpolate drops the final two timestamps; extend the input slightly.
    speed = (frames + 2) / source_frames
    vf = (
        f'setpts={speed:.9f}*(PTS-STARTPTS),'
        f'minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,'
        'scale=768:1280,crop=720:1280:24:0,'
        'eq=contrast=1.04:saturation=1.06:gamma=1.02,setsar=1,format=yuv420p'
    )
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', source,
        '-vf', vf, '-frames:v', frames, '-an', '-c:v', 'libx264',
        '-preset', 'veryfast', '-crf', 18, '-r', FPS, '-pix_fmt', 'yuv420p',
        destination)
    out_probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames', '-of', 'json', str(destination),
    ]))['streams'][0]
    if int(out_probe['nb_frames']) != frames:
        raise RuntimeError(f'Wrong frame count in {destination}')


def ass_time(seconds):
    centis = round(seconds * 100)
    hours, rem = divmod(centis, 360000)
    minutes, rem = divmod(rem, 6000)
    secs, centis = divmod(rem, 100)
    return f'{hours}:{minutes:02d}:{secs:02d}.{centis:02d}'


def wrap(text, width=24):
    lines = []
    current = ''
    for word in text.split():
        if current and len(current) + 1 + len(word) > width:
            lines.append(current)
            current = word
        else:
            current = f'{current} {word}'.strip()
    if current:
        lines.append(current)
    return r'\N'.join(lines)


def make_ass(scenes):
    header = '''[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Poppins,49,&H00FFFFFF,&H00FFFFFF,&H8A111013,&H60000000,-1,0,0,0,100,100,0,0,1,4,2,8,40,40,180,1
Style: Brand,Poppins,24,&H004BA2C9,&H004BA2C9,&H80000000,&H00000000,-1,0,0,0,100,100,2,0,1,1,0,8,30,30,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    lines = [header, f'Dialogue: 0,{ass_time(0)},{ass_time(30)},Brand,,0,0,0,,BILLIONAIRE BITES\n']
    cursor = 0.0
    for index, (scene, frames) in enumerate(zip(scenes, FRAMES)):
        duration = frames / FPS
        spoken = duration - 0.68
        parts = re.split(r'(?<=[.!?])\s+', scene['text'])
        weights = [max(1, len(part.split())) for part in parts]
        total = sum(weights)
        point = cursor + 0.18
        for j, (part, weight) in enumerate(zip(parts, weights)):
            end = cursor + duration - 0.35 if j == len(parts) - 1 else point + spoken * weight / total
            text = '{\\fad(100,100)}' + wrap(part)
            lines.append(f'Dialogue: 0,{ass_time(point)},{ass_time(end)},Caption,,0,0,0,,{text}\n')
            point = end
        cursor += duration
    (WORK / 'captions.ass').write_text(''.join(lines))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        raise SystemExit(f'Output already exists: {OUT}. Choose another path to preserve it.')
    scenes = json.loads((WORK / 'scenes.json').read_text())
    segments = []

    for index, (source, frames) in enumerate(zip(CLIPS, CLIP_FRAMES)):
        if not source.is_file():
            raise SystemExit(f'Missing motion clip: {source}. Run npm run chocolate:motion:mac first.')
        output = WORK / f'v{index:02d}-motion.mp4'
        motion_segment(source, frames, output)
        segments.append(output)

    (WORK / 'video-list.txt').write_text(''.join(f"file '{p}'\n" for p in segments))
    base = WORK / 'base.mp4'
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat',
        '-safe', '0', '-i', WORK / 'video-list.txt', '-c', 'copy', base)

    audio_segments = []
    for index, frames in enumerate(FRAMES):
        duration = frames / FPS
        output = WORK / f'a{index:02d}.wav'
        run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', scenes[index]['audio'],
            '-af', f'aresample=48000,aformat=channel_layouts=stereo,adelay=180:all=1,apad,atrim=duration={duration:.6f}',
            '-c:a', 'pcm_s16le', output)
        audio_segments.append(output)
    (WORK / 'audio-list.txt').write_text(''.join(f"file '{p}'\n" for p in audio_segments))
    narration = WORK / 'narration.wav'
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat',
        '-safe', '0', '-i', WORK / 'audio-list.txt', '-c', 'copy', narration)

    make_ass(scenes)
    ass_filter = f"ass={WORK / 'captions.ass'}:fontsdir={ROOT / 'assets/fonts'}"
    music_mode = os.environ.get('CHOCOLATE_MUSIC_MODE', 'original')
    if music_mode not in ('original', 'none'):
        raise SystemExit('CHOCOLATE_MUSIC_MODE must be original or none')
    audio_graph = (
        "[1:a]highpass=f=80,acompressor=threshold=0.12:ratio=2:attack=8:release=120[voice];"
        "[2:a]volume=0.045[bed];[3:a]volume=0.12[fx];[4:a]volume=0.55[beat];"
        "[voice][bed][fx][beat]amix=inputs=4:duration=first:normalize=0,"
        "loudnorm=I=-16:TP=-1.5:LRA=11[a]"
        if music_mode == 'original' else
        "[1:a]highpass=f=80,acompressor=threshold=0.12:ratio=2:attack=8:release=120[voice];"
        "[3:a]volume=0.12[fx];[voice][fx]amix=inputs=2:duration=first:normalize=0,"
        "loudnorm=I=-16:TP=-1.5:LRA=11[a]"
    )
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', base,
        '-i', narration, '-i', WORK / 'ambient.wav', '-i', WORK / 'sfx.wav', '-i', WORK / 'beat.wav',
        '-filter_complex',
        f"[0:v]{ass_filter},fade=t=out:st=29.7:d=0.3[v];"
        + audio_graph,
        '-map', '[v]', '-map', '[a]', '-t', 30, '-c:v', 'libx264',
        '-preset', 'veryfast', '-crf', 19, '-pix_fmt', 'yuv420p',
        '-r', FPS, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT)
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames',
        '-of', 'json', str(OUT),
    ]))
    video = next(stream for stream in probe['streams'] if stream['codec_name'] == 'h264')
    if (abs(float(probe['format']['duration']) - 30) > 0.02
            or video['width'] != 720 or video['height'] != 1280
            or video['r_frame_rate'] != '24/1' or int(video['nb_frames']) != 720):
        raise RuntimeError('Rendered video did not meet the 30-second portrait specification')
    run('ffmpeg', '-v', 'error', '-xerror', '-i', OUT, '-f', 'null', '-')
    review = OUT.with_suffix('.review.png')
    run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', OUT,
        '-vf', 'fps=1/3,scale=180:320,tile=5x2', '-frames:v', 1, review)
    print(OUT)


if __name__ == '__main__':
    main()
