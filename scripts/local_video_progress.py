"""Progress display for a local scenario, including runs started before this module existed."""
import argparse
import json
import math
import subprocess
import time
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--watch', action='store_true', help='Refresh every 30 seconds')
    args = parser.parse_args()
    scenario = args.scenario.expanduser().resolve()
    work = (args.work_dir or ROOT/'storage/any-local'/scenario.stem).expanduser().resolve()
    output = args.output.expanduser().resolve() if args.output else None
    while True:
        current_output = output or discover_output(scenario, work)
        print(snapshot(scenario, work, current_output), flush=True)
        if not args.watch or (current_output and current_output.is_file()): break
        time.sleep(30)


if __name__ == '__main__': main()
