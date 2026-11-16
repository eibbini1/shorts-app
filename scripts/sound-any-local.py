"""Create a checked licensed music bed, synthetic bed, or silence for a scenario."""
import json
import subprocess
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
music_intent = str((scenario.get('audioPlan') or {}).get('music', 'auto')).strip().lower()
no_music = music_intent in ('none', 'no music', 'off', 'silent')
recorded_music = music_intent == 'licensed-track'

def add(signal, at, gain):
    start = round(at * rate)
    count = min(len(signal), n - start)
    if count > 0: mix[start:start+count] += signal[:count, None] * gain

def tone(freq, length):
    t = np.arange(round(length * rate)) / rate
    return (np.sin(2*np.pi*freq*t) + .15*np.sin(4*np.pi*freq*t)) * np.exp(-1.15*t) * np.minimum(1, t*50)

if recorded_music:
    plan = scenario.get('audioPlan') or {}
    if not all(plan.get(key) for key in ('musicFile', 'musicSource', 'musicLicense', 'musicCredit')):
        raise SystemExit('Licensed music requires musicFile, musicSource, musicLicense and musicCredit')
    root = Path(__file__).resolve().parents[1]
    music_file = (root / plan['musicFile']).resolve()
    if not music_file.is_relative_to(root) or not music_file.is_file():
        raise SystemExit(f'Licensed music file is missing or outside the project: {music_file}')
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(music_file),
                              '-f', 'f32le', '-ac', '2', '-ar', str(rate), '-'],
                             capture_output=True, check=True).stdout
    samples = np.frombuffer(decoded, dtype='<f4').reshape(-1, 2)
    if len(samples) < n:
        raise SystemExit(f'Licensed music is too short: {len(samples)/rate:.1f}s for {seconds}s film')
    # Keep the recorded music audible while leaving room for spoken steps and Foley.
    mix += samples[:n] * .14
elif not no_music:
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
print(f"{work/'soundtrack.wav'} ({'no music' if no_music else 'licensed track' if recorded_music else 'instrumental bed'})")
