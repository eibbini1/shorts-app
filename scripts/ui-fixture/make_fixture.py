"""Build an isolated Studio fixture root for UI checks (no real media, tokens are test values).
usage: python3 scripts/ui-fixture/make_fixture.py <out-dir>   then: STUDIO_PORT=8799 STUDIO_TOKEN=fixture-owner node <out-dir>/scripts/studio-server.mjs
"""
import hashlib, json, pathlib, shutil, subprocess, sys

repo = pathlib.Path(__file__).resolve().parents[2]
root = pathlib.Path(sys.argv[1]).resolve()
if root.exists():
    shutil.rmtree(root)
for d in ['scripts', 'outputs', 'storage/studio-sessions', 'storage/studio-learning', 'drafts/generated', 'bin', 'studio']:
    (root / d).mkdir(parents=True)
for f in repo.glob('scripts/*.mjs'):
    if '.test' not in f.name and not f.name.startswith('test-'):
        shutil.copy(f, root / 'scripts')
(root / 'scripts/check-env.py').write_text("print('OK  ffmpeg')\nprint('OK  FLUX model')\n")
dist = repo / 'studio' / 'dist'
shutil.copytree(dist, root / 'studio/dist') if dist.exists() else (root / 'studio/dist').mkdir()
(root / 'bin/pgrep').write_text('#!/bin/sh\nexit 1\n'); (root / 'bin/pgrep').chmod(0o755)

def sess(sid, **kw):
    base = dict(id=sid, user='owner', steps=[], lines=[], createdAt=int(sid))
    base.update(kw)
    (root / 'storage/studio-sessions' / f'{sid}.json').write_text(json.dumps(base))

scn = 'drafts/generated/choc.local-scenario.json'
(root / scn).write_text(json.dumps({'settings': {'seconds': 15}, 'plan': {'shots': []}}))
plan = {'title': 'Chocolate shell reveal', 'hook': 'A spoon cracks the glossy shell.', 'shots': [
    {'seconds': 5, 'motionPrompt': 'A spoon taps and cracks a chocolate shell.', 'imagePrompt': 'Macro of a glossy chocolate dome.', 'sound': 'crisp crack'},
    {'seconds': 5, 'motionPrompt': 'Warm pistachio cream flows out over the plate.', 'imagePrompt': 'Pistachio cream pooling.', 'sound': 'soft pour'},
    {'seconds': 5, 'motionPrompt': 'The baker lifts a bite and tastes it.', 'imagePrompt': 'Hand lifting a spoon.', 'sound': 'quiet chew'}]}
opts = {'seconds': 15, 'orientation': 'vertical', 'audio': 'asmr', 'look': 'food'}
sess('1794900000001', name='Chocolate shell reveal', prompt='A baker cracks a chocolate shell to reveal pistachio cream.',
     scenario=scn, plan=plan, status='done', kind='draft', options=opts)
sess('1794900000002', name='Blocked plan', prompt='A chef makes pasta.', scenario=scn, status='failed', kind='draft', options=opts,
     plan={'title': 'Pasta', 'shots': plan['shots'][:2]},
     lines=['@@event_placeholder'][:0] + ['BLOCKED: shot 2 has no filmable physical action', 'Fixed automatically: preserved the requested action'],
     error='Story check blocked the plan.')
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3a2a1a:s=360x640:r=24:d=1',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
                str(root / 'outputs/choc.mp4')], check=True)
sess('1794900000003', name='Finished export', prompt='A baker cracks a chocolate shell.', scenario=scn, plan=plan, status='done',
     kind='render', options=opts, video='outputs/choc.mp4', technicalQa={'status': 'passed'})
ar = {'title': 'كريمة الفستق', 'hook': 'ملعقة تكسر القشرة اللامعة.', 'payoff': 'كريمة الفستق تنساب فوق الطبق.', 'shots': [
    {'seconds': 5, 'motionPrompt': 'ملعقة تكسر قشرة الشوكولاتة.', 'imagePrompt': 'لقطة قريبة لقبة شوكولاتة.', 'sound': 'طقطقة', 'narration': 'اكسر القشرة'},
    {'seconds': 5, 'motionPrompt': 'كريمة الفستق تنساب على الطبق.', 'imagePrompt': 'كريمة الفستق.', 'sound': 'انسياب'}]}
sess('1794900000004', name='Arabic voiced plan', prompt='خباز يكسر قشرة شوكولاتة.', scenario=scn, plan=ar, status='done', kind='draft',
     options={'seconds': 20, 'orientation': 'vertical', 'audio': 'voiced', 'look': 'food'})
(root / 'storage/studio-users.json').write_text(json.dumps({'users': [{'name': 'creator-a', 'token': 'fixture-creator-a', 'role': 'creator', 'dailyRenders': 2}]}))
print('fixture ready:', root)
