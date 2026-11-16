#!/usr/bin/env python3
"""Finish rendered shots with the local ArtCraft CLIs: SoundCraft mix, EffectCraft title, FilmCraft 1080x1920 edit.

Opt-in finishing path. It does not generate footage; it assembles the motion segments that
render-any-local.py already wrote. Never overwrites an existing output.
"""
import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'storage/tools/artcraft'
PRESET = 'Match Source – Adaptive Medium Bitrate'


def tool(name):
    path = TOOLS / f'{name}-cli'
    if not path.is_file():
        raise SystemExit(f'{name}-cli missing in {TOOLS}. Run npm run artcraft:check:mac.')
    return str(path)


def run(cmd, cwd=None):
    done = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, cwd=cwd)
    if done.returncode:
        raise SystemExit(f'{Path(str(cmd[0])).name} failed: {" ".join(map(str, cmd[1:4]))}\n{done.stderr[-600:]}')
    return done.stdout


def as_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


def loudness(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
                          'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    data = json.loads(out[out.rindex('{'):out.rindex('}') + 1])
    return float(data['input_i']), float(data['input_tp'])


def soundcraft_mix(source, target, lufs=-16.0, peak=-1.0):
    """Clip gain into SoundCraft's Compressor/Limiter, bounced; gain is searched to hit the loudness target."""
    cli = tool('soundcraft')
    gain, best = 12.0, None
    for _ in range(6):
        if target.exists():
            target.unlink()
        run([cli, 'run', '--cmd', f'file.import_audio={json.dumps({"path": str(source)})}',
             '--cmd', f'clip.gain={json.dumps({"clips": [3], "db": round(gain, 1)})}',
             '--cmd', 'mix.insert={"track":2,"slot":0,"plugin":"compressor"}',
             '--cmd', 'mix.insert_params={"track":2,"slot":0,"params":{"threshold":-6,"ratio":20,"attack":0.5,'
                      '"release":60,"knee":0,"makeup":0,"lookahead":2}}',
             '--bounce', target])
        got, tp = loudness(target)
        best = {'gainDb': round(gain, 1), 'lufs': got, 'truePeakDb': tp}
        if abs(got - lufs) <= 0.6 and tp <= peak:
            break
        gain += (lufs - got) if tp <= peak else -1.5
    return best


def effectcraft_title(text, target, work, seconds=3.0):
    """A short top-of-frame title with a fade and settle, rendered as ProRes 4444 with alpha."""
    cli = tool('effectcraft')
    project = work / 'title.ecproj'
    run([cli, '--empty', '--save-as', project, 'exec', 'comp.new', '--params',
         json.dumps({'name': 'Title', 'width': 1080, 'height': 1920, 'frameRate': 24, 'duration': seconds}), '--save'],
        cwd=work)
    code = ("var c=app.project.item(1);var t=c.layers.addText(%s);var p=t.property('Source Text');var d=p.value;"
            "d.fontSize=104;d.applyFill=true;d.fillColor=[1,0.97,0.9];try{d.font='Lora-Bold';}catch(e){}d.justification=ParagraphJustification.CENTER_JUSTIFY;"
            "d.applyStroke=true;d.strokeColor=[0.1,0.06,0.03];d.strokeWidth=6;p.setValue(d);"
            "t.property('Position').setValue([540,330]);var o=t.property('Opacity');"
            "o.setValueAtTime(0,0);o.setValueAtTime(0.4,100);o.setValueAtTime(%s,100);o.setValueAtTime(%s,0);"
            "var s=t.property('Scale');s.setValueAtTime(0,[88,88]);s.setValueAtTime(0.5,[100,100]);'ok';"
            % (json.dumps(text), seconds - 0.6, seconds - 0.1))
    result = as_json(run([cli, '--project', project, 'exec', 'script.run', '--params', json.dumps({'code': code}),
                          '--save'], cwd=work))
    if not result.get('result', {}).get('ok'):
        raise SystemExit(f'EffectCraft title script failed: {result}')
    run([cli, '--project', project, 'render', '--comp', '1', '--out', target, '--format', 'prores',
         '--prores', '4444', '--channels', 'rgba', '--audio', 'off'], cwd=work)


def captions_overlay(ass, target, seconds):
    """The pipeline's own Lora gold-word captions, drawn at 1080x1920 on a transparent layer (not upscaled)."""
    def esc(path):
        return str(path).replace('\\', '/').replace(':', '\\:').replace("'", "\\'")
    vf = f"subtitles='{esc(ass)}':fontsdir='{esc(ROOT / 'assets/fonts')}':alpha=1"
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i',
         f'color=c=0x00000000:s=1080x1920:r=24:d={seconds},format=rgba', '-vf', vf, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', target])


def filmcraft_edit(segments, mix, overlays, output, project, sharpen):
    cli = tool('filmcraft')

    def call(*parts, new=False, save=True):
        cmd = [cli] + (['--save-as', project] if new else ['--project', project])
        if save and not new:
            cmd.append('--save')
        return as_json(run(cmd + list(parts)))

    call('exec', 'file.newProject', f'name={output.stem}', new=True)
    call('exec', 'file.newSequence', f'name={output.stem}', 'width=1080', 'height=1920', 'fps=24',
         f'video={1 + len(overlays)}', 'audio=1')
    items = call('import', *segments)['items']
    clips = call('exec', 'timeline.place', json.dumps({'items': items, 'frame': 0, 'audio': False}))['clips']
    for clip in clips:                                   # 720x1280 shots fill the 1080x1920 frame
        call('exec', 'effects.setParam', json.dumps({'clip': clip, 'effect': 'motion', 'param': 'scale', 'value': 150}))
        if sharpen:
            index = call('exec', 'effects.apply', json.dumps({'clips': [clip], 'effect': 'unsharp_mask'}))['applied'][0]['index']
            call('exec', 'effects.setParam', json.dumps({'clip': clip, 'effect': index, 'param': 'amount', 'value': sharpen}))
    audio = call('import', mix)['items'][0]
    call('exec', 'timeline.place', json.dumps({'item': audio, 'track': 'A1', 'frame': 0, 'video': False}))
    for number, layer in enumerate(overlays, start=2):
        over = call('import', layer)['items'][0]
        call('exec', 'timeline.place', json.dumps({'item': over, 'track': f'V{number}', 'frame': 0, 'audio': False}))
    return call('export', output, '--preset', PRESET, save=False)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--assembly', required=True, type=Path, help='Folder with segment-000.mp4 ... from render-any-local.py')
    p.add_argument('--sfx', type=Path, help='A raw sound track (.wav) for silent films')
    p.add_argument('--audio', type=Path, help='Any finished audio or video whose sound (voice + effects) should be remastered')
    p.add_argument('--captions', type=Path, help='The .ass captions written by finish-local-video.py')
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--title', help='Optional short top-of-frame title for the first three seconds')
    p.add_argument('--sharpen', type=float, default=30, help='FilmCraft unsharp mask amount after the upscale, 0 = off')
    args = p.parse_args()
    segments = sorted(args.assembly.resolve().glob('segment-*.mp4'))
    output = args.output.resolve()
    project = output.with_suffix('.fcproj')
    source_audio = args.audio or args.sfx
    if not segments or not source_audio or not source_audio.is_file():
        p.error('Need segment-*.mp4 files and --sfx or --audio')
    if output.exists() or project.exists():
        p.error('Use a new output path; this tool never overwrites a film')
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='artcraft-finish-') as tmp:
        work = Path(tmp)
        mix = output.with_suffix('.soundcraft.wav')
        raw = work / 'source.wav'
        run(['ffmpeg', '-y', '-v', 'error', '-i', source_audio.resolve(), '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', raw])
        mixed = soundcraft_mix(raw, mix)
        overlays = []
        if args.captions:
            if not args.captions.is_file():
                p.error(f'No captions file: {args.captions}')
            seconds = sum(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                                         '-of', 'csv=p=0', str(s)], text=True)) for s in segments)
            layer = output.with_suffix('.captions.mov')
            captions_overlay(args.captions.resolve(), layer, round(seconds, 3))
            overlays.append(layer)
        if args.title:
            layer = output.with_suffix('.title.mov')
            effectcraft_title(args.title, layer, work)
            overlays.append(layer)
        exported = filmcraft_edit(segments, mix, overlays, output, project, args.sharpen)
    if not output.is_file() or not output.stat().st_size:
        raise SystemExit(f'FilmCraft export failed: {exported}')
    report = {'output': str(output), 'project': str(project), 'segments': [s.name for s in segments],
              'soundcraftMix': mixed, 'title': args.title, 'captions': str(args.captions) if args.captions else None, 'sharpen': args.sharpen,
              'elapsedSeconds': round(time.monotonic() - started, 1), 'export': exported.get('result')}
    output.with_suffix('.artcraft.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
