"""Original 96 BPM luxury-food rhythm, synthesized without samples."""

import math
import os
import random
import wave
from array import array
from pathlib import Path

SR = 48000
DURATION = 30
N = SR * DURATION
LEFT = array('f', [0.0]) * N
RIGHT = array('f', [0.0]) * N
RNG = random.Random(42)


def add(t, duration, synth, gain=1.0, pan=0.0):
    start = round(t * SR)
    count = min(round(duration * SR), N - start)
    for i in range(max(0, count)):
        v = synth(i / SR, i) * gain
        LEFT[start + i] += v * (1 - max(0, pan))
        RIGHT[start + i] += v * (1 + min(0, pan))


def kick(t, i):
    phase = 2 * math.pi * (48 * t + 100 * (1 - math.exp(-24 * t)) / 24)
    return math.sin(phase) * math.exp(-18 * t)


def snap(t, i):
    return RNG.uniform(-1, 1) * math.exp(-37 * t) * (0.7 + 0.3 * math.sin(2 * math.pi * 2400 * t))


def hat(t, i):
    return RNG.uniform(-1, 1) * math.exp(-100 * t)


def pluck(freq):
    return lambda t, i: (math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(2 * math.pi * freq * 2 * t)) * math.exp(-8 * t)


beat = 60 / 96
chords = [220.0, 174.61, 261.63, 196.0]
for b in range(48):
    t = b * beat
    add(t, 0.28, kick, 0.16 if b % 4 == 0 else 0.10)
    if b % 4 in (1, 3):
        add(t, 0.16, snap, 0.09)
    add(t, 0.07, hat, 0.035, -0.3 if b % 2 else 0.3)
    add(t + beat / 2, 0.06, hat, 0.025, 0.25 if b % 2 else -0.25)
    if b % 2 == 0:
        add(t + 0.02, 0.50, pluck(chords[min(3, b // 12)]), 0.047)

out = Path(os.environ.get('CHOCOLATE_WORK_DIR', 'storage/chocolate-short-local')) / 'beat.wav'
with wave.open(str(out), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(SR)
    samples = array('h')
    for l, r in zip(LEFT, RIGHT):
        samples.append(round(max(-1, min(1, l)) * 32767))
        samples.append(round(max(-1, min(1, r)) * 32767))
    wav.writeframes(samples.tobytes())
print(out)
