"""Add shot-synced local sound effects to a finished video.

  python3 scripts/add-sfx.py --scenario drafts/generated/ID.local-scenario.json --video outputs/ID.mp4 [--work-dir DIR]

Writes outputs/ID.sfx.mp4 (picture copied, audio remixed) and ID.sfx.wav. Effects are synthesized unless
the scenario declares a local field recording, whose source and licence must be documented. Effects sit low and are ducked under the narration
(the voice track in the work folder is the ducking key), then the mix is loudness-normalised again.
Cue words in a shot's `sound` or action prompts: sizzle, crunch/bite, chew, pour, slice, scrape/spread, plate clink,
chime/shimmer, bounce, pat, bubble/pop, squeak, fizz and room tone. These are original synthesized Foley approximations.

Optional sound accents (audioPlan.accents, off unless listed; at most 6; `at` is film time in seconds of the key visual event):
  {"type": "impact", "at": 2.0}                              sub-bass hit whose onset lands exactly on `at`
  {"type": "riser-impact", "at": 3.0, "riserSeconds": 1.2}   rising noise build that ends on an impact at `at`
  {"type": "stinger", "at": 8.2, "tailSeconds": 1.6}         impact plus a ringing shimmer tail for the final reveal
A shot may instead carry "hit": {"type": "impact", "atSeconds": 1.2} (seconds into that shot); it becomes an accent at the shot start plus that offset.
  {"type": "swell", "at": 4.8, "seconds": 1.2}               sub-bass swell centred on `at`, for a movement phase
  {"type": "breath", "at": 11.36, "seconds": 0.3, "depth": 0.2}  dips the existing soundtrack just BEFORE the hero cut at `at`
Optional per accent: "gain" (multiplier). A breath ducks the whole existing soundtrack, so it is refused over narration.
"""
import argparse
import json
import re
import subprocess
import wave
from pathlib import Path

import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_events import gate as gate_event  # noqa: E402

SOUND_CODES = (('accent plan', 'accent-plan'), ('has a gap', 'asmr-gap'), ('sound line is empty', 'cue-missing'), ('needs a matching field recording', 'recording-missing'),
               ('recordings-only mix needs', 'room-recording-missing'), ('required sound cue', 'required-cue'), ('foley sample', 'sample-invalid'))


def sound_code(problem):
    return next((code for text, code in SOUND_CODES if text in problem), 'sound-plan')

ROOT = Path(__file__).resolve().parents[1]
RATE = 48000


def t_axis(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def noise(seconds, rng):
    return rng.standard_normal(round(seconds * RATE)).astype(np.float32)


def highpass(x, amount=0.97):
    out = np.zeros_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):   # one-pole high-pass; short clips only
        prev_y = amount * (prev_y + v - prev_x)
        prev_x = v
        out[i] = prev_y
    return out


def lowpass(x, alpha=0.08):
    out = np.zeros_like(x)
    y = 0.0
    for i, v in enumerate(x):
        y += alpha * (v - y)
        out[i] = y
    return out


def sizzle(seconds, rng):
    base = highpass(noise(seconds, rng), 0.96)
    crackle = (rng.random(len(base)) > 0.9985).astype(np.float32)
    crackle = np.convolve(crackle, np.exp(-np.arange(400) / 60.0), 'same') * 4
    env = np.minimum(1, t_axis(seconds) * 4) * np.minimum(1, (seconds - t_axis(seconds)) * 2)
    return (base * 0.25 + crackle * base) * env


def chime(freq=2093.0, length=1.6):
    t = t_axis(length)
    tone = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((freq, 1), (freq * 1.5, .5), (freq * 2.01, .3)))
    return tone * np.exp(-3.2 * t) * np.minimum(1, t * 200) * 0.5


def shimmer(seconds, rng):
    out = np.zeros(round(seconds * RATE), dtype=np.float32)
    for at in sorted(rng.uniform(0, max(seconds - 0.8, 0.1), 4)):
        piece = chime(float(rng.choice([2349.0, 2637.0, 3136.0, 3520.0])), 0.8) * 0.5
        start = round(at * RATE)
        out[start:start + len(piece)] += piece[:len(out) - start]
    return out


