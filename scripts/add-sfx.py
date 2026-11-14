"""Add synthesized sound effects to a finished local video, driven by each shot's `sound` line.

  python3 scripts/add-sfx.py --scenario drafts/generated/ID.local-scenario.json --video outputs/ID.mp4 [--work-dir DIR]

Writes outputs/ID.sfx.mp4 (picture copied, audio remixed) and ID.sfx.wav. Everything is generated here from
noise and sine tones, so there is nothing to license. Effects sit low and are ducked under the narration
(the voice track in the work folder is the ducking key), then the mix is loudness-normalised again.
Cue words in a shot's `sound` or action prompts: sizzle, crunch/bite, chew, pour, slice, spoon/plate clink,
chime/shimmer, pat, bubble/pop, squeak, fizz and room tone. These are original synthesized Foley approximations.
"""
import argparse
import json
import re
import subprocess
import wave
from pathlib import Path

import numpy as np

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


CUES = [(r'\bsizzl', 'sizzle'), (r'\b(crunch|crispy|crisp|bite|biting|crack|snap)\b', 'crunch'),
        (r'\b(chew\w*|munch\w*)\b', 'chew'), (r'\b(pour\w*|drizzl\w*|stream of sauce)\b', 'pour'),
        (r'\b(slice|slicing|chop|chopping|knife cut)\b', 'slice'),
        (r'\b(spoon|fork|utensil|plate|ceramic|glass clink)\b', 'clink'),
        (r'\b(shimmer|sparkl)', 'shimmer'), (r'\bchime', 'chime'), (r'\b(flour|pat|patting)\b', 'pat'),
        (r'\bsqueak', 'squeak'), (r'\b(whoosh|glide|sweep)', 'whoosh'), (r'\b(pop|popped|popping)\b', 'pop'), (r'\b(fizz|champagne)', 'fizz'),
        (r'\b(ambience|ambient|room tone|hum)\b', 'room')]
GAIN = {'sizzle': 0.15, 'crunch': 0.16, 'chew': 0.08, 'pour': 0.13, 'slice': 0.12, 'clink': 0.10,
        'shimmer': 0.16, 'chime': 0.18, 'pat': 0.18, 'squeak': 0.12, 'pop': 0.18, 'whoosh': 0.06, 'fizz': 0.13, 'room': 0.08}


def cues_for(text):
    found = []
    for pattern, name in CUES:
        if re.search(pattern, text, re.I) and name not in found:
            found.append(name)
    return found


def build(shots, total, seed=311):
    rng = np.random.default_rng(seed)
    mix = np.zeros(round(total * RATE), dtype=np.float32)
    plan = []

    def put(signal, at, gain):
        start = round(at * RATE)
        count = min(len(signal), len(mix) - start)
        if count > 0:
            mix[start:start + count] += signal[:count] * gain

    at = 0.0
    for number, shot in enumerate(shots, 1):
        length = shot['seconds']
        names = cues_for(shot.get('sound', '') + ' ' + shot.get('motionPrompt', ''))
        if not names:
            names = cues_for(shot.get('imagePrompt', ''))
        if name_hint(shot) and 'fizz' not in names:
            names.append('fizz')
        for name in names:
            if name == 'sizzle': put(sizzle(min(length, 3.5), rng), at + 0.2, GAIN[name])
            elif name == 'crunch': put(crunch(min(length, 1.2), rng), at + min(0.7, length / 4), GAIN[name])
            elif name == 'chew': put(pat(min(length, 2.5), rng), at + 0.5, GAIN[name])
            elif name == 'pour': put(pour(min(length, 3.0), rng), at + 0.4, GAIN[name])
            elif name == 'slice': put(slice_food(min(length, 0.7), rng), at + 0.6, GAIN[name])
            elif name == 'clink': put(chime(1300, 0.35), at + 0.5, GAIN[name])
            elif name == 'shimmer': put(shimmer(length - 0.3, rng), at + 0.3, GAIN[name])
            elif name == 'chime': put(chime(), at + (length - 1.8 if number == len(shots) else 0.4), GAIN[name])
            elif name == 'pat': put(pat(length, rng), at, GAIN[name])
            elif name == 'whoosh': put(whoosh(1.1, rng), at + 0.5, GAIN[name])
            elif name == 'squeak': put(squeak(), at + 1.2, GAIN[name])
            elif name == 'pop': put(pop(), at + length - 1.2, GAIN[name])
            elif name == 'fizz': put(fizz(length, rng), at, GAIN[name])
            elif name == 'room': put(room(length, rng), at, GAIN[name])
            plan.append((number, name))
        at += length
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
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path)
    args = parser.parse_args()
    scenario, video = args.scenario.resolve(), args.video.resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).resolve()
    shots = json.loads(scenario.read_text(encoding='utf-8-sig'))['plan']['shots']
    total = sum(shot['seconds'] for shot in shots)
    mix, plan = build(shots, total)
    sfx = video.with_suffix('.sfx.wav')
    write_wav(sfx, mix)
    out = video.with_suffix('.sfx.mp4')
    voice = work / 'voice-timeline.wav'
    graph = ('[1:a]aresample=48000[fx];[2:a]aresample=48000[key];'
             '[fx][key]sidechaincompress=threshold=0.003:ratio=20:attack=8:release=350[duck];'
             '[0:a][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[a]')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-i', str(sfx), '-i', str(voice), '-filter_complex', graph,
                    '-map', '0:v', '-map', '[a]', '-t', str(total), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', str(out)], check=True)
    print(f'Wrote {out.name}. Effects placed: ' + ', '.join(f'shot {n} {name}' for n, name in plan))


if __name__ == '__main__':
    main()
