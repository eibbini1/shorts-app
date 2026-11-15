#!/usr/bin/env python3
"""Trend formats built from finished footage (CPU only, ffmpeg):

  split   Two films stacked top/bottom with a label on each half ($5 vs $5,000, built in sync).
  comic   Open on a comic-panel version of the film's own first frame, then dissolve into the real shot.
  reverse Un-build: play the picture backwards (finished dish -> raw ingredients). Drops the voice; use the uncaptioned .sfx.mp4.

Usage:
  scripts/trend-fx.py split --top CHEAP.mp4 --bottom RICH.mp4 --top-label '$5' --bottom-label '$5,000' --out OUT.mp4
  scripts/trend-fx.py comic --video FILM.mp4 --out OUT.mp4 [--hold 1.0] [--fade 0.6]
  scripts/trend-fx.py reverse --video FILM.sfx.mp4 --out OUT.mp4 [--label 'UN-COOK IT']
  scripts/trend-fx.py reel --item 'FILE|START|SECONDS|LABEL' --item ... --out OUT.mp4
"""
import argparse, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
FONT = str(ROOT / 'assets/fonts/Poppins-Bold.ttf')
ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed:\n{r.stderr[-900:]}")


def label(tmp, name, text, y, size='h*0.045', colour='0xF2C448'):
    f = Path(tmp) / f'{name}.txt'; f.write_text(text)
    return f"drawtext=textfile={f}:fontfile={FONT}:fontcolor={colour}:fontsize={size}:x=(w-text_w)/2:y={y}:borderw=7:bordercolor=black@0.9"


def split(a):
    with tempfile.TemporaryDirectory() as tmp:
        half = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:956:0:(ih-956)/2,setsar=1,fps=24"
        fc = (f"[0:v]{half},{label(tmp, 't', a.top_label, 'h*0.05', 'h*0.11')}[t];[1:v]{half},{label(tmp, 'b', a.bottom_label, 'h*0.05', 'h*0.11')}[b];"
              f"color=c=0xF2C448:s=1080x8:r=24[bar];[t][bar][b]vstack=inputs=3:shortest=1[v]")
        audio = ['-map', f'{1 if a.audio == "bottom" else 0}:a?']
        run(['ffmpeg', '-y', '-v', 'error', '-i', a.top, '-i', a.bottom, '-filter_complex', fc, '-map', '[v]', *audio, *ENC, '-c:a', 'aac', '-b:a', '192k', '-shortest', a.out])
    print(f'Done: {a.out}')


def comic(a):
    # ink outlines (edge detect) multiplied over flattened, saturated colour = comic panel of the film's own first frame
    panel = ("split[c0][c1];[c0]edgedetect=low=0.06:high=0.18,negate,format=gbrp[ink];"
             "[c1]eq=saturation=1.7:contrast=1.2,lutrgb=r='round(val/51)*51':g='round(val/51)*51':b='round(val/51)*51',format=gbrp[flat];"
             "[flat][ink]blend=all_mode=multiply,format=yuv420p")
    with tempfile.TemporaryDirectory() as tmp:
        h, f = a.hold, a.fade
        fc = (f"[0:v]fps=24,setsar=1,split[real][src];[src]trim=end_frame=1,{panel},loop=loop=-1:size=1,trim=duration={h + f},setpts=PTS-STARTPTS,"
              f"drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=18,fps=24,format=yuv420p,settb=AVTB[cp];"
              f"[real]tpad=start_duration={h}:start_mode=clone,fps=24,format=yuv420p,settb=AVTB[r2];[cp][r2]xfade=transition=fade:duration={f}:offset={h}[v];"
              f"[0:a]adelay={int(h * 1000)}|{int(h * 1000)}[aud]")
        run(['ffmpeg', '-y', '-v', 'error', '-i', a.video, '-filter_complex', fc, '-map', '[v]', '-map', '[aud]', *ENC, '-c:a', 'aac', '-b:a', '192k', a.out])
    print(f'Done: {a.out} (+{a.hold}s comic panel)')


def reverse(a):
    with tempfile.TemporaryDirectory() as tmp:
        vf = "fps=24,scale=720:1280,reverse,scale=1080:1920:flags=lanczos"
        if a.label:
            vf += ',' + label(tmp, 'l', a.label, 'h*0.12', 'h*0.04')
        run(['ffmpeg', '-y', '-v', 'error', '-i', a.video, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-vf', vf, '-map', '0:v', '-map', '1:a', *ENC,
             '-c:a', 'aac', '-b:a', '128k', '-shortest', a.out])
    print(f'Done: {a.out} (picture reversed, silent audio track; add music separately)')


def reel(a):
    """Capability reel: cut segments 'FILE|START|SECONDS|LABEL' into one silent vertical clip, each with a label in the lower third."""
    with tempfile.TemporaryDirectory() as tmp:
        cmd, parts = ['ffmpeg', '-y', '-v', 'error'], []
        for i, item in enumerate(a.item):
            f, start, dur, text = item.split('|', 3)
            cmd += ['-ss', start, '-t', dur, '-i', f]
            parts.append(f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,format=yuv420p,"
                         f"{label(tmp, f'r{i}', text, 'h*0.905', 'h*0.026')}:box=1:boxcolor=black@0.78:boxborderw=20,setpts=PTS-STARTPTS[s{i}]")
        n = len(a.item)
        fc = ';'.join(parts) + ';' + ''.join(f'[s{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[v]'
        cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', fc, '-map', '[v]', '-map', f'{n}:a', *ENC, '-c:a', 'aac', '-b:a', '128k', '-shortest', a.out]
        run(cmd)
    print(f'Done: {a.out} ({n} segments, silent)')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('split'); s.add_argument('--top', required=True); s.add_argument('--bottom', required=True)
    s.add_argument('--top-label', default='$5'); s.add_argument('--bottom-label', default='$5,000'); s.add_argument('--audio', choices=['top', 'bottom'], default='bottom'); s.add_argument('--out', required=True)
    c = sub.add_parser('comic'); c.add_argument('--video', required=True); c.add_argument('--out', required=True); c.add_argument('--hold', type=float, default=1.0); c.add_argument('--fade', type=float, default=0.6)
    r = sub.add_parser('reverse'); r.add_argument('--video', required=True); r.add_argument('--out', required=True); r.add_argument('--label', default='')
    q = sub.add_parser('reel'); q.add_argument('--item', action='append', required=True, help='FILE|START|SECONDS|LABEL (repeat)'); q.add_argument('--out', required=True)
    a = p.parse_args()
    {'split': split, 'comic': comic, 'reverse': reverse, 'reel': reel}[a.cmd](a)