def pop(length=0.12):
    t = t_axis(length)
    return np.sin(2 * np.pi * (300 + 700 * t / length) * t) * np.exp(-30 * t) * 0.8


def squeak(length=0.16):
    t = t_axis(length)
    return np.sin(2 * np.pi * (900 + 900 * np.sin(np.pi * t / length)) * t) * np.exp(-9 * t) * 0.5


def whoosh(length=1.1, rng=None):
    rng = rng or np.random.default_rng(5)
    t = t_axis(length)
    body = lowpass(noise(length, rng), 0.03) + 0.6 * highpass(noise(length, rng), 0.9) * np.sin(np.pi * t / length)
    return body * np.sin(np.pi * t / length) ** 2 * 1.6


def pat(seconds, rng):
    out = np.zeros(round(seconds * RATE), dtype=np.float32)
    for at in np.arange(0.3, seconds - 0.3, 0.55):
        burst = lowpass(noise(0.09, rng), 0.12) * np.exp(-45 * t_axis(0.09)) * 2.2
        start = round((at + rng.uniform(-0.05, 0.05)) * RATE)
        out[start:start + len(burst)] += burst[:len(out) - start]
    return out


def bounce(seconds, rng):
    """A ball's diminishing impacts, with each rebound arriving sooner and softer."""
    out = np.zeros(round(seconds * RATE), dtype=np.float32)
    at, gap, amplitude = 0.12, 0.52, 1.0
    for _ in range(8):
        if at >= seconds - 0.05 or amplitude < 0.035:
            break
        length = min(0.12, seconds - at)
        t = t_axis(length)
        envelope = np.exp(-38 * t)
        tone = np.sin(2 * np.pi * 105 * t) * envelope
        texture = lowpass(noise(length, rng), 0.18) * envelope
        hit = (tone * 0.7 + texture * 0.3) * amplitude
        start = round(at * RATE)
        out[start:start + len(hit)] += hit[:len(out) - start]
        at += gap
        gap *= 0.78
        amplitude *= 0.58
    return out


def fizz(seconds, rng):
    hiss = highpass(noise(seconds, rng), 0.985) * 0.12
    clicks = (rng.random(len(hiss)) > 0.9992).astype(np.float32)
    return (hiss + np.convolve(clicks, np.exp(-np.arange(200) / 25.0), 'same') * 0.6) * np.minimum(1, t_axis(seconds) * 3)


def room(seconds, rng):
    return lowpass(noise(seconds, rng), 0.01) * 6 * np.minimum(1, t_axis(seconds) * 2)


def crunch(seconds, rng):
    """Several short, irregular brittle bursts for a bite or crisp food break."""
    out = np.zeros(round(seconds * RATE), dtype=np.float32)
    for at in (0.08, 0.21, 0.39, 0.68):
        if at >= seconds: break
        duration = min(0.11, seconds - at)
        t = t_axis(duration)
        burst = highpass(noise(duration, rng), 0.86) * np.exp(-33 * t)
        start = round(at * RATE)
        out[start:start + len(burst)] += burst[:len(out) - start]
    return out


def pour(seconds, rng):
    t = t_axis(seconds)
    bed = lowpass(noise(seconds, rng), 0.025) * 2.2
    ripples = np.sin(2 * np.pi * (90 + 16 * t) * t) * 0.12
    return (bed + ripples) * np.minimum(1, t * 8) * np.minimum(1, (seconds-t) * 5)


def slice_food(seconds, rng):
    t = t_axis(seconds)
    return highpass(noise(seconds, rng), 0.82) * np.exp(-7 * t) * 0.7


def scrape_food(seconds, rng):
    """Soft friction for a spoon or knife spreading food across a surface."""
    t = t_axis(seconds)
    friction = lowpass(highpass(noise(seconds, rng), 0.91), 0.18)
    pressure = np.sin(np.pi * np.minimum(1, t / seconds)) ** 2
    return friction * pressure * 2.0


def rain(seconds, rng):
    """Soft steady rain: high-passed noise bed with faint droplet ticks."""
    bed = highpass(noise(seconds, rng), 0.93) * 0.30
    drops = (rng.random(len(bed)) > 0.9994).astype(np.float32)
    return (bed + np.convolve(drops, np.exp(-np.arange(300) / 40.0), 'same') * 0.5) * np.minimum(1, t_axis(seconds) * 2)


