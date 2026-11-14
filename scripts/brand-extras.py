"""Brand finishing steps shared by every Billionaire Bites short (Mac pipeline).

  python3 scripts/brand-extras.py flash --scenario S.json --video IN.mp4 --out OUT.mp4
      Gold flash on every cut (cut times come from the shot lengths). Run before add-sfx.py.
  python3 scripts/brand-extras.py seal --scenario S.json --video IN.mp4 --out OUT.mp4 --text '$214 vs a $3 sandwich' [--stamp outputs/_check/stamp.png]
      Opening-frame price text (0 to 2.6 s, fades out) and the 'Genius Approved' seal that slams in at the last shot
      with a low thump. Run after the captioned video exists.
"""
import argparse, textwrap, json, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'assets/fonts/Poppins-Bold.ttf'


def shots(scenario):
    return json.loads(scenario.read_text(encoding='utf-8-sig'))['plan']['shots']


def run(cmd):
    subprocess.run(cmd, check=True)


def flash(a):
    cuts, at = [], 0
    for s in shots(a.scenario)[:-1]:
        at += s['seconds']
        cuts.append(at)
    vf = ','.join(f"drawbox=x=0:y=0:w=iw:h=ih:color=0xFFE9B0@0.8:t=fill:enable='between(t,{c - 0.02},{c + 0.06})'" for c in cuts)
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(a.video), '-vf', vf, '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', str(a.out)])
    print(f'Flash at cuts {cuts} -> {a.out}')


def punch(a):
    """Zoom-punch on every cut (12% push that settles in 0.3 s) with a low hit and a tick on each cut."""
    cuts, at = [], 0
    for s in shots(a.scenario)[:-1]:
        at += s['seconds']
        cuts.append(at)
    z = '+'.join(f"0.12*between(t,{c},{c + 0.3})*(1-(t-{c})/0.3)" for c in cuts)
    vf = f"scale=w='trunc(1080*(1+({z}))/2)*2':h='trunc(1920*(1+({z}))/2)*2':eval=frame,crop=1080:1920"
    n = len(cuts)
    ins, parts = [], []
    for i, c in enumerate(cuts):
        ms = int(c * 1000) - 20
        parts.append(f"[{i + 1}:a]adelay={ms}|{ms}[h{i}]")
    mix = ''.join(f'[h{i}]' for i in range(n))
    graph = ';'.join(parts) + f";{mix}amix=inputs={n}:normalize=0[hits];[0:a][hits]amix=inputs=2:normalize=0:duration=first[a]"
    cmd = ['ffmpeg', '-y', '-v', 'error', '-i', str(a.video)]
    for _ in cuts:
        cmd += ['-f', 'lavfi', '-i', 'sine=f=70:d=0.25,afade=t=out:st=0.03:d=0.22,volume=0.9']
    cmd += ['-filter_complex', f"[0:v]{vf}[v];" + graph, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', str(a.out)]
    run(cmd)
    print(f'Punch at cuts {cuts} -> {a.out}')


def seal(a):
    sh = shots(a.scenario)
    last = sum(s['seconds'] for s in sh[:-1])
    stamp = a.stamp or ROOT / 'outputs/_check/stamp.png'
    if not stamp.exists():
        run(['python3', str(ROOT / 'scripts/make-stamp.py'), '--out', str(stamp)])
    with tempfile.TemporaryDirectory() as tmp:
        txt = Path(tmp) / 'open.txt'
        lines = textwrap.wrap(a.text, 22) or ['']   # wrap long hooks onto several lines so they stay inside the frame
        txt.write_text('\n'.join(lines), encoding='utf-8')
        size = max(44, min(64, int(64 * 19 / max(max(len(l) for l in lines), 1))))  # keep the longest line inside the margins
        graph = (f"[0:v]drawtext=fontfile={FONT}:textfile={txt}:fontsize={size}:fontcolor=0xECC470:borderw=6:bordercolor=0x101010:"
                 f"x=(w-text_w)/2:y=190:enable='between(t,0,2.6)':alpha='if(lt(t,2.2),1,(2.6-t)/0.4)'[t];"
                 f"[1:v]scale=300:-1,format=rgba,fade=t=in:st=0:d=0.12:alpha=1,setpts=PTS+{last}/TB[s];"
                 f"[t][s]overlay=x=W-w-24:y=120:eof_action=pass[v];"
                 f"[2:a]afade=t=out:st=0.04:d=0.26,volume=0.9,adelay={int(last * 1000)}|{int(last * 1000)}[th];"
                 f"[0:a][th]amix=inputs=2:normalize=0:duration=first[a]")
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(a.video), '-loop', '1', '-i', str(stamp), '-f', 'lavfi', '-i', 'sine=f=85:d=0.3',
             '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast',
             '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', str(sum(s['seconds'] for s in sh) + 0.1), str(a.out)])
    print(f'Text + seal at {last}s -> {a.out}')


