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
from studio_frames import read_manifest_details, write_manifest
from studio_references import load_reference_manifest, manifest_sha256
from first_checks import check_still, check_clip
from presentation_mode import choose as choose_presentation
import render_quality
import motion_takes
import still_lessons
from runtime_env import ltx_cli, media_python
from select_still_local import select as select_still_local

ROOT = Path(__file__).resolve().parents[1]
FPS = 24
STILL_REVIEW_ATTEMPTS = 2
VISION_UNAVAILABLE_RETRIES = 1


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


def valid_video(path, expected_frames=None):
    if not path.is_file(): return False
    target_frames = expected_frames or render_quality.FRAMES
    try:
        stream = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
            '-select_streams', 'v:0', '-show_entries',
            'stream=nb_frames,width,height,r_frame_rate', '-of', 'json', str(path)]))['streams'][0]
        return (stream['nb_frames'] == str(target_frames) and stream['r_frame_rate'] == '24/1'
                and (int(stream['width']), int(stream['height'])) in render_quality.known_sizes())
    except (KeyError, IndexError, ValueError, subprocess.CalledProcessError):
        return False


def should_batch_stills_before_motion(chain_images, stills_only, shot_only):
    """Batch all stills + vision checks before motion when shots do not depend on previous motion end frames."""
    return not chain_images and not stills_only and shot_only is None


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


def extract_end_frame(work, index, clip_path):
    target = work / 'motion' / f'shot-{index:02d}-end-{file_hash(clip_path)[:12]}.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.stem + '.tmp.png')
    try:
        run('ffmpeg', '-y', '-v', 'error', '-sseof', '-0.05', '-i', clip_path,
            '-frames:v', 1, temporary)
        if not temporary.is_file() or temporary.stat().st_size == 0:
            raise RuntimeError(f'Could not extract the final frame from shot {index + 1}: {clip_path}')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def select_source(shot_number, shot_reference, chain_source, previous_end_frame,
                  chain_images, anchor, studio_frame):
    if shot_reference:
        return shot_reference
    if chain_images:
        if chain_source:
            return chain_source
        if previous_end_frame:
            return previous_end_frame
        if shot_number > 1:
            raise ValueError(
                f'Shot {shot_number} needs the preceding motion clip final frame for continuity; '
                'prepare shots sequentially instead of chaining opening stills.')
        return anchor or studio_frame
    if anchor:
        return anchor
    if chain_source:
        return chain_source
    return studio_frame


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


def end_still_for(work, index, shot, seed, source, width, height, cache_only=False):
    """The shot's end frame: an explicit endStill path, or one edited from the first still with endImagePrompt.
    Editing from the first still keeps its camera framing, so the clip does not jump near its end."""
    if shot.get('endStill'):
        return shot['endStill']
    prompt = (shot.get('endImagePrompt') or '').strip()
    if not prompt:
        return None
    return still(work, index, {'imagePrompt': prompt}, seed + 31, source, width, height, cache_only)


def repair_still_prompt(prompt, subject, required, reason, attempt):
    detail = ' '.join(str(reason).split())[:400]
    return (f"{prompt.rstrip()}\n\nAutomatic frame correction {attempt}: the subject is {subject}. "
            f"Clearly show {required}. The previous image was rejected because {detail}. "
            "Depict the named food and requested action unmistakably; do not substitute the mistaken object or material. "
            "Keep the original setting and continuity, changing the composition only as needed for clarity.")


def review_still_with_retries(initial_reference, prompt, subject, required, seed,
                              review, generate, on_repair=None, attempts=STILL_REVIEW_ATTEMPTS,
                              allow_pending_review=False):
    reference = initial_reference
    current_prompt = prompt
    for attempt in range(1, attempts + 1):
        result = review(reference, current_prompt)
        for _ in range(VISION_UNAVAILABLE_RETRIES):
            if not result or result[0] != 'unavailable':
                break
            print('Local vision check was incomplete; retrying the same frame once without generating another image.',
                  flush=True)
            result = review(reference, current_prompt)
        if result is None:
            return reference, current_prompt
        status, reason = result
        if status == 'unavailable':
            if allow_pending_review:
                return reference, current_prompt
            raise RuntimeError(f'Local vision review is unavailable: {reason}')
        if attempt == attempts:
            if allow_pending_review:
                return reference, current_prompt
            raise RuntimeError(f'Vision review still rejects the image after {attempts} attempts: {reason}')
        current_prompt = repair_still_prompt(current_prompt, subject, required, reason, attempt + 1)
        if on_repair:
            on_repair(current_prompt, attempt + 1, reason)
        reference = generate(current_prompt, seed + 7919 * attempt)
    raise RuntimeError(f'Vision review did not complete after {attempts} attempts')