def splash(seconds, rng):
    t = t_axis(seconds)
    return lowpass(highpass(noise(seconds, rng), 0.7), 0.35) * np.exp(-6 * t) * 1.4


def click_cue(seconds, rng):
    """Small mechanical ticks (robots, switches, gears)."""
    out = np.zeros(round(seconds * RATE), dtype=np.float32)
    for at in np.arange(0.2, seconds - 0.1, 0.45):
        tick = pop(0.025) * 0.9
        start = round((at + rng.uniform(-0.04, 0.04)) * RATE)
        out[start:start + len(tick)] += tick[:max(0, len(out) - start)]
    return out


def rustle(seconds, rng):
    """Leaves or fabric: band-limited noise with slow irregular swelling."""
    t = t_axis(seconds)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * (1.3 + 0.7 * rng.random()) * t + rng.random() * 6)
    return lowpass(highpass(noise(seconds, rng), 0.88), 0.4) * swell * np.minimum(1, t * 4) * 1.2


ACCENT_TYPES = ('impact', 'riser-impact', 'stinger', 'swell', 'breath')
ACCENT_GAIN = {'impact': 0.34, 'riser': 0.16, 'tail': 0.14, 'swell': 0.22}
MAX_ACCENTS = 6
RISER_SECONDS, TAIL_SECONDS, SWELL_SECONDS, BREATH_SECONDS, BREATH_DEPTH = 1.2, 1.6, 1.2, 0.3, 0.2
BREATH_RAMP = 0.05
BREATH_FRAME = 240  # ffmpeg evaluates volume once per audio frame; default frames are ~42 ms, which made the dip chunky and late. 240 samples = 5 ms


def impact(length=0.9):
    """Sub-bass drop (98 to 38 Hz) with a short weighted click; the attack is under 1 ms, so the onset is the marked time."""
    t = t_axis(length)
    phase = 2 * np.pi * np.cumsum(38 + 60 * np.exp(-9 * t)) / RATE
    body = np.sin(phase) * np.exp(-4.2 * t)
    click = lowpass(noise(length, np.random.default_rng(17)), 0.25) * np.exp(-60 * t) * 0.9
    return ((body + click) * np.minimum(1, t * 1500)).astype(np.float32)


def riser(length=RISER_SECONDS, rng=None):
    """Noise whose low-pass opens from dull to bright while it gets louder, so the top end builds into the impact."""
    rng = rng or np.random.default_rng(23)
    t = t_axis(length)
    x = noise(length, rng)
    alpha = 0.015 * (0.9 / 0.015) ** (t / length)
    out = np.zeros_like(x)
    y = 0.0
    for i, v in enumerate(x):
        y += alpha[i] * (v - y)
        out[i] = y
    return (out * (t / length) ** 2 * 0.9).astype(np.float32)


def ring_out(length=TAIL_SECONDS):
    """Three staggered bell partials that decay: the shimmer that rings over a final hold."""
    out = np.zeros(round(length * RATE), dtype=np.float32)
    for freq, delay in ((2349.0, 0.0), (3136.0, 0.09), (3520.0, 0.19)):
        if length - delay <= 0.05:
            continue
        piece = chime(freq, length - delay) * 0.5
        start = round(delay * RATE)
        out[start:start + len(piece)] += piece[:len(out) - start]
    return out


def swell(length=SWELL_SECONDS):
    t = t_axis(length)
    env = np.sin(np.pi * t / length) ** 2
    return ((np.sin(2 * np.pi * 55 * t) + 0.4 * np.sin(2 * np.pi * 110 * t)) * env).astype(np.float32)


def resolve_accents(data):
    """audioPlan.accents plus accents declared on a shot as `hit` {type, atSeconds} (seconds into that shot).
    Returns (accents, problems). A hit offset is turned into film time so sound follows the visual event."""
    plan = data.get('audioPlan') or {}
    explicit = plan.get('accents') or []
    accents = list(explicit) if isinstance(explicit, list) else explicit
    problems, start = [], 0.0
    if not isinstance(accents, list):
        return accents, []
    for number, shot in enumerate(data['plan']['shots'], 1):
        hit = shot.get('hit')
        if hit is not None:
            offset = hit.get('atSeconds') if isinstance(hit, dict) else None
            if isinstance(offset, bool) or not isinstance(offset, (int, float)) or not 0 <= offset <= shot['seconds']:
                problems.append(f'shot {number}: hit.atSeconds must be a number from 0 to {shot["seconds"]:g} (seconds into the shot)')
            else:
                accents.append({**{k: v for k, v in hit.items() if k != 'atSeconds'}, 'at': round(start + offset, 3)})
        start += shot['seconds']
    return accents, problems


