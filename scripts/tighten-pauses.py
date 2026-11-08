#!/usr/bin/env python3
"""Cut dead air from a finished captioned Short without re-rendering.
Finds silences over 1.0 s and removes the middle of each so about 1.0 s remains. Picture and sound are cut together, so burned captions stay in sync.
Usage: python3 scripts/tighten-pauses.py VIDEO.captioned.mp4   (writes VIDEO.tight.mp4)"""
import re, subprocess, sys
from pathlib import Path
KEEP = 1.0
src = Path(sys.argv[1]); out = src.with_name(src.name.replace('.captioned.mp4', '') + '.tight.mp4')
dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(src)],capture_output=True,text=True).stdout)
log = subprocess.run(['ffmpeg','-hide_banner','-i',str(src),'-af','silencedetect=noise=-35dB:d=1.0','-f','null','-'],capture_output=True,text=True).stderr
st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
cuts = []
for i, a in enumerate(st):
    b = en[i] if i < len(en) else dur
    if b - a > KEEP + 0.2: cuts.append((a + KEEP * 0.5, b - KEEP * 0.5 + (0.1 if b < dur else 0)) if b < dur else (a + KEEP * 0.5, dur))
keep, pos = [], 0.0
for a, b in cuts:
    keep.append((pos, a)); pos = b
if pos < dur - 0.05: keep.append((pos, dur))
fc = ''.join(f'[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}];' for i,(a,b) in enumerate(keep))
fc += ''.join(f'[v{i}][a{i}]' for i in range(len(keep))) + f'concat=n={len(keep)}:v=1:a=1[v][a]'
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(src),'-filter_complex',fc,'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','aac','-b:a','192k',str(out)],check=True)
print(f'{src.name}: {dur:.1f}s -> {sum(b-a for a,b in keep):.1f}s, wrote {out.name}')
