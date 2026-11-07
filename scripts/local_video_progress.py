"""Progress display for a local scenario, including runs started before this module existed."""
import argparse
import json
import math
import subprocess
import time
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def clip_is_complete(path):
    try:
        result = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
            '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,r_frame_rate',
            '-of', 'json', str(path)], stderr=subprocess.DEVNULL))['streams'][0]
        return result['nb_frames'] == '97' and result['r_frame_rate'] == '24/1'
    except (KeyError, IndexError, ValueError, subprocess.CalledProcessError):
        return False


def snapshot(scenario, work, output=None, active_clip=None, elapsed=0, observed=None):
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    shots = data['plan']['shots']
    total = sum(math.ceil(shot['seconds']/5) for shot in shots)
    completed = []
    for i, shot in enumerate(shots):
        for part in range(math.ceil(shot['seconds']/5)):
            candidates = list((work/'motion').glob(f'shot-{i:02d}-part-{part:02d}-*.mp4'))
            if any(clip_is_complete(path) for path in candidates): completed.append((i, part))
    count = len(completed)
    remaining = total-count
    if observed:
        rate = sum(observed)/len(observed)
    elif count >= 2:
        stamps = sorted(path.stat().st_mtime for path in (work/'motion').glob('shot-*-part-*.mp4') if clip_is_complete(path))
        rate = max(150, min(360, (stamps[-1]-stamps[0])/(len(stamps)-1)))
    else:
        rate = 220
    progress = min(95, round(5 + 90*count/total))
    if output and output.is_file(): progress = 100
    width = 24
    filled = round(width*progress/100)
    bar = '█'*filled + '░'*(width-filled)
    eta = max(0, remaining*rate + (120 if remaining or progress < 100 else 0) - elapsed)
    eta_text = 'complete' if progress == 100 else f'about {math.ceil(eta/60)} min remaining'
    phase = f'LTX clip {active_clip[0]+1}.{active_clip[1]+1} rendering' if active_clip else ('assembly or finishing' if remaining == 0 else 'motion generation')
    return f'[progress] {bar} {progress:3d}% | {count}/{total} motion clips | {phase} | {eta_text}'


def discover_output(scenario, work):
    base = scenario.name.removesuffix('.local-scenario.json').removesuffix('.json')
    candidates = sorted((ROOT/'outputs').glob(f'{base}-*.mp4'), key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates: return None
    voice = work/'voice-timeline.wav'
    if voice.is_file() and candidates[0].stat().st_mtime < voice.stat().st_mtime: return None
    return candidates[0]


def make_preview(scenario, work):
    from PIL import Image, ImageDraw, ImageFont
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    short = data['settings']['format'] == 'short'
    thumb_size = (180, 300) if short else (300, 180)
    cell_size = (thumb_size[0] + 20, thumb_size[1] + 48)
    clips = []
    for i, shot in enumerate(data['plan']['shots']):
        for part in range(math.ceil(shot['seconds']/5)):
            candidates = sorted((work/'motion').glob(f'shot-{i:02d}-part-{part:02d}-*.mp4'),
                                key=lambda item: item.stat().st_mtime, reverse=True)
            source = next((item for item in candidates if clip_is_complete(item)), None)
            if source: clips.append((i, part, source))
    if not clips:
        raise SystemExit('No completed motion clips yet. Try again after the first LTX clip finishes.')
    columns = min(4, len(clips))
    rows = math.ceil(len(clips)/columns)
    sheet = Image.new('RGB', (columns*cell_size[0], rows*cell_size[1]+54), '#151515')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((12, 14), f"{data['plan']['title'][:70]} | {len(clips)} completed clips", fill='white', font=font)
    for n, (i, part, source) in enumerate(clips):
        frame = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', '2', '-i', str(source),
                                         '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'])
        image = Image.open(BytesIO(frame)).convert('RGB')
        image.thumbnail(thumb_size)
        x = (n%columns)*cell_size[0]+10
        y = (n//columns)*cell_size[1]+46
        sheet.paste(image, (x+(thumb_size[0]-image.width)//2, y))
        draw.text((x, y+thumb_size[1]+7), f'Shot {i+1}, clip {part+1}', fill='white', font=font)
    destination = work/'preview-contact-sheet.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--watch', action='store_true', help='Refresh every 30 seconds')
    parser.add_argument('--preview', action='store_true', help='Save a contact sheet of completed motion clips')
    args = parser.parse_args()
    scenario = args.scenario.expanduser().resolve()
    work = (args.work_dir or ROOT/'storage/any-local'/scenario.stem).expanduser().resolve()
    output = args.output.expanduser().resolve() if args.output else None
    if args.preview and args.watch: parser.error('Use --preview or --watch, not both')
    if args.preview:
        print(snapshot(scenario, work, output or discover_output(scenario, work)), flush=True)
        print(f'Preview saved: {make_preview(scenario, work)}', flush=True)
        return
    while True:
        current_output = output or discover_output(scenario, work)
        print(snapshot(scenario, work, current_output), flush=True)
        if not args.watch or (current_output and current_output.is_file()): break
        time.sleep(30)


if __name__ == '__main__': main()