def audit_accents(accents, total):
    """Problems with an audioPlan.accents list; empty when the plan can be mixed as written."""
    if not accents:
        return []
    if not isinstance(accents, list):
        return ['accent plan must be a list']
    problems = []
    if len(accents) > MAX_ACCENTS:
        problems.append(f'accent plan has {len(accents)} accents; the maximum is {MAX_ACCENTS}')
    hits = []
    for number, accent in enumerate(accents, 1):
        kind = accent.get('type') if isinstance(accent, dict) else None
        if kind not in ACCENT_TYPES:
            problems.append(f'accent plan item {number}: unknown type {kind!r}; use one of {", ".join(ACCENT_TYPES)}')
            continue
        at = accent.get('at')
        if isinstance(at, bool) or not isinstance(at, (int, float)) or not 0 <= at <= total:
            problems.append(f'accent plan item {number}: at must be a number between 0 and {total:g} seconds')
            continue
        if kind == 'riser-impact' and at < accent.get('riserSeconds', RISER_SECONDS):
            problems.append(f'accent plan item {number}: the riser is longer than the time before it ends at {at:g} s')
        if kind == 'stinger' and at + accent.get('tailSeconds', TAIL_SECONDS) > total + 0.05:
            problems.append(f'accent plan item {number}: the stinger tail does not fit before the end of the film')
        if kind == 'swell' and not 0.3 <= accent.get('seconds', SWELL_SECONDS) <= 3:
            problems.append(f'accent plan item {number}: a swell lasts 0.3 to 3 s')
        if kind == 'breath':
            seconds, depth = accent.get('seconds', BREATH_SECONDS), accent.get('depth', BREATH_DEPTH)
            if not 0.2 <= seconds <= 0.6 or not 0 <= depth <= 0.8 or at - seconds < 0:
                problems.append(f'accent plan item {number}: a breath needs 0.2 to 0.6 s, depth 0 to 0.8, and must start inside the film')
        if kind in ('impact', 'riser-impact', 'stinger'):
            hits.append(at)
    hits.sort()
    for before, after in zip(hits, hits[1:]):
        if after - before < 0.5:
            problems.append(f'accent plan: impacts at {before:g} s and {after:g} s are closer than 0.5 s')
    return problems


def breath_filter(accents):
    """ffmpeg volume expression (smooth ramps, no hard steps) that dips the soundtrack just before each hero cut."""
    parts = []
    for accent in accents or []:
        if accent.get('type') != 'breath':
            continue
        end = float(accent['at'])
        start = end - float(accent.get('seconds', BREATH_SECONDS))
        depth = float(accent.get('depth', BREATH_DEPTH))
        parts.append(f'(1-{1 - depth:.3f}*clip(min((t-{start:.3f})/{BREATH_RAMP},({end:.3f}-t)/{BREATH_RAMP}),0,1))')
    return '*'.join(parts) or None


def breath_chain(accents):
    """The ffmpeg filter chain for all breaths (5 ms frames so the dip is smooth and recovers exactly on the cut), or None."""
    expr = breath_filter(accents)
    return f"asetnsamples=n={BREATH_FRAME}:p=0,volume='{expr}':eval=frame" if expr else None


def breath_over_narration(accents, voice, rate=RATE, threshold=0.01):
    """A breath ducks the whole soundtrack, so a breath that lands on speech is a problem."""
    problems = []
    for accent in accents or []:
        if accent.get('type') != 'breath':
            continue
        end = float(accent['at'])
        piece = voice[max(0, round((end - float(accent.get('seconds', BREATH_SECONDS))) * rate)):round(end * rate)]
        if len(piece) and float(np.sqrt(np.mean(piece.astype(np.float32) ** 2))) > threshold:
            problems.append(f'accent plan: the breath before {end:g} s overlaps narration; move it into a gap')
    return problems


