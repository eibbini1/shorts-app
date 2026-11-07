"""Original local lounge music and stylized cooking sound design."""
from pathlib import Path
import wave
import os
import numpy as np
RATE=48000
N=RATE*30
rng=np.random.default_rng(601)
mix=np.zeros((N,2),dtype=np.float32)
def add(y,start,gain=1,pan=0):
    i=round(start*RATE); n=min(len(y),N-i)
    if n<=0:return
    mix[i:i+n,0]+=y[:n]*gain*(1-max(0,pan))
    mix[i:i+n,1]+=y[:n]*gain*(1+min(0,pan))
def note(freq,length=2):
    t=np.arange(round(length*RATE))/RATE
    return (np.sin(2*np.pi*freq*t)+.22*np.sin(4*np.pi*freq*t))*np.exp(-2*t)*np.minimum(1,t*100)
chords=[[130.81,164.81,196,246.94],[110,130.81,164.81,196],[87.31,130.81,174.61,220],[98,146.83,196,246.94]]
for start in np.arange(0,30,3.75):
    chord=chords[int(start/3.75)%4]
    add(note(chord[0]/2,3),start,.017)
    for j,f in enumerate(chord[1:]): add(note(f*2,2.7),start+j*.12,.013,(-.18 if j%2 else .18))
    for beat in np.arange(0,3.75,.75):
        t=np.arange(round(.08*RATE))/RATE
        add(rng.normal(size=len(t))*np.exp(-55*t),start+beat,.003)
# Butter and steak sizzling, pulsing softly through searing and basting.
t=np.arange(RATE*11)/RATE
noise=rng.normal(size=len(t))
noise=noise-np.convolve(noise,np.ones(25)/25,mode='same')
env=np.minimum(1,t*2)*np.minimum(1,(11-t)*2)*(.7+.15*np.sin(2*np.pi*.8*t))
add(noise*env,4,.017)
for at in (4.2,5.4,6.8,8.2,10.7,12.3):
    t=np.arange(round(.08*RATE))/RATE
    add(rng.normal(size=len(t))*np.exp(-65*t),at,.025)
# Soft knife contact and plate/utensil sounds.
for at in (15.6,17.2,18.5):
    t=np.arange(round(.12*RATE))/RATE
    add((np.sin(2*np.pi*170*t)+.15*rng.normal(size=len(t)))*np.exp(-40*t),at,.045)
for at in (20.0,24.2):
    t=np.arange(round(.5*RATE))/RATE
    add((np.sin(2*np.pi*1450*t)+.3*np.sin(2*np.pi*2100*t))*np.exp(-14*t),at,.018)
fade=np.minimum(1,np.arange(N)/(.3*RATE))*np.minimum(1,(N-np.arange(N))/(1.2*RATE))
mix*=fade[:,None]
work=Path(os.environ.get('GOLD_STEAK_WORK_DIR',Path(__file__).resolve().parents[2]/'storage/gold-steak-local')).expanduser().resolve()
work.mkdir(parents=True,exist_ok=True)
out=work/'soundtrack.wav'
with wave.open(str(out),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE)
    f.writeframes((np.clip(mix,-1,1)*32767).astype(np.int16).tobytes())
print(out)
