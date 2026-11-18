"""Render a reviewed local scenario with FLUX, LTX, Kokoro and FFmpeg."""
import re
import argparse
import hashlib
import json
import math
import os
import subprocess
import time
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from local_video_progress import snapshot
from studio_frames import read_manifest, write_manifest
from first_checks import check_still, check_clip
from presentation_mode import choose as choose_presentation
from select_still_local import select as select_still_local

ROOT = Path(__file__).resolve().parents[1]
FPS = 24
STILL_REVIEW_ATTEMPTS = 2


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


def prep_still(work, reference):
    """PhotoCraft still prep before motion: auto contrast + unsharp mask (keeps the warm cast; auto tone cooled it)."""
    cli = ROOT / 'storage/tools/artcraft/photocraft-cli'
    if not cli.is_file():
        raise SystemExit('--prep-stills needs storage/tools/artcraft/photocraft-cli (npm run artcraft:check:mac)')
    target = work / 'refs' / f'prep-{file_hash(reference)[:12]}.png'
    if not target.is_file():
        subprocess.run([str(cli), 'run', str(reference), '--no-gpu', '--cmd', 'image.autoContrast',
                        '--cmd', 'filter.sharpen.unsharpMask', '--out', str(target)], check=True, capture_output=True)
        print(f'PhotoCraft prepped still: {target.name}', flush=True)
    return target


def still(work, index, shot, seed, source, width, height, cache_only=False):
    key = digest({'prompt': shot['imagePrompt'], 'seed': seed, 'sourceHash': file_hash(source) if source else None,
                  'model': 'flux2-klein-4b-q4', 'width': width, 'height': height})
    target = work / 'refs' / f'shot-{index:02d}-{key}.png'
    if target.is_file() and target.with_suffix('.json').is_file():
        print(f'Reusing image {index + 1}: {target.name}', flush=True)
        return target
    if cache_only:
        raise RuntimeError(f'Cache-only mode: missing approved still for shot {index + 1}: {target}')
    print(f'Generating local FLUX image {index + 1}: {target.name}', flush=True)
    command = ['python3', ROOT / 'scripts/create-flux-image.py', '--prompt', shot['imagePrompt'],
               '--seed', seed, '--width', width, '--height', height, '--output', target]
    if source: command.extend(['--source', source])
    run(*command)
    return target


def repair_still_prompt(prompt, subject, required, reason, attempt):
    detail = ' '.join(str(reason).split())[:400]
    return (f"{prompt.rstrip()}\n\nAutomatic frame correction {attempt}: the subject is {subject}. "
            f"Clearly show {required}. The previous image was rejected because {detail}. "
            "Depict the named food and requested action unmistakably; do not substitute the mistaken object or material. "
            "Keep the original setting and continuity, changing the composition only as needed for clarity.")


def review_still_with_retries(initial_reference, prompt, subject, required, seed,
                              review, generate, on_repair=None, attempts=STILL_REVIEW_ATTEMPTS):
    reference = initial_reference
    current_prompt = prompt
    for attempt in range(1, attempts + 1):
        result = review(reference, current_prompt)
        if result is None:
            return reference, current_prompt
        status, reason = result
        if status == 'unavailable':
            raise RuntimeError(f'Local vision review is unavailable: {reason}')
        if attempt == attempts:
            raise RuntimeError(f'Vision review still rejects the image after {attempts} attempts: {reason}')
        current_prompt = repair_still_prompt(current_prompt, subject, required, reason, attempt + 1)
        if on_repair:
            on_repair(current_prompt, attempt + 1, reason)
        reference = generate(current_prompt, seed + 7919 * attempt)
    raise RuntimeError(f'Vision review did not complete after {attempts} attempts')