def read_wav_mono(path):
    with wave.open(str(path)) as wav:
        data = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768
        if wav.getnchannels() > 1:
            data = data.reshape(-1, wav.getnchannels()).mean(axis=1)
        return data, wav.getframerate()


CUES = [(r'\brain', 'rain'), (r'\b(splash\w*|puddle\w*|ripple\w*)\b', 'splash'),
        (r'\b(click\w*|tick\w*|mechanical|gear\w*|servo\w*|beep\w*)\b', 'click'),
        (r'\b(rustl\w*|leaves|foliage|grass|bloom\w*|sprout\w*)\b', 'rustle'),
        (r'\b(footstep\w*|pitter\w*|paws?|stomp\w*|hoof\w*|paddl\w*)\b', 'pat'),
        (r'\bbounc\w*', 'bounce'),
        (r'\b(breez\w*|wind\w*|gust\w*)\b', 'whoosh'),
        (r'\bsizzl', 'sizzle'), (r'\b(crunch|crispy|crisp|bite|biting|crack|snap)\b', 'crunch'),
        (r'\b(chew\w*|munch\w*)\b', 'chew'), (r'\b(pour\w*|drizzl\w*|stream of sauce)\b', 'pour'),
        (r'\b(slice|slicing|chop|chopping|knife cut)\b', 'slice'),
        (r'\b(scrap\w*|spread\w*|drag\w*)\b', 'scrape'),
        (r'\b(clink\w*|plate tap|glass tap|utensil tap)\b', 'clink'),
        (r'\b(shimmer|sparkl)', 'shimmer'), (r'\bchime', 'chime'), (r'\b(flour|pat|patting)\b', 'pat'),
        (r'\bsqueak', 'squeak'), (r'\b(whoosh|glide|sweep)', 'whoosh'), (r'\b(pop|popped|popping)\b', 'pop'), (r'\b(fizz|champagne)', 'fizz'),
        (r'\b(ambience|ambient|room tone|hum)\b', 'room')]
GAIN = {'sizzle': 0.15, 'crunch': 0.16, 'chew': 0.08, 'pour': 0.13, 'slice': 0.12, 'scrape': 0.10, 'clink': 0.10,
        'shimmer': 0.16, 'chime': 0.18, 'pat': 0.18, 'squeak': 0.12, 'pop': 0.18, 'whoosh': 0.06, 'fizz': 0.13, 'room': 0.08,
        'rain': 0.12, 'splash': 0.14, 'click': 0.16, 'rustle': 0.12, 'bounce': 0.16}


def cues_for(text):
    found = []
    for pattern, name in CUES:
        if re.search(pattern, text, re.I) and name not in found:
            found.append(name)
    return found


FOOD_ONLY = {'clink', 'sizzle', 'crunch', 'chew', 'pour', 'slice', 'scrape', 'fizz'}
FOOD_WORDS = re.compile(r'\b(food|dish|plate|bowl|meal|cook\w*|chef|kitchen|steak|beef|burger|kebab|sushi|pasta|pizza|cake|dessert|sauce|soup|salad|egg|bread|wagyu|truffle|caviar|drink|coffee|champagne|cheese|fries|taco)\b', re.I)


def is_food(shot):
    return bool(FOOD_WORDS.search(' '.join(str(shot.get(k, '')) for k in ('imagePrompt', 'motionPrompt'))))


def planned_cues(shot):
    names = cues_for(shot.get('sound', ''))
    if not names:
        names = cues_for(shot.get('motionPrompt', '') + ' ' + shot.get('imagePrompt', ''))
    if not is_food(shot):  # paper boats and foxes do not clink plates
        names = [n for n in names if n not in FOOD_ONLY]
    if not shot.get('sound', '').strip() and name_hint(shot) and 'fizz' not in names:
        names.append('fizz')
    return names


