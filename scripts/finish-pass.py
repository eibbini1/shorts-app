#!/usr/bin/env python3
"""Finish pass for a short: no end stamp, opening payoff frame (loop-friendly), optional watermark.

Usage:
  scripts/finish-pass.py --scenario S.json --video outputs/X.sfx.captioned.1080.mp4 --out OUT.mp4 [--payoff 0.25] [--watermark "BILLIONAIRE BITES"]

Takes the exported 1080 file (before the edit pass), runs the existing dissolve + grade steps from
brand-extras.py, then prepends a still of the finished dish for --payoff seconds, with silence under it.
The film starts and ends on the same dish, so it loops cleanly. The old end stamp is not applied.
"""
import argparse, json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-800:]}")
    return r.stdout


def probe(video):
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
               '-of', 'json', str(video)])
    d = json.loads(out)
    s = d['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return s['width'], s['height'], float(num) / float(den), float(d['format']['duration'])


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--payoff', type=float, default=0.25)
    p.add_argument('--payoff-from-end', type=float, default=0.4, help='seconds before the end to grab the payoff frame')
    p.add_argument('--watermark', default='')
    p.add_argument('--font', default='')
    p.add_argument('--steps', default='', help='top ingredient/step boxes, one per shot, separated by | (readable with sound off)')
    p.add_argument('--steps-font', default=str(ROOT / 'assets/fonts/Poppins-Bold.ttf'))
    p.add_argument('--hard-cuts', action='store_true', help='keep straight cuts (skip the dissolve step)')
    p.add_argument('--punch', action='store_true', help='zoom-punch with a low hit on each cut')
    p.add_argument('--hud-file', type=Path, help='JSON list of [label, price] per shot: draws a level label and an animated price counter in the lower third')
    p.add_argument('--silent', action='store_true', help='export with a silent audio track (sound-off A/B variant)')
    a = p.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        fx0, fx1 = tmp / 'fx0.mp4', tmp / 'fx1.mp4'
        be = str(ROOT / 'scripts/brand-extras.py')
        if a.hard_cuts:
            fx0 = a.video
        else:
            run(['python3', be, 'dissolve', '--scenario', str(a.scenario), '--video', str(a.video), '--out', str(fx0)])
        run(['python3', be, 'grade', '--scenario', str(a.scenario), '--video', str(fx0), '--out', str(fx1)])
        if a.punch:
            fx2 = tmp / 'fx2.mp4'
            run(['python3', be, 'punch', '--scenario', str(a.scenario), '--video', str(fx1), '--out', str(fx2)])
            fx1 = fx2
        w, h, fps, dur = probe(fx1)
        frame = tmp / 'payoff.png'
        run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{max(dur - a.payoff_from_end, 0):.3f}', '-i', str(fx1), '-frames:v', '1', str(frame)])
        delay_ms = int(round(a.payoff * 1000))
        wm = ''
        if a.watermark:
            font = f":fontfile={a.font}" if a.font else ''
            text = a.watermark.replace("'", '')
            wm = (f",drawtext=text='{text}'{font}:fontcolor=0xF2D48A@0.55:fontsize=h*0.018:x=(w-text_w)/2:y=h*0.915:"
                  f"shadowcolor=black@0.5:shadowx=1:shadowy=1")
        if a.hud_file and a.hud_file.exists():
            hud = json.loads(a.hud_file.read_text())
            secs = [s['seconds'] for s in json.loads(a.scenario.read_text())['plan']['shots']]
            t0, prev = a.payoff, 0
            for k, ((label, price), sec) in enumerate(zip(hud, secs)):
                lf, pf = tmp / f'hudl{k}.txt', tmp / f'hudp{k}.txt'
                lf.write_text(label)
                pf.write_text('$%{eif:' + f'{prev}+({price}-{prev})*min((t-{t0:.2f})/0.9,1)' + ':d}')
                en = f"enable='between(t,{t0:.2f},{t0 + sec:.2f})'"
                ff = tmp / f'hudf{k}.txt'; ff.write_text('$' + format(int(price), ','))   # settled price with thousands comma
                ticking = f"enable='between(t,{t0:.2f},{t0 + 0.9:.2f})'"; settled = f"enable='between(t,{t0 + 0.9:.2f},{t0 + sec:.2f})'"
                pstyle = f"fontfile={a.steps_font}:fontcolor=0xF2C448:fontsize=h*0.064:x=(w-text_w)/2:y=h*0.775:borderw=7:bordercolor=black@0.9"
                wm += (f",drawtext=textfile={lf}:fontfile={a.steps_font}:fontcolor=white:fontsize=h*0.030:x=(w-text_w)/2:y=h*0.735:borderw=5:bordercolor=black@0.9:{en}"
                       f",drawtext=textfile={pf}:{pstyle}:{ticking},drawtext=textfile={ff}:{pstyle}:{settled}")
                t0 += sec; prev = price
        steps = [x.strip() for x in a.steps.split('|') if x.strip()]
        if steps:
            secs = [s['seconds'] for s in json.loads(a.scenario.read_text())['plan']['shots']]
            t0 = a.payoff
            for k, (txt, sec) in enumerate(zip(steps, secs)):
                tf = tmp / f'step{k}.txt'
                tf.write_text(txt)
                wm += (f",drawtext=textfile={tf}:fontfile={a.steps_font}:fontcolor=0xF2D48A:fontsize=h*0.030:x=(w-text_w)/2:y=h*0.105:"
                       f"box=1:boxcolor=black@0.55:boxborderw=22:enable='between(t,{t0 + 0.25:.2f},{t0 + sec - 0.25:.2f})'")
                t0 += sec
        if a.payoff <= 0:
            vf = 'null' + wm
            run(['ffmpeg', '-y', '-v', 'error', '-i', str(fx1), '-vf', vf, '-af', 'volume=0' if a.silent else 'anull', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(a.out)])
            print(f'Done: {a.out} (no payoff frame, no stamp)')
            return
        fc = (f"[0:v]scale={w}:{h},setsar=1,fps={fps:.3f},format=yuv420p[a];"
              f"[1:v]scale={w}:{h},setsar=1,fps={fps:.3f},format=yuv420p[b];"
              f"[b][a]concat=n=2:v=1:a=0[v0];[v0]null{wm}[v];"
              f"[2:a]adelay={delay_ms}|{delay_ms},asetpts=PTS-STARTPTS{',volume=0' if a.silent else ''}[aud]")
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(fx1), '-loop', '1', '-t', f'{a.payoff:.3f}', '-framerate', f'{fps:.3f}',
             '-i', str(frame), '-i', str(fx1), '-filter_complex', fc, '-map', '[v]', '-map', '[aud]',
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
             '-movflags', '+faststart', str(a.out)])
    print(f"Done: {a.out} (+{a.payoff}s payoff frame, no stamp)")


if __name__ == '__main__':
    main()