def review_vision(reference, prompt, checks, cache_dir):
    command = ['python3', ROOT / 'scripts/check-still-vision.py', '--image', reference,
               '--prompt', prompt, '--cache-dir', cache_dir]
    for value in checks.get('mustShow', []):
        command.extend(['--must-show', value])
    for value in checks.get('mustNotShow', []):
        command.extend(['--must-not-show', value])
    for value in checks.get('questions', []):
        command.extend(['--question', value])
    process = subprocess.Popen([str(item) for item in command], cwd=ROOT, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True)
    lines = []
    for line in process.stdout:
        print(line.rstrip('\n'), flush=True)
        lines.append(line)
    return_code = process.wait()
    if return_code == 0:
        return None
    output = ''.join(lines)
    match = re.search(r'Still vision gate:\s*([^\s|]+)\s*\|\s*(.+)', output)
    if match:
        report_path = Path(match.group(2).strip())
        if not report_path.is_absolute():
            report_path = ROOT / report_path
        if report_path.is_file():
            report = json.loads(report_path.read_text(encoding='utf-8'))
            reason = '; '.join(report.get('verdict', {}).get('missingOrWrong', []))
            return report.get('status', match.group(1)), reason or output.strip()
    reason = ' '.join(output.split())[-500:] or f'vision checker exited with code {return_code}'
    status = 'unavailable' if 'unavailable' in reason.lower() else 'review-required'
    return status, reason