def audit_cues(data):
    """Fail before GPU use when an ASMR sound plan cannot create its stated cues."""
    from presentation_mode import choose
    mode = choose(data)['mode']
    problems = []
    audio_plan = data.get('audioPlan') or {}
    samples = audio_plan.get('foleySamples') or {}
    recordings_only = audio_plan.get('sfxPolicy') == 'recordings-only'
    required = audio_plan.get('requiredCues') or []
    for number, shot in enumerate(data['plan']['shots'], 1):
        explicit = shot.get('sound', '').strip()
        names = planned_cues(shot)
        print(f'Shot {number} sound: {", ".join(names) or "none"}')
        if mode == 'asmr' and (not explicit or not cues_for(explicit) or not names):
            problems.append(f'shot {number}: ASMR sound line needs a supported Foley cue that fits this scene')
        if recordings_only:
            for name in names:
                if name not in samples:
                    problems.append(f'shot {number}: {name} needs a matching field recording; synthesized Foley is disabled')
    if recordings_only and 'room' not in samples:
        problems.append('recordings-only mix needs a real room ambience recording')
    for name in required:
        if name not in GAIN:
            problems.append(f'required sound cue {name}: unsupported cue name')
        elif name not in samples:
            problems.append(f'required sound cue {name}: matching field recording is missing')
        elif not any(name in planned_cues(shot) for shot in data['plan']['shots']):
            problems.append(f'required sound cue {name}: no shot schedules the cue')
    resolved, hit_problems = resolve_accents(data)
    problems.extend(hit_problems)
    problems.extend(audit_accents(resolved, sum(shot['seconds'] for shot in data['plan']['shots'])))
    for name, source in samples.items():
        file = ROOT / str(source.get('file', ''))
        if name not in GAIN or not file.is_file() or file.suffix.lower() not in ('.ogg', '.wav', '.mp3'):
            problems.append(f'foley sample {name}: supported local audio file is missing')
        if recordings_only and not all(str(source.get(key, '')).strip() for key in ('recordedAction', 'sourceUrl', 'license')):
            problems.append(f'foley sample {name}: recordedAction, sourceUrl and license are required')
    if mode == 'asmr' and not problems:
        shots = data['plan']['shots']
        total = sum(shot['seconds'] for shot in shots)
        preview, _ = build(shots, total, foley_samples=samples,
                           continuous_room=True, recordings_only=recordings_only)
        window = RATE // 5
        # Judge silence against how loud the film normally is, not its single loudest
        # transient (a sizzle pop made quiet-but-audible rustles look like gaps).
        levels = [float(np.sqrt(np.mean(preview[i:i + window] ** 2))) for i in range(0, len(preview) - window + 1, window)]
        floor = max(0.001, float(np.percentile(levels, 95)) * 0.08) if levels else 0.001
        quiet = 0
        for start in range(0, len(preview), window):
            segment = preview[start:start + window]
            rms = float(np.sqrt(np.mean(segment * segment))) if len(segment) else 0
            quiet = quiet + 1 if rms < floor else 0
            if quiet * window / RATE >= 1.5:
                problems.append('ASMR sound plan has a gap of at least 1.5 s before rendering')
                break
    if problems:
        for problem in problems:
            print('BLOCKED:', problem)
            gate_event('sound', 'blocked', sound_code(problem), problem)
    else:
        print('Sound cue and ASMR coverage plan passed. Listen to the finished mix before release.')
        gate_event('sound', 'passed', 'sound-plan-ok')
    return problems


