"""Create a quiet original instrumental bed with subtle shot transitions."""
import json
import sys
import wave
from pathlib import Path
import numpy as np

scenario = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
work = Path(sys.argv[2]); work.mkdir(parents=True, exist_ok=True)
seconds = sum(shot['seconds'] for shot in scenario['plan']['shots'])
rate = 48000
n = rate * seconds
mix = np.zeros((n, 2), dtype=np.float32)
rng = np.random.default_rng(902)

def add(signal, at, gain):
    start = round(at * rate)
    count = min(len(signal), n - start)
    if count > 0: mix[start:start+count] += signal[:count, None] * gain

def tone(freq, length):
    t = np.arange(round(length * rate)) / rate
    return (np.sin(2*np.pi*freq*t) + .15*np.sin(4*np.pi*freq*t)) * np.exp(-1.15*t) * np.minimum(1, t*50)

chords = ((130.81,164.81,196),(110,146.83,196),(98,130.81,174.61),(116.54,155.56,196))
for beat, at in enumerate(np.arange(0, seconds, 3.5)):
    chord = chords[beat % len(chords)]
    for j, freq in enumerate(chord): add(tone(freq, 3.2), at + .09*j, .007 if j else .011)
at = 0
for shot in scenario['plan']['shots'][:-1]:
    at += shot['seconds']
    t = np.arange(round(.13*rate))/rate
    add(rng.normal(size=len(t))*np.exp(-38*t), at, .002)
fade = np.minimum(1, np.arange(n)/(.35*rate))*np.minimum(1,(n-np.arange(n))/(1.1*rate))
mix *= fade[:,None]
with wave.open(str(work/'soundtrack.wav'), 'wb') as wav:
    wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(rate)
    wav.writeframes((np.clip(mix,-1,1)*32767).astype(np.int16).tobytes())
print(work/'soundtrack.wav')