def cut_times(a):
    cuts, at = [], 0
    for s in shots(a.scenario)[:-1]:
        at += s['seconds']
        cuts.append(at)
    return cuts


def dissolve(a):
    """Real transitions on every cut without changing the length (audio stays in sync): each shot holds its edge frame for half a
    transition, then xfade overlaps the two. Styles rotate so the film does not feel mechanical."""
    cuts, d = cut_times(a), a.duration
    total = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(a.video)], capture_output=True, text=True, check=True).stdout)
    fps = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', str(a.video)], capture_output=True, text=True, check=True).stdout.strip()
    cuts = [c for c in cuts if d < c < total - d]
    styles = ['fade', 'smoothleft', 'fade', 'zoomin', 'fade', 'smoothup']
    edges = [0] + cuts + [total]
    graph = []
    for i in range(len(edges) - 1):   # both sides of a cut come from one file, so each side holds its edge frame for half a transition to give xfade real overlap
        pad = ':'.join(([f'start_mode=clone:start_duration={d / 2}'] if i else []) + ([f'stop_mode=clone:stop_duration={d / 2}'] if i < len(edges) - 2 else []))
        graph.append(f'[0:v]trim={edges[i]:.3f}:{edges[i + 1]:.3f},setpts=PTS-STARTPTS,fps={fps}' + (f',tpad={pad}' if pad else '') + f',format=yuv420p[s{i}]')
    last = '[s0]'
    for i, c in enumerate(cuts):
        graph.append(f'{last}[s{i + 1}]xfade=transition={styles[i % len(styles)]}:duration={d}:offset={c - d / 2:.3f}[x{i}]')
        last = f'[x{i}]'
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(a.video), '-filter_complex', ';'.join(graph), '-map', last, '-map', '0:a', '-c:v', 'libx264', '-crf', '17',
         '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', str(a.out)])
    print(f'Dissolve ({d}s) at cuts {cuts} -> {a.out}')


def grade(a):
    """One film look across every shot: gentle S-curve, warm highlights / cool shadows, soft vignette, fine grain."""
    vf = ("curves=master='0/0 0.25/0.21 0.5/0.5 0.75/0.8 1/1',colorbalance=rs=-0.03:bs=0.04:rh=0.04:bh=-0.05,"
          "eq=saturation=1.08,vignette=PI/5.5,noise=c0s=5:c0f=t+u")
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(a.video), '-vf', vf, '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', str(a.out)])
    print(f'Graded -> {a.out}')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode', choices=['flash', 'punch', 'seal', 'dissolve', 'grade'])
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--text', default='')
    p.add_argument('--stamp', type=Path)
    p.add_argument('--duration', type=float, default=0.3)
    a = p.parse_args()
    {'flash': flash, 'punch': punch, 'seal': seal, 'dissolve': dissolve, 'grade': grade}[a.mode](a)


if __name__ == '__main__':
    main()