def recording_slice(source, seconds):
    """Decode a declared local field recording and take a short, faded cue."""
    file = (ROOT / source['file']).resolve()
    if not file.is_relative_to(ROOT.resolve()) or not file.is_file():
        raise ValueError(f'Unsafe or missing Foley recording: {file}')
    start = max(0, float(source.get('offsetSeconds', 0)))
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(seconds),
                                   '-i', str(file), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'])
    signal = np.frombuffer(raw, dtype='<f4').copy()
    if len(signal) < RATE // 10:
        raise ValueError(f'Foley recording is too short at offset {start}: {file}')
    peak = float(np.max(np.abs(signal)))
    if peak < 1e-5:
        raise ValueError(f'Foley recording is silent at offset {start}: {file}')
    fade = min(RATE // 20, len(signal) // 4)
    signal[:fade] *= np.linspace(0, 1, fade)
    signal[-fade:] *= np.linspace(1, 0, fade)
    return signal / peak * float(source.get('gain', 0.7))


def build(shots, total, seed=311, foley_samples=None, continuous_room=False, recordings_only=False, accents=None):
    rng = np.random.default_rng(seed)
    mix = np.zeros(round(total * RATE), dtype=np.float32)
    plan = []

    def put_hit(signal, at, gain, fade_out=0.01):
        """Place an accent so its first sample lands exactly on `at`: no fade-in, only a short fade-out."""
        start = round(at * RATE)
        if start < 0:
            signal, start = signal[-start:], 0
        count = min(len(signal), len(mix) - start)
        if count > 0:
            piece = signal[:count].astype(np.float32).copy()
            ramp = min(count // 2, round(fade_out * RATE))
            if ramp > 1:
                piece[-ramp:] *= np.linspace(1, 0, ramp, dtype=np.float32)
            mix[start:start + count] += piece * gain

    def put(signal, at, gain):
        start = round(at * RATE)
        count = min(len(signal), len(mix) - start)
        if count > 0:
            piece = signal[:count].astype(np.float32).copy()
            ramp = min(count // 2, round(0.03 * RATE))
            if ramp > 1:  # 30 ms fades: no hard edges, so no clicks at shot boundaries
                piece[:ramp] *= np.linspace(0, 1, ramp, dtype=np.float32)
                piece[-ramp:] *= np.linspace(1, 0, ramp, dtype=np.float32)
            mix[start:start + count] += piece * gain

    if continuous_room:
        # An ASMR film still has an acoustic floor between discrete actions.
        # This is quiet kitchen ambience, not a music bed.
        if recordings_only:
            if not foley_samples or 'room' not in foley_samples:
                raise ValueError('recordings-only ASMR needs recorded room ambience')
            put(recording_slice(foley_samples['room'], total), 0, GAIN['room'] * 0.6)
        else:
            put(room(total, rng), 0, GAIN['room'] * 0.6)

    at = 0.0
    for number, shot in enumerate(shots, 1):
        length = shot['seconds']
        names = planned_cues(shot)
        for name in names:
            if name == 'room' and continuous_room:
                plan.append((number, name))
                continue
            if name in (foley_samples or {}):
                duration = min(length - 0.4, 3.5 if name == 'sizzle' else 1.1)
                put(recording_slice(foley_samples[name], duration), at + 0.2, GAIN[name])
            elif recordings_only:
                raise ValueError(f'Shot {number} needs a recording for {name}')
            elif name == 'sizzle': put(sizzle(min(length, 3.5), rng), at + 0.2, GAIN[name])
            elif name == 'crunch': put(crunch(min(length, 1.2), rng), at + min(0.7, length / 4), GAIN[name])
            elif name == 'chew': put(pat(min(length, 2.5), rng), at + 0.5, GAIN[name])
            elif name == 'pour': put(pour(min(length, 3.0), rng), at + 0.4, GAIN[name])
            elif name == 'slice': put(slice_food(min(length, 0.7), rng), at + 0.6, GAIN[name])
            elif name == 'scrape': put(scrape_food(min(length, 0.9), rng), at + 0.5, GAIN[name])
            elif name == 'clink': put(chime(1300, 0.35), at + 0.5, GAIN[name])
            elif name == 'shimmer': put(shimmer(length - 0.3, rng), at + 0.3, GAIN[name])
            elif name == 'chime': put(chime(), at + (length - 1.8 if number == len(shots) else 0.4), GAIN[name])
            elif name == 'bounce': put(bounce(length, rng), at, GAIN[name])
            elif name == 'pat': put(pat(length, rng), at, GAIN[name])
            elif name == 'whoosh': put(whoosh(1.1, rng), at + 0.5, GAIN[name])
            elif name == 'squeak': put(squeak(), at + 1.2, GAIN[name])
            elif name == 'pop': put(pop(), at + length - 1.2, GAIN[name])
            elif name == 'fizz': put(fizz(length, rng), at, GAIN[name])
            elif name == 'room': put(room(length, rng), at, GAIN[name])
            elif name == 'rain': put(rain(length, rng), at, GAIN[name])
            elif name == 'splash': put(splash(min(length, 1.2), rng), at + 0.5, GAIN[name])
            elif name == 'click': put(click_cue(min(length, 3.0), rng), at + 0.2, GAIN[name])
            elif name == 'rustle': put(rustle(min(length, 3.0), rng), at + 0.3, GAIN[name])
            plan.append((number, name))
        at += length
    for accent in accents or []:  # opt-in; own generator so foley stays identical with or without accents
        kind, when, gain = accent['type'], float(accent['at']), float(accent.get('gain', 1.0))
        if kind in ('impact', 'riser-impact', 'stinger'):
            put_hit(impact(), when, ACCENT_GAIN['impact'] * gain)
        if kind == 'riser-impact':
            lead = float(accent.get('riserSeconds', RISER_SECONDS))
            put_hit(riser(lead), when - lead, ACCENT_GAIN['riser'] * gain)
        if kind == 'stinger':
            tail = min(float(accent.get('tailSeconds', TAIL_SECONDS)), total - when - 0.04)
            if tail > 0.1:
                put_hit(ring_out(tail), when + 0.04, ACCENT_GAIN['tail'] * gain, fade_out=0.05)
        if kind == 'swell':
            length = float(accent.get('seconds', SWELL_SECONDS))
            put_hit(swell(length), when - length / 2, ACCENT_GAIN['swell'] * gain, fade_out=0.05)
        plan.append((0, kind))
    return mix, plan


def name_hint(shot):
    """Bubbles in the motion prompt (champagne) also count as a fizz cue."""
    return bool(re.search(r'bubbles rise|champagne', shot.get('motionPrompt', ''), re.I))


def write_wav(path, mono, peak_target=0.45):
    """Scale the whole effects layer so its loudest moment sits at peak_target (-7 dBFS); the gains set the balance between effects."""
    peak = float(np.max(np.abs(mono))) or 1.0
    data = (np.clip(mono * (peak_target / peak), -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(data.tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--video', type=Path)
    parser.add_argument('--audit', action='store_true', help='Check the planned Foley cues before spending GPU time')
    parser.add_argument('--work-dir', type=Path)
    args = parser.parse_args()
    scenario = args.scenario.resolve()
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    if args.audit:
        raise SystemExit(1 if audit_cues(data) else 0)
    if audit_cues(data):
        raise SystemExit('Sound cue gate failed; refusing to mix unsupported cues')
    if not args.video:
        parser.error('--video is required unless --audit is used')
    video = args.video.resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).resolve()
    shots = data['plan']['shots']
    total = sum(shot['seconds'] for shot in shots)
    from presentation_mode import choose
    recordings_only = (data.get('audioPlan') or {}).get('sfxPolicy') == 'recordings-only'
    accents = resolve_accents(data)[0]
    voice = work / 'voice-timeline.wav'
    if any(a.get('type') == 'breath' for a in accents) and voice.is_file():
        speech, speech_rate = read_wav_mono(voice)
        overlap = breath_over_narration(accents, speech, speech_rate)
        if overlap:
            for problem in overlap:
                print('BLOCKED:', problem)
                gate_event('sound', 'blocked', sound_code(problem), problem)
            raise SystemExit('Sound accent gate failed; refusing to mix a breath over narration')
    mix, plan = build(shots, total, foley_samples=(data.get('audioPlan') or {}).get('foleySamples'),
                      continuous_room=choose(data)['mode'] == 'asmr' or recordings_only,
                      recordings_only=recordings_only, accents=accents)
    sfx = video.with_suffix('.sfx.wav')
    write_wav(sfx, mix)
    out = video.with_suffix('.sfx.mp4')
    breath = breath_chain(accents)
    base_chain = "[0:a]highpass=f=70,afftdn=nr=6:nf=-45" + (f',{breath}' if breath else '') + '[base]'
    graph = ('[1:a]aresample=48000[fx];[2:a]aresample=48000[key];'
             '[fx][key]sidechaincompress=threshold=0.003:ratio=20:attack=8:release=350[duck];'
             + base_chain + ';[base][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-i', str(sfx), '-i', str(voice), '-filter_complex', graph,
                    '-map', '0:v', '-map', '[a]', '-t', str(total), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', str(out)], check=True)
    print(f'Wrote {out.name}. Effects placed: ' + ', '.join(f'shot {n} {name}' if n else f'accent {name}' for n, name in plan))


if __name__ == '__main__':
    main()