def fixed_stage_checks(shot, checks, explicit=False):
    """A locked shot requires its start state and excludes its finished result."""
    state = shot.get('sceneState') or {}
    before = str(state.get('before', '')).strip()
    after = str(state.get('after', '')).strip()
    if not before or not after or before == after:
        raise ValueError('locked shot requires different first and final states')
    if explicit:
        for key in ('mustShow', 'mustNotShow'):
            if not checks.get(key) or any(not item.strip() or len(item) > 180 for item in checks[key]):
                raise ValueError('explicit locked-beat checks require short visible required and forbidden facts')
        return checks
    return {
        **checks,
        'mustShow': list(dict.fromkeys([before, *checks.get('mustShow', [])])),
        'mustNotShow': list(dict.fromkeys([after, *checks.get('mustNotShow', [])])),
    }


def review_vision(reference, prompt, checks, cache_dir, keep_alive_after='0'):
    command = ['python3', ROOT / 'scripts/check-still-vision.py', '--image', reference,
               '--prompt', prompt, '--cache-dir', cache_dir,
               '--keep-alive-after', str(keep_alive_after)]
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


def save_repaired_scenario(scenario, source_data, work=None):
    backup = scenario.with_name(scenario.stem + '.before-still-repair.json')
    if not backup.exists():
        backup.write_text(scenario.read_text(encoding='utf-8-sig'), encoding='utf-8')
    temporary = scenario.with_name(scenario.name + '.tmp')
    temporary.write_text(json.dumps(source_data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.replace(temporary, scenario)
    references = Path(work) / 'references.json' if work else None
    if references and references.is_file():
        manifest = json.loads(references.read_text(encoding='utf-8'))
        manifest['scenarioSha256'] = file_hash(scenario)
        reference_tmp = references.with_suffix('.json.tmp')
        reference_tmp.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        os.replace(reference_tmp, references)


def save_pending_frames(work, scenario, entries):
    """Persist exact candidate paths and review state so attended Studio users can decide on failures."""
    manifest = {'schemaVersion': 1, 'scenarioSha256': file_hash(scenario), 'frames': entries}
    reference_hash = manifest_sha256(work)
    if reference_hash:
        manifest['referenceManifestSha256'] = reference_hash
    target = work / 'pending-first-frames.json'
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, target)


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


LAST_FRAME = 96  # the clip is 97 frames, so the final frame index is 96


def end_anchor(shot, work, width, height):
    """Optional shot['endStill']: a still the clip must finish on. Returns the cropped file, or None when unset.
    The end still must share the first still's camera framing, or the clip jumps near its end."""
    source = shot.get('endStill')
    if not source:
        return None
    source = Path(source).expanduser()
    source = source if source.is_absolute() else ROOT / source
    if not source.is_file():
        raise RuntimeError(f'endStill not found: {source}')
    target = work / 'refs' / f'end-{file_hash(source)[:12]}-{width}x{height}.png'
    if not target.is_file():
        target.parent.mkdir(parents=True, exist_ok=True)
        run('ffmpeg', '-y', '-v', 'error', '-i', source, '-vf',
            f'scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}', target)
    return target


def clip(work, index, part, shot, seed, reference, width, height, model, gemma, progress, cache_only=False,
         frames=None):
    clip_frames = frames or render_quality.FRAMES
    last_frame_idx = clip_frames - 1
    prompt = shot['motionPrompt'].strip() + ' One continuous camera take with coherent physical movement, stable subject identity and lighting.'
    end = end_anchor(shot, work, width, height)
    identity = {'prompt': prompt, 'seed': seed, 'referenceHash': file_hash(reference),
                'model': model, 'gemma': gemma, 'frames': clip_frames, 'width': width, 'height': height}
    if end is not None:  # added only when set, so clips cached before this option keep their names
        identity['endHash'] = file_hash(end)
    key = digest(identity)
    target = work / 'motion' / f'shot-{index:02d}-part-{part:02d}-{key}.mp4'
    is_valid = valid_video(target) if frames is None else valid_video(target, expected_frames=clip_frames)
    if is_valid:
        print(f'Reusing motion {index + 1}.{part + 1}: {target.name}', flush=True)
        target.touch()  # the Studio shows the newest clip per shot, so a reused earlier take becomes the current one
        progress.mark_complete(index, part)
        print(progress(), flush=True)
        return target
    if cache_only:
        raise RuntimeError(f'Cache-only mode: missing valid motion for shot {index + 1}.{part + 1}: {target}')
    print(f'Generating local LTX motion {index + 1}.{part + 1}: {target.name}', flush=True)
    command = [ltx_cli(ROOT), 'generate',
        '--model', model, '--gemma', gemma, '--distilled', '--low-ram', '--no-audio',
        '--seed', seed, '--image', reference, 0, 1.0, *(['--image', end, last_frame_idx, 1.0] if end is not None else []), '--prompt', prompt,
        '-H', height, '-W', width, '-f', clip_frames, '--frame-rate', FPS, '-o', target]
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
    post_valid = valid_video(target) if frames is None else valid_video(target, expected_frames=clip_frames)
    if not post_valid: raise RuntimeError(f'Motion failed verification: {target}')
    progress.observed.append(time.monotonic()-started)
    progress.mark_complete(index, part)
    print(progress(), flush=True)
    return target


def matches_approved_take(take, scenario_hash, reference_hash, render_settings):
    return (take is not None
            and take.get('scenarioSha256') == scenario_hash
            and take.get('approvedReferenceSha256') == reference_hash
            and take.get('renderSettings') == render_settings)


def select_motion_segment(work, index, part, shot, seed, reference, width, height, model, gemma,
                          progress, cache_only=False, expected=None, frames=None):
    path = clip(work, index, part, shot, seed, reference, width, height, model, gemma, progress,
                cache_only=cache_only or expected is not None, frames=frames)
    segment = {'clip': str(path.relative_to(work)), 'sha256': file_hash(path), 'seed': seed}
    if expected is not None and segment != expected:
        raise RuntimeError(f'Shot {index + 1}: selected motion cache no longer matches the reviewed take.')
    return path, segment


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
    parser.add_argument('--anchor-image', type=Path, default=os.environ.get('BB_ANCHOR_IMAGE') or None, help='Shared identity reference to edit into every generated shot (or set BB_ANCHOR_IMAGE)')
    parser.add_argument('--shot-only', type=int, help='Prepare only this 1-based shot; requires --stills-only')
    parser.add_argument('--chain-source', type=Path, help='Verified preceding motion end frame for --shot-only')
    parser.add_argument('--chain-source-sha256', help='Expected hash of the preceding motion end frame')
    parser.add_argument('--prep-stills', action='store_true', help='PhotoCraft auto contrast + unsharp mask on each still before motion (changes the motion cache key)')
    parser.add_argument('--stills-only', action='store_true', help='Make (or reuse) the first-frame stills and the vision check, then stop before any motion')
    parser.add_argument('--cache-only', action='store_true', help='Reuse existing FLUX/LTX assets; fail rather than start a model job on a cache miss')
    parser.add_argument('--best-of-3-stills', action='store_true', help='Generate three stills per shot and require local Qwen hand/utensil review before motion')
    parser.add_argument('--allow-pending-visual-review', action='store_true',
                        help='Finish attended still generation when vision rejects a frame; motion still requires human approval')
    parser.add_argument('--skip-vision-gate', action='store_true', help='Explicitly skip local Qwen still review (release still needs human frame review)')
    args = parser.parse_args()
    if args.allow_pending_visual_review and not args.stills_only:
        parser.error('--allow-pending-visual-review is only valid with --stills-only')
    if args.shot_only is not None and not args.stills_only:
        parser.error('--shot-only is only valid with --stills-only')
    if args.chain_source and args.shot_only is None:
        parser.error('--chain-source requires --shot-only')
    if bool(args.chain_source) != bool(args.chain_source_sha256):
        parser.error('--chain-source and --chain-source-sha256 must be provided together')
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
    if args.shot_only is not None and not 1 <= args.shot_only <= len(plan['shots']):
        parser.error(f'--shot-only must be between 1 and {len(plan["shots"])}')
    chain_source = args.chain_source.expanduser().resolve() if args.chain_source else None
    if chain_source and not chain_source.is_file():
        parser.error(f'Missing chain source frame: {chain_source}')
    if chain_source and file_hash(chain_source) != args.chain_source_sha256:
        parser.error(f'The preceding motion end frame changed: {chain_source}')
    try:
        shot_references = load_reference_manifest(work, scenario, len(plan['shots']))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(f'Studio reference images are invalid: {error}')
    frames = studio_frames(source_data.get('studio'))
    for number, shot in enumerate(plan['shots'], 1):
        if shot.get('studioFrame') and shot['studioFrame'] not in frames:
            parser.error(f"Shot {number} asks for studio frame {shot['studioFrame']!r}; studio has {sorted(frames)}")
    visual_checks = source_data.get('visualChecks') or [shot.get('visualChecks') or {} for shot in plan['shots']]
    if len(visual_checks) != len(plan['shots']):
        parser.error('visualChecks must have one entry per shot')
    for number, checks in enumerate(visual_checks, 1):
        if not isinstance(checks, dict) or any(
                not isinstance(checks.get(key, []), list) or
                any(not isinstance(value, str) for value in checks.get(key, []))
                for key in ('mustShow', 'mustNotShow', 'questions')):
            parser.error(f'visualChecks shot {number} must contain string lists named mustShow, mustNotShow and questions')
    if source_data.get('fixedBeatCount'):
        if source_data['fixedBeatCount'] != len(plan['shots']):
            parser.error('The locked beat count must match the storyboard.')
        try:
            explicit = source_data.get('fixedBeatVisualChecks') == 'explicit'
            visual_checks = [fixed_stage_checks(shot, checks, explicit)
                             for shot, checks in zip(plan['shots'], visual_checks)]
        except ValueError as error:
            parser.error(str(error))
    pinned = None
    pinned_review_method = None
    approved_pinned = False
    human_approved_pinned = False
    if os.environ.get('SHORTS_STUDIO_PIN_FRAMES') == '1':
        try:
            pinned, pinned_manifest = read_manifest_details(work, scenario, len(plan['shots']))
        except (OSError, ValueError) as error:
            parser.error(f'Pinned Studio frames are invalid: {error}')
        pinned_review_method = pinned_manifest.get('reviewMethod')
        approved_pinned = pinned_review_method in ('human', 'vision')
        human_approved_pinned = pinned_review_method == 'human'
    if source_data.get('fixedBeatCount') and args.skip_vision_gate and not human_approved_pinned:
        parser.error('Locked beats require a vision check or hash-pinned human-approved first frames.')
    if not args.skip_vision_gate and not approved_pinned:
        try:
            with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=5) as response:
                models = json.load(response).get('models', [])
            if not any(item.get('name') == 'qwen3-vl:4b' for item in models):
                message = 'Local qwen3-vl:4b is needed for the pre-motion still gate; install it or explicitly pass --skip-vision-gate'
                if args.allow_pending_visual_review:
                    print(message + '. Attended manual review will be required for every frame.', flush=True)
                else:
                    parser.error(message)
        except OSError as error:
            message = f'Local Ollama vision gate is unavailable before rendering: {error}'
            if args.allow_pending_visual_review:
                print(message + '. Attended manual review will be required for every frame.', flush=True)
            else:
                parser.error(message)
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
    aspect = render_quality.layout(settings)   # 'short' or 'wide': the names assemble-motion-video.py accepts
    width, height = render_quality.dimensions(settings)
    print(f'Render quality: {render_quality.pick(settings)} ({width}x{height})', flush=True)
    work.joinpath('refs').mkdir(parents=True, exist_ok=True)
    work.joinpath('motion').mkdir(exist_ok=True)
    references = []
    take_report = os.environ.get('SHORTS_STUDIO_TAKE_REPORT')
    take_shot = int(os.environ.get('SHORTS_STUDIO_TAKE_SHOT', '0'))
    take_index = int(os.environ.get('SHORTS_STUDIO_TAKE_INDEX', '0'))
    motion_rows = []
    committed_takes = motion_takes.load(work)
    frame_review_statuses = []
    segments = []
    previous = None
    story_anchor = None
    pending_frames = []
    gate = None if args.allow_bad_first else True
    bumps_file = work / 'refs' / 'seed-bumps.json'  # written by the Studio when you press Regenerate on a first frame
    try: bumps = json.loads(bumps_file.read_text()) if bumps_file.is_file() else {}
    except ValueError: bumps = {}
    run_started = time.monotonic()
    stage_timings_ms = {'audioPrep': 0, 'stillsAndVision': 0, 'motion': 0, 'assembly': 0}
    if args.stills_only:
        print('First-frame review only: skipping narration, soundtrack, and motion preparation.', flush=True)
    else:
        # Independent CPU tasks can overlap. Keep FLUX and LTX serial on 16 GB Macs;
        # running both model jobs together competes for unified memory.
        audio_started = time.monotonic()
        with ThreadPoolExecutor(max_workers=2) as pool:
            voice_job = (pool.submit(run, 'node', ROOT / 'scripts/narrate-any-local.mjs', scenario, work)
                         if presentation['voice'] else None)
            sound_job = pool.submit(run, media_python(ROOT),
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
        stage_timings_ms['audioPrep'] = round((time.monotonic() - audio_started) * 1000)
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

    use_native_frames = os.environ.get('SHORTS_NATIVE_CLIP_FRAMES') == '1'

    def prepare_shot_still(index, shot, vision_keep_alive='0'):
        nonlocal story_anchor
        t_still = time.monotonic()
        checks = visual_checks[index] or {}
        candidate_paths = []
        candidate_reviews = {}
        partial_batch = False
        reference = pinned[index] if pinned else None
        anchor = muse if muse and (muse_shots is None or index + 1 in muse_shots) else story_anchor
        try:
            source = select_source(index + 1, shot_references.get(index + 1),
                                   chain_source if args.shot_only == index + 1 else None,
                                   previous, args.chain_images, anchor,
                                   frames.get(shot.get('studioFrame')))
        except ValueError as error:
            parser.error(str(error))
        if reference is None and args.stills:
            reference = own_still(args.stills.expanduser().resolve(), work, index, width, height)
        if reference is None:
            if shot.get('studioFrame'):
                print(f"Shot {index + 1} edits studio frame '{shot['studioFrame']}'", flush=True)
            if args.best_of_3_stills:
                base_seed = 1200 + index + 7919 * int(bumps.get(str(index), 0))
                candidates = [still(work, index, shot, base_seed + variation * 100,
                                    source, width, height, args.cache_only) for variation in range(3)]
                selected, review = select_still_local(candidates, shot['imagePrompt'], checks=checks)
                rejected = review.get('rejectedCandidates', {})
                candidate_paths = [path for number, path in enumerate(candidates, 1) if number not in rejected]
                partial_batch = bool(rejected)
                if rejected:
                    for number, reason in rejected.items():
                        print(f'Shot {index + 1}, candidate {number} excluded: {reason}', flush=True)
                reference = candidates[selected - 1]
                for row in review.get('candidates', []):
                    candidate_reviews[candidates[row['index'] - 1]] = {
                        'status': 'passed' if all(row.get(key) for key in
                            ('handsPlausible', 'toolContactPlausible', 'foodAndSetMatch', 'visualChecksPass'))
                            else 'review-required',
                        'reason': '; '.join(row.get('issues', []))[:300],
                    }
                (work / 'refs' / f'shot-{index:02d}-best-of-3.json').write_text(
                    json.dumps({'images': [str(path) for path in candidates], 'selectedIndex': selected,
                                'visualChecks': checks, 'review': review,
                                'note': 'Advisory vision check; human inspection required.'}, indent=2) + '\n')
                print(f'Best of 3 stills for shot {index + 1}: candidate {selected}', flush=True)
            else:
                reference = still(work, index, shot, 1200 + index + 7919 * int(bumps.get(str(index), 0)), source, width, height, args.cache_only)
                candidate_paths = [reference]
        base_seed = 1200 + index + 7919 * int(bumps.get(str(index), 0))
        required = '; '.join(checks.get('mustShow', [])) or shot.get('motionPrompt', '').split('.', 1)[0].strip()
        subject = plan.get('title') or source_data.get('topic') or 'the planned subject'

        def persist_pending(selected=None):
            entries = []
            for candidate_index, path in enumerate(candidate_paths, 1):
                assessment = candidate_reviews.get(path, {})
                entries.append({'file': str(path.relative_to(work)), 'sha256': file_hash(path),
                                'candidate': candidate_index,
                                'status': assessment.get('status', 'unverified'),
                                'reason': assessment.get('reason', '')})
            selected_file = str(selected.relative_to(work)) if selected and selected.is_relative_to(work) else None
            entry = {'shot': index + 1, 'candidates': entries, 'selectedFile': selected_file,
                     'visualChecks': checks,
                     'sourceReferenceSha256': file_hash(source) if source else None}
            pending_frames[:] = [item for item in pending_frames if item['shot'] != index + 1]
            pending_frames.append(entry)
            pending_frames.sort(key=lambda item: item['shot'])
            save_pending_frames(work, scenario, pending_frames)

        persist_pending(reference)

        def review_candidate(candidate, prompt):
            if gate and index == 0:
                problem = check_still(candidate)
                if problem:
                    candidate_reviews[candidate] = {'status': 'review-required', 'reason': f'First picture: {problem}'}
                    persist_pending(candidate)
                    return 'review-required', f'First picture: {problem}'
                print('First picture check passed', flush=True)
            if pinned_review_method == 'human':
                candidate_reviews[candidate] = {'status': 'human-approved', 'reason': 'Exact frame selected in Studio'}
                persist_pending(candidate)
                return None
            if pinned_review_method == 'vision':
                candidate_reviews[candidate] = {'status': 'passed', 'reason': 'Verified by pre-motion vision gate'}
                persist_pending(candidate)
                return None
            if args.skip_vision_gate:
                candidate_reviews[candidate] = {'status': 'unverified', 'reason': 'Vision gate explicitly skipped'}
                persist_pending(candidate)
                return None
            result = review_vision(candidate, prompt, checks, work / 'refs', keep_alive_after=vision_keep_alive)
            candidate_reviews[candidate] = {'status': 'passed', 'reason': ''} if result is None else {
                'status': result[0], 'reason': result[1][:300]}
            persist_pending(candidate)
            return result

        def generate_repair(prompt, seed):
            repaired_shot = {**shot, 'imagePrompt': prompt}
            candidate = still(work, index, repaired_shot, seed, source, width, height, args.cache_only)
            if candidate not in candidate_paths:
                candidate_paths.append(candidate)
            persist_pending(candidate)
            return candidate

        def save_repair(prompt, attempt, reason):
            still_lessons.record_rejection(shot['imagePrompt'], prompt, reason, scenario.name)
            shot['imagePrompt'] = prompt
            save_repaired_scenario(scenario, source_data, work)
            print(f'Automatically correcting shot {index + 1} from local vision feedback '
                  f'({attempt}/{STILL_REVIEW_ATTEMPTS}): {reason}', flush=True)

        try:
            reference, accepted_prompt = review_still_with_retries(
                reference, shot['imagePrompt'], subject, required, base_seed,
                review_candidate, generate_repair, save_repair,
                attempts=1 if partial_batch and args.stills_only and args.allow_pending_visual_review
                else STILL_REVIEW_ATTEMPTS,
                allow_pending_review=args.allow_pending_visual_review)
        except RuntimeError as error:
            persist_pending(reference)
            parser.error(f'Shot {index + 1} preview could not pass review after automatic correction: {error}. '
                         f'Inspect the still and vision report in {work / "refs"}.')
        shot['imagePrompt'] = accepted_prompt
        if candidate_reviews.get(reference, {}).get('status') == 'passed':
            still_lessons.record_recipe(accepted_prompt, scenario.name)
            candidate_reviews[reference] = {'status': 'passed', 'reason': 'Selected by vision gate'}
        frame_review_statuses.append(candidate_reviews.get(reference, {}).get('status', 'unverified'))
        persist_pending(reference)
        references.append(reference)
        if story_anchor is None:
            story_anchor = reference
        end_still = end_still_for(work, index, shot, 1200 + index, reference, width, height, args.cache_only)
        if end_still is not None and 'endStill' not in shot:
            print(f'End frame ready for shot {index + 1}: {Path(end_still).name}', flush=True)
        stage_timings_ms['stillsAndVision'] += round((time.monotonic() - t_still) * 1000)
        return reference, end_still

    def render_shot_motion(index, shot, approved_reference, end_still):
        nonlocal previous
        t_motion = time.monotonic()
        reference = prep_still(work, approved_reference) if args.prep_stills else approved_reference
        parts = math.ceil(shot['seconds'] / 5)
        total_frames = shot['seconds'] * FPS
        frame_counts = [total_frames // parts + (1 if part < total_frames % parts else 0) for part in range(parts)]
        take = take_index if take_shot == index + 1 else motion_takes.state(work, index)['current']
        committed = committed_takes.get(str(index), {}).get('completed', {}).get(str(take))
        scenario_hash = file_hash(scenario)
        reference_hash = file_hash(approved_reference)
        shot_clip_frames = [
            render_quality.frames_for_seconds(fc / FPS, fps=FPS, native=True) if use_native_frames else None
            for fc in frame_counts
        ]
        render_settings = {'quality': render_quality.pick(settings), 'width': width, 'height': height,
                           'frames': shot_clip_frames[0] if use_native_frames and len(set(shot_clip_frames)) == 1 else render_quality.FRAMES,
                           'fps': FPS,
                           'editor': 'artcraft' if args.prep_stills else 'ffmpeg', 'model': model, 'gemma': gemma}
        if take_shot and take_shot != index + 1 and committed and committed.get('renderSettings') != render_settings:
            raise RuntimeError(f'Shot {index + 1}: render settings changed. Render the full video before retaking a shot.')
        selected_segments = None
        if take_shot != index + 1 and matches_approved_take(committed, scenario_hash, reference_hash, render_settings):
            selected_segments = committed.get('segments')
            if (not isinstance(selected_segments, list) or len(selected_segments) != parts
                    or not all(isinstance(segment, dict) for segment in selected_segments)):
                raise RuntimeError(f'Shot {index + 1}: incomplete reviewed take.')
        shot_segments = []
        started_take = time.monotonic()
        technical_flags = []
        technical_screen = []
        previous_clip = None
        for part, frame_count in enumerate(frame_counts):
            if part:
                anchor = work / 'motion' / f'shot-{index:02d}-part-{part - 1:02d}-anchor.png'
                run('ffmpeg', '-y', '-v', 'error', '-sseof', '-0.05', '-i', previous_clip,
                    '-frames:v', 1, anchor)
                reference = anchor
            seed = motion_takes.seed(work, index, part, take=take)
            clip_shot = {k: v for k, v in shot.items() if k != 'endStill'}
            if end_still is not None and part == parts - 1:  # only the final part of a shot ends on its end frame
                clip_shot['endStill'] = str(end_still)
            previous_clip, segment = select_motion_segment(
                work, index, part, clip_shot, seed, reference, width, height, model, gemma, progress,
                cache_only=args.cache_only or bool(take_shot and take_shot != index + 1),
                expected=selected_segments[part] if selected_segments is not None else None,
                frames=shot_clip_frames[part])
            shot_segments.append(segment)
            screen_first = gate and index == 0 and part == 0
            problem = None
            if screen_first or (take_report and take_shot == index + 1):
                problem = check_clip(previous_clip)
                technical_screen.append({'part': part + 1, 'clipSha256': segment['sha256'], 'reason': problem})
                if problem:
                    technical_flags.append(problem)
            if screen_first:
                if problem:
                    parser.error(f'First clip failed: {problem}. Stopped before the remaining clips (use --allow-bad-first to override)')
                print('First clip check passed', flush=True)
            segments.append({'file': str(previous_clip), 'seconds': frame_count / FPS})
        previous = extract_end_frame(work, index, previous_clip) if args.chain_images else reference
        stage_timings_ms['motion'] += round((time.monotonic() - t_motion) * 1000)
        if take_report:
            motion_rows.append({
                'schemaVersion': 1, 'shot': index + 1, 'take': take, 'parts': parts,
                'scenarioSha256': scenario_hash, 'approvedReferenceSha256': reference_hash,
                **({'technicalFlags': technical_flags, 'elapsedSeconds': round(time.monotonic() - started_take, 1)}
                   if take_shot == index + 1 else {}),
                'clip': shot_segments[-1]['clip'], 'clipSha256': shot_segments[-1]['sha256'], 'segments': shot_segments,
                'renderSettings': render_settings,
                **({'technicalScreen': technical_screen} if technical_screen else {}),
                **({'endFrame': str(previous.relative_to(work)), 'endFrameSha256': file_hash(previous)} if args.chain_images else {}),
            })

    total_shots = len(plan['shots'])
    if should_batch_stills_before_motion(args.chain_images, args.stills_only, args.shot_only):
        # Stage-batch all stills + vision checks first (keeping qwen3-vl warm until the final still),
        # then run all LTX motion clips contiguously without FLUX <-> Qwen <-> LTX swap thrashing.
        prepared_stills = []
        for index, shot in enumerate(plan['shots']):
            keep_alive = '2m' if index < total_shots - 1 else '0'
            approved_ref, end_still = prepare_shot_still(index, shot, vision_keep_alive=keep_alive)
            prepared_stills.append((index, shot, approved_ref, end_still))
        for index, shot, approved_ref, end_still in prepared_stills:
            render_shot_motion(index, shot, approved_ref, end_still)
    else:
        for index, shot in enumerate(plan['shots']):
            if args.shot_only is not None and index + 1 != args.shot_only:
                continue
            keep_alive = '2m' if args.stills_only and args.shot_only is None and index < total_shots - 1 else '0'
            approved_ref, end_still = prepare_shot_still(index, shot, vision_keep_alive=keep_alive)
            if args.stills_only:
                print(f'First frame ready for shot {index + 1}: {approved_ref.name}', flush=True)
                continue
            render_shot_motion(index, shot, approved_ref, end_still)

    if args.stills_only:
        review_required = any(status != 'passed' for status in frame_review_statuses)
        if not review_required and args.shot_only is None:
            write_manifest(work, scenario, references, review_method='vision')
        print('First frames ready for human review; no motion generated.' if review_required
              else 'First frames ready; no motion generated.', flush=True)
        return
    if pinned is None and not any(status != 'passed' for status in frame_review_statuses):
        write_manifest(work, scenario, references, review_method='vision')
    manifest = {'aspect': aspect, 'shots': segments,
                'soundtrack': 'soundtrack.wav',
                'voice': {'file': 'voice-timeline.wav', 'startSeconds': 0}}
    if take_report:
        Path(take_report).write_text(json.dumps(motion_rows), encoding='utf-8')
    manifest_path = work / 'film-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(progress(), flush=True)
    t_assemble = time.monotonic()
    run('python3', ROOT / 'scripts/assemble-motion-video.py', '--manifest', manifest_path, '--output', output)
    stage_timings_ms['assembly'] = round((time.monotonic() - t_assemble) * 1000)
    stage_timings_ms['total'] = round((time.monotonic() - run_started) * 1000)
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
                  'motionClips': len(segments), 'totalSeconds': settings['seconds'],
                  'stageTimingsMs': stage_timings_ms}
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(progress(), flush=True)
    print(f'Finished local video: {output}')


if __name__ == '__main__': main()