def save_repaired_scenario(scenario, source_data):
    backup = scenario.with_name(scenario.stem + '.before-still-repair.json')
    if not backup.exists():
        backup.write_text(scenario.read_text(encoding='utf-8-sig'), encoding='utf-8')
    temporary = scenario.with_name(scenario.name + '.tmp')
    temporary.write_text(json.dumps(source_data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.replace(temporary, scenario)


def studio_frames(studio_id):
    """Reference plates of the scenario's kitchen studio (data/studios/ID.json), by name."""
    if not studio_id:
        return {}
    path = ROOT / 'data/studios' / f'{studio_id}.json'
    if not re.fullmatch(r'[a-z0-9-]+', str(studio_id)) or not path.is_file():
        raise SystemExit(f'Unknown studio in scenario: {studio_id}')
    frames = {name: ROOT / rel for name, rel in json.loads(path.read_text()).get('referenceFrames', {}).items()}
    missing = [str(f) for f in frames.values() if not f.is_file()]
    if missing:
        raise SystemExit(f'Studio {studio_id} reference frames missing: {missing}')
    return frames


def own_still(folder, work, index, width, height):
    """Uses a supplied still for this shot, cropped to the video aspect. Returns None when the folder has none."""
    for ext in ('png', 'jpg', 'jpeg', 'webp'):
        source = folder / f'shot-{index + 1:02d}.{ext}'
        if source.is_file():
            target = work / 'refs' / f'own-{index + 1:02d}-{file_hash(source)[:12]}.png'
            if not target.is_file():
                run('ffmpeg', '-y', '-v', 'error', '-i', source, '-vf',
                    f'scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}', target)
            print(f'Using your still for shot {index + 1}: {source.name}', flush=True)
            return target
    print(f'No supplied still for shot {index + 1}; generating with FLUX', flush=True)
    return None


def clip(work, index, part, shot, seed, reference, width, height, model, gemma, progress, cache_only=False):
    prompt = shot['motionPrompt'].strip() + ' One continuous camera take with coherent physical movement, stable subject identity and lighting.'
    key = digest({'prompt': prompt, 'seed': seed, 'referenceHash': file_hash(reference),
                  'model': model, 'gemma': gemma, 'frames': 97, 'width': width, 'height': height})
    target = work / 'motion' / f'shot-{index:02d}-part-{part:02d}-{key}.mp4'
    if valid_video(target):
        print(f'Reusing motion {index + 1}.{part + 1}: {target.name}', flush=True)
        progress.mark_complete(index, part)
        print(progress(), flush=True)
        return target
    if cache_only:
        raise RuntimeError(f'Cache-only mode: missing valid motion for shot {index + 1}.{part + 1}: {target}')
    print(f'Generating local LTX motion {index + 1}.{part + 1}: {target.name}', flush=True)
    command = [ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx', 'generate',
        '--model', model, '--gemma', gemma, '--distilled', '--low-ram', '--no-audio',
        '--seed', seed, '--image', reference, 0, 1.0, '--prompt', prompt,
        '-H', height, '-W', width, '-f', 97, '--frame-rate', FPS, '-o', target]
    started = time.monotonic()
    process = subprocess.Popen([str(item) for item in command], cwd=ROOT)
    try:
        while True:
            try:
                code = process.wait(timeout=30)
                break
            except subprocess.TimeoutExpired:
                print(progress((index, part), time.monotonic()-started), flush=True)
    except KeyboardInterrupt:
        process.terminate()
        process.wait()
        raise
    if code: raise subprocess.CalledProcessError(code, command)
    if not valid_video(target): raise RuntimeError(f'Motion failed verification: {target}')
    progress.observed.append(time.monotonic()-started)
    progress.mark_complete(index, part)
    print(progress(), flush=True)
    return target


def voice_gaps(wav, limit=1.5):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(wav), '-af', f'silencedetect=noise=-35dB:d={limit}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(m) for m in re.findall(r'silence_start: ([\d.]+)', out)]
    ends = [float(m) for m in re.findall(r'silence_end: ([\d.]+)', out)]
    return [(a, b) for a, b in zip(starts, ends) if a > 0.5]


def sound_led_pauses(data):
    plan = data.get('audioPlan') or {}
    music = str(plan.get('music', 'auto')).strip().lower()
    return music not in ('none', 'no music', 'off', 'silent') or 'room' in (plan.get('foleySamples') or {})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--chain-images', action='store_true', help='Edit previous still to preserve one subject')
    parser.add_argument('--allow-silence', action='store_true', help='Continue even when the voice track has gaps over 1.5 s')
    parser.add_argument('--allow-bad-first', action='store_true', help='Skip the first-picture and first-clip checks')
    parser.add_argument('--stills', type=Path, default=os.environ.get('BB_STILLS') or None, help='Folder with your own stills named shot-01.png, shot-02.png ... (for example from Google Flow). Missing shots fall back to FLUX')
    parser.add_argument('--anchor-image', type=Path, default=os.environ.get('BB_ANCHOR_IMAGE') or None, help='Recurring character: edit this image into each shot so one face is reused across films (or set BB_ANCHOR_IMAGE)')
    parser.add_argument('--prep-stills', action='store_true', help='PhotoCraft auto contrast + unsharp mask on each still before motion (changes the motion cache key)')
    parser.add_argument('--stills-only', action='store_true', help='Make (or reuse) the first-frame stills and the vision check, then stop before any motion')
    parser.add_argument('--cache-only', action='store_true', help='Reuse existing FLUX/LTX assets; fail rather than start a model job on a cache miss')
    parser.add_argument('--best-of-3-stills', action='store_true', help='Generate three stills per shot and require local Qwen hand/utensil review before motion')
    parser.add_argument('--skip-vision-gate', action='store_true', help='Explicitly skip local Qwen still review (release still needs human frame review)')
    args = parser.parse_args()
    scenario = args.scenario.expanduser().resolve()
    muse = Path(args.anchor_image).expanduser().resolve() if args.anchor_image else None
    if muse and not muse.is_file(): parser.error(f'Missing anchor image: {muse}')
    muse_shots = {int(n) for n in os.environ['BB_ANCHOR_SHOTS'].split(',')} if os.environ.get('BB_ANCHOR_SHOTS') else None  # e.g. BB_ANCHOR_SHOTS=3 limits the anchor to shot 3
    output = args.output.expanduser().resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).expanduser().resolve()
    if output.exists(): parser.error(f'Output already exists: {output}')
    if not scenario.is_file(): parser.error(f'Missing scenario: {scenario}')
    run('node', ROOT / 'scripts/bb-local-scenario.mjs', '--validate', scenario)
    source_data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    plan, settings = source_data['plan'], source_data['settings']
    frames = studio_frames(source_data.get('studio'))
    for number, shot in enumerate(plan['shots'], 1):
        if shot.get('studioFrame') and shot['studioFrame'] not in frames:
            parser.error(f"Shot {number} asks for studio frame {shot['studioFrame']!r}; studio has {sorted(frames)}")
    visual_checks = source_data.get('visualChecks') or [{} for _ in plan['shots']]
    if len(visual_checks) != len(plan['shots']):
        parser.error('visualChecks must have one entry per shot')
    for number, checks in enumerate(visual_checks, 1):
        if not isinstance(checks, dict) or any(
                not isinstance(checks.get(key, []), list) or
                any(not isinstance(value, str) for value in checks.get(key, []))
                for key in ('mustShow', 'mustNotShow', 'questions')):
            parser.error(f'visualChecks shot {number} must contain string lists named mustShow, mustNotShow and questions')
    if not args.skip_vision_gate:
        try:
            with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=5) as response:
                models = json.load(response).get('models', [])
            if not any(item.get('name') == 'qwen3-vl:4b' for item in models):
                parser.error('Local qwen3-vl:4b is needed for the pre-motion still gate; install it or explicitly pass --skip-vision-gate')
        except OSError as error:
            parser.error(f'Local Ollama vision gate is unavailable before rendering: {error}')
    presentation = choose_presentation(source_data)
    print(f"Presentation: {presentation['mode']} ({presentation['reason']})", flush=True)
    actual_seconds = sum(shot['seconds'] for shot in plan['shots'])
    if actual_seconds != settings['seconds']:
        parser.error(f'Shot timings add to {actual_seconds}s; edit them to equal {settings["seconds"]}s before rendering')
    minimum_shots = math.ceil(actual_seconds / 6)
    if len(plan['shots']) < minimum_shots:
        parser.error(f'{actual_seconds}s needs at least {minimum_shots} distinct shots. This plan has {len(plan["shots"])} and would repeat footage. Redraft or expand it before rendering')
    for field in ('imagePrompt', 'motionPrompt'):
        values = [' '.join(shot[field].lower().split()) for shot in plan['shots']]
        if len(set(values)) != len(values):
            parser.error(f'Repeated {field} across shots. Edit the story before spending time on motion generation')
    if settings['seconds'] > 60: parser.error('Interactive local renderer supports up to 60 seconds per run')
    aspect = settings['format']
    width, height = (384, 640) if aspect == 'short' else (640, 384)
    work.joinpath('refs').mkdir(parents=True, exist_ok=True)
    work.joinpath('motion').mkdir(exist_ok=True)
    references = []
    segments = []
    previous = None
    gate = None if args.allow_bad_first else True
    bumps_file = work / 'refs' / 'seed-bumps.json'  # written by the Studio when you press Regenerate on a first frame
    try: bumps = json.loads(bumps_file.read_text()) if bumps_file.is_file() else {}
    except ValueError: bumps = {}
    if args.stills_only:
        print('First-frame review only: skipping narration, soundtrack, and motion preparation.', flush=True)
    else:
        # Independent CPU tasks can overlap. Keep FLUX and LTX serial on 16 GB Macs;
        # running both model jobs together competes for unified memory.
        audio_started = time.monotonic()
        with ThreadPoolExecutor(max_workers=2) as pool:
            voice_job = (pool.submit(run, 'node', ROOT / 'scripts/narrate-any-local.mjs', scenario, work)
                         if presentation['voice'] else None)
            sound_job = pool.submit(run, ROOT / 'storage/tools/ComfyUI/.venv/bin/python',
                                    ROOT / 'scripts/sound-any-local.py', scenario, work)
            if voice_job:
                voice_job.result()
            sound_job.result()
        if not presentation['voice']:
            with wave.open(str(work / 'voice-timeline.wav'), 'wb') as silent:
                silent.setnchannels(2); silent.setsampwidth(2); silent.setframerate(48000)
                silent.writeframes(b'\0' * settings['seconds'] * 48000 * 4)
            (work / 'voice-provenance.json').write_text(json.dumps({'engine': 'none', 'voice': None,
                'lines': [], 'presentation': presentation}, indent=2) + '\n')
        print(f'Parallel voice and soundtrack preparation: {time.monotonic() - audio_started:.1f}s', flush=True)
        # A deliberate music or recorded-room bed can carry a visual pause. Final-file QA
        # still rejects actual silence; a bare voice track with dead air stops before GPU.
        gaps = voice_gaps(work / 'voice-timeline.wav') if presentation['voice'] else []
        if gaps and not args.allow_silence and not sound_led_pauses(source_data):
            lines = ', '.join(f'{a:.1f}-{b:.1f} s ({b - a:.1f} s)' for a, b in gaps)
            parser.error(f'Voice track has silence over 1.5 s at {lines}. Shorten those shots to the line length plus 0.6 s (total must stay equal to settings.seconds), or pass --allow-silence. Stopped before the 25-minute clip step')
        if gaps and sound_led_pauses(source_data):
            print(f'Voice leaves {len(gaps)} sound-led pause(s); final-file audio QA and a listening review are required.', flush=True)
        model = (ROOT / 'storage/setup/ltx-model-dir.txt').read_text().strip()
        gemma = (ROOT / 'storage/setup/gemma-model-dir.txt').read_text().strip()
        expected = sum(math.ceil(shot['seconds'] / 5) for shot in plan['shots'])
        if args.cache_only:
            print(f'{len(plan["shots"])} shots require {expected} cached motion clips; a missing clip stops before LTX.', flush=True)
        else:
            print(f'{len(plan["shots"])} shots require {expected} motion clips; allow several minutes per uncached clip.', flush=True)
        progress_state = work / 'progress-run.json'
        class Progress:
            observed = []
            completed = []
            def mark_complete(self, index, part):
                pair = [index, part]
                if pair not in self.completed:
                    self.completed.append(pair)
                progress_state.write_text(json.dumps({'scenarioSha256': file_hash(scenario),
                    'output': str(output.resolve()), 'completed': self.completed}) + '\n')
            def __call__(self, active=None, elapsed=0):
                return snapshot(scenario, work, output, active, elapsed, self.observed)
        progress = Progress()
        progress_state.write_text(json.dumps({'scenarioSha256': file_hash(scenario),
            'output': str(output.resolve()), 'completed': []}) + '\n')
        print(progress(), flush=True)
    pinned = read_manifest(work, scenario, len(plan['shots'])) if os.environ.get('SHORTS_STUDIO_PIN_FRAMES') == '1' else None
    for index, shot in enumerate(plan['shots']):
        reference = pinned[index] if pinned else None
        source = previous if args.chain_images and previous else (muse if muse_shots is None or index + 1 in muse_shots else None)
        if source is None and shot.get('studioFrame'):
            source = frames[shot['studioFrame']]
        if reference is None and args.stills:
            reference = own_still(args.stills.expanduser().resolve(), work, index, width, height)
        if reference is None:
            if shot.get('studioFrame'):
                print(f"Shot {index + 1} edits studio frame '{shot['studioFrame']}'", flush=True)
            if args.best_of_3_stills:
                candidates = [still(work, index, shot, 1200 + index + variation * 100,
                                    source, width, height, args.cache_only) for variation in range(3)]
                selected, review = select_still_local(candidates, shot['imagePrompt'])
                reference = candidates[selected - 1]
                (work / 'refs' / f'shot-{index:02d}-best-of-3.json').write_text(
                    json.dumps({'images': [str(path) for path in candidates], 'selectedIndex': selected,
                                'review': review, 'note': 'Advisory vision check; human inspection required.'}, indent=2) + '\n')
                print(f'Best of 3 stills for shot {index + 1}: candidate {selected}', flush=True)
            else:
                reference = still(work, index, shot, 1200 + index + 7919 * int(bumps.get(str(index), 0)), source, width, height, args.cache_only)
            checks = visual_checks[index] or {}
        checks = visual_checks[index] or {}
        base_seed = 1200 + index + 7919 * int(bumps.get(str(index), 0))
        required = '; '.join(checks.get('mustShow', [])) or shot.get('motionPrompt', '').split('.', 1)[0].strip()
        subject = plan.get('title') or source_data.get('topic') or 'the planned subject'

        def review_candidate(candidate, prompt):
            if gate and index == 0:
                problem = check_still(candidate)
                if problem:
                    return 'review-required', f'First picture: {problem}'
                print('First picture check passed', flush=True)
            if args.skip_vision_gate:
                return None
            return review_vision(candidate, prompt, checks, work / 'refs')

        def generate_repair(prompt, seed):
            repaired_shot = {**shot, 'imagePrompt': prompt}
            return still(work, index, repaired_shot, seed, source, width, height, args.cache_only)

        def save_repair(prompt, attempt, reason):
            shot['imagePrompt'] = prompt
            save_repaired_scenario(scenario, source_data)
            print(f'Automatically correcting shot {index + 1} from local vision feedback '
                  f'({attempt}/{STILL_REVIEW_ATTEMPTS}): {reason}', flush=True)

        try:
            reference, accepted_prompt = review_still_with_retries(
                reference, shot['imagePrompt'], subject, required, base_seed,
                review_candidate, generate_repair, save_repair)
        except RuntimeError as error:
            parser.error(f'Shot {index + 1} preview could not pass review after automatic correction: {error}. '
                         f'Inspect the still and vision report in {work / "refs"}.')
        shot['imagePrompt'] = accepted_prompt
        references.append(reference)
        previous = reference
        if args.stills_only:
            print(f'First frame ready for shot {index + 1}: {reference.name}', flush=True)
            continue
        if args.prep_stills:
            reference = prep_still(work, reference)
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
                                 reference, width, height, model, gemma, progress, args.cache_only)
            if gate and index == 0 and part == 0:
                problem = check_clip(previous_clip)
                if problem:
                    parser.error(f'First clip failed: {problem}. Stopped before the remaining clips (use --allow-bad-first to override)')
                print('First clip check passed', flush=True)
            segments.append({'file': str(previous_clip), 'seconds': frames / FPS})
    if args.stills_only:
        write_manifest(work, scenario, references)
        print('First frames ready; no motion generated.', flush=True)
        return
    manifest = {'aspect': aspect, 'shots': segments,
                'soundtrack': 'soundtrack.wav',
                'voice': {'file': 'voice-timeline.wav', 'startSeconds': 0}}
    manifest_path = work / 'film-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(progress(), flush=True)
    run('python3', ROOT / 'scripts/assemble-motion-video.py', '--manifest', manifest_path, '--output', output)
    provenance = {'scenario': str(scenario), 'scenarioSha256': file_hash(scenario),
                  'output': str(output), 'outputSha256': file_hash(output),
                  'imageModel': 'user-supplied stills (FLUX for any missing shot)' if args.stills else 'FLUX.2 Klein 4B q4 via MFLUX', 'videoModel': model,
                  'textEncoder': gemma, 'voice': 'Kokoro ONNX local' if presentation['voice'] else 'none (ASMR)',
                  'sound': ('licensed recording: ' + source_data['audioPlan']['musicCredit']
                            if (source_data.get('audioPlan') or {}).get('music') == 'licensed-track'
                            else 'none' if (source_data.get('audioPlan') or {}).get('music') == 'none'
                            else 'original local synthesis'), 'chainImages': args.chain_images,
                  'presentation': presentation,
                  'stillVisionGate': 'skipped explicitly' if args.skip_vision_gate else 'local qwen3-vl:4b before motion',
                  'motionClips': len(segments), 'totalSeconds': settings['seconds']}
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(progress(), flush=True)
    print(f'Finished local video: {output}')


if __name__ == '__main__': main()
