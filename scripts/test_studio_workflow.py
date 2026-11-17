import unittest


def run_fixture():
    import http.client, json, os, pathlib, shutil, socket, subprocess, tempfile, time
    root=pathlib.Path(tempfile.mkdtemp(prefix='ishorts-ux-check-'))
    for folder in ['scripts','outputs','storage/studio-sessions','drafts/generated','bin']:
        (root/folder).mkdir(parents=True)
    shutil.copy('scripts/studio-server.mjs',root/'scripts')
    shutil.copy('scripts/studio-export-review.mjs',root/'scripts')
    shutil.copy('scripts/studio-ideas.mjs',root/'scripts')
    (root/'studio/dist').mkdir(parents=True)
    (root/'studio/dist/index.html').write_text('<html>Studio fixture</html>')
    (root/'bin/pgrep').write_text('#!/bin/sh\nexit 1\n')
    (root/'bin/pgrep').chmod(0o755)
    scenario='drafts/generated/fixture.local-scenario.json'
    (root/scenario).write_text('{}')
    session='1794900000000'
    (root/'storage/studio-sessions'/f'{session}.json').write_text(json.dumps(dict(id=session, user='creator-a', name='fixture', scenario=scenario, status='done', kind='stills', lines=[], steps=[])))
    (root/'storage/studio-users.json').write_text(json.dumps({'users':[{'name':n,'token':n,'role':'creator','dailyRenders':2} for n in ('creator-a','creator-b')]}))
    (root/'scripts/make-local-video.sh').write_text('''sleep 0.4
    if [ -f fail ]; then
      touch outputs/fixture-invalid.mp4
      echo "Technical QA failed: fixture"
      exit 5
    fi
    touch outputs/fixture-good.mp4 outputs/fixture-later.mp4
    echo "Studio verified export: outputs/fixture-good.mp4"
    ''')
    with socket.socket() as s:
        s.bind(('127.0.0.1',0))
        port=s.getsockname()[1]
    proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner','PATH':str(root/'bin')+':'+os.environ['PATH']})
    def req(p,token=None,body=None):
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=15)
        headers={'Cookie':f'studio_token={token}'} if token else {}
        if body: headers['Content-Type']='application/json'
        c.request('POST' if body else 'GET',p,json.dumps(body) if body else None,headers)
        r=c.getresponse()
        data=r.read().decode()
        c.close()
        try: data=json.loads(data)
        except ValueError: pass
        return r.status,data
    def finish():
        for _ in range(100):
            status,data=req('/api/sessions/'+session,'creator-a')
            if data['status'] not in ('running','stopping'): return data
            time.sleep(.05)
        raise AssertionError('job timeout')
    try:
        for _ in range(100):
            try: assert req('/')[0]==401; break
            except ConnectionRefusedError: time.sleep(.02)
        assert req('/','%ZZ')[0]==401
        assert req('/','fixture-owner')[0]==200
        assert req('/api/me','creator-a')[1]['maxSeconds']==20
        assert req('/api/idea','creator-a',{'look':'invalid'})[0]==400
        (root/'scripts/studio-draft.py').write_text("import json\nfrom pathlib import Path\np=Path('drafts/generated/fresh.local-scenario.json')\np.write_text(json.dumps({'plan':{'title':'The Copper Kite','shots':[{'seconds':5},{'seconds':5}]}}))\nprint(p, flush=True)\n")
        status, draft=req('/api/draft','creator-a',{'prompt':'A copper kite lifts a paper star out of a puddle, then lands on a blue bicycle.', 'seconds':30,'look':'cartoon'})
        assert status==202 and draft['options']['seconds']==20, draft
        session=draft['id']
        drafted=finish()
        assert drafted['plan']['plan']['title']=='The Copper Kite',drafted
        scenario=drafted['scenario']
        work=root/'storage/any-local/fresh.local-scenario/refs'
        work.mkdir(parents=True)
        (root/'scripts/pin-fixture.py').write_text("import hashlib,json,sys\nfrom pathlib import Path\nscenario=Path(sys.argv[1])\nwork=Path('storage/any-local')/scenario.stem\nframes=[]\nfor i in range(2):\n    file=work/'refs'/f'shot-{i:02d}-aa.png'\n    file.write_bytes(bytes([i]))\n    frames.append(dict(shot=i+1,file=str(file.relative_to(work)),sha256=hashlib.sha256(file.read_bytes()).hexdigest()))\n(work/'first-frames.json').write_text(json.dumps(dict(schemaVersion=1,scenarioSha256=hashlib.sha256(scenario.read_bytes()).hexdigest(),frames=frames)))\n")
        (root/'scripts/make-local-video.sh').write_text("""set -e
if [ "$3" = '--stills-only' ]; then
      python3 scripts/pin-fixture.py "$2"
      exit 0
    fi
    cp cached.mp4 outputs/fresh-approved.mp4
    echo 'Studio verified export: outputs/fresh-approved.mp4'
    """)
        (root/'cached.mp4').write_bytes(bytes(256))
        payload={'scenario':scenario,'sessionId':session}
        assert req('/api/stills','creator-a',payload)[0]==202
        assert finish()['kind']=='stills'
        assert len(req('/api/live-files?scenario='+scenario,'creator-a')[1]['stills'])==2
        assert req('/api/regen','creator-a',{**payload,'shot':2})[0]==202
        assert finish()['status']=='done'
        assert json.loads((work/'seed-bumps.json').read_text())=={'1':1}
        assert req('/api/sessions/'+session,'creator-b')[0]==404
        manifest=work.parent/'first-frames.json'
        original=manifest.read_text()
        broken=json.loads(original)
        broken['frames'][0]['sha256']='bad'
        manifest.write_text(json.dumps(broken))
        assert req('/api/render','creator-a',payload)[0]==409
        manifest.write_text(original)
        assert req('/api/render','creator-a',payload)[0]==202
        final=finish()
        assert final['technicalQa']['status']=='passed'
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=15)
        c.request('GET','/media?p='+final['video'],headers={'Cookie':'studio_token=creator-a','Range':'bytes=0-63'})
        video=c.getresponse()
        assert video.status==206 and len(video.read())==64
        c.close()
        assert req('/api/feedback','creator-a',{'id':session,'rating':'up','note':'Synthetic endpoint test only'})[0]==200
        proc.terminate()
        proc.wait(timeout=5)
        proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner','PATH':str(root/'bin')+':'+os.environ['PATH']})
        for _ in range(100):
            try:
                assert req('/api/sessions/'+session,'creator-a')[1]['video']==final['video']
                break
            except ConnectionRefusedError: time.sleep(.03)
        (root/'scripts/make-local-video.sh').write_text("trap '' TERM\necho armed > armed\nsleep 1\n")
        assert req('/api/render','creator-a',payload)[0]==202
        for _ in range(100):
            if (root/'armed').exists():break
            time.sleep(.02)
        assert (root/'armed').exists()
        for look in ['food', 'cartoon', 'night', 'custom']:
            code, idea = req('/api/idea','creator-a',{'look':look})
            assert code==200 and idea['source']=='sample' and idea['look']==look and idea['trend'] is None
        history = [json.loads(line) for line in (root/'storage/studio-learning/runs.jsonl').read_text().splitlines()]
        prior_food = next(item['prompt'] for item in history if item.get('type')=='idea' and item['look']=='food')
        code, fresh_food = req('/api/idea','creator-a',{'look':'food'})
        assert code==200 and fresh_food['prompt']!=prior_food

        assert req('/api/cancel','creator-b',{'test':True})[1]['busyElsewhere']
        assert req('/api/cancel','creator-a',{'test':True})[1]['status']=='stopping'
        immediate=req('/api/render','fixture-owner',payload)[0]
        print(f'Fixture prompt → plan → stills → regen → render manifest → Range playback → feedback → restart passed. Immediate resubmit after TERM to a live, TERM-ignoring worker: HTTP {immediate}.')
        assert immediate==409
        assert finish()['status']=='cancelled'
        assert req('/api/draft','creator-a',{'prompt':'Creator cannot start hands-free','unattended':True})[0]==403
        (root/'scripts/make-local-video.sh').write_text("""set -e
if [ "$3" = '--stills-only' ]; then
      python3 scripts/pin-fixture.py "$2"
      echo 'fixture stills completed' >> phases.log
      exit 0
    fi
    echo 'fixture render completed' >> phases.log
    cp cached.mp4 outputs/fresh-auto.mp4
    printf 'Studio verified export: outputs/fresh-auto.mp4'
    """)
        assert req('/api/draft','fixture-owner',{'prompt':'A paper lantern circles a brass compass, then lands beside it.', 'unattended':True})[0]==202
        for _ in range(150):
            state=req('/api/state','fixture-owner')[1]
            if state.get('status')=='done' and state.get('kind')=='render':break
            time.sleep(.05)
        assert state['video']=='outputs/fresh-auto.mp4',state
        assert (root/'phases.log').read_text().splitlines()==['fixture stills completed','fixture render completed']
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=10)
        c.request('GET','/media?p='+state['video'],headers={'Cookie':'studio_token=fixture-owner','Range':'bytes=99-0'})
        response=c.getresponse()
        assert response.status==416 and response.read()==b''
        c.close()
        assert req('/api/state','fixture-owner')[0]==200
        assert req('/api/feedback','fixture-owner',{'id':state['id'],'video':'outputs/stale.mp4','rating':'up'})[0]==409
        (root/'phases.log').write_text('')
        with (root/'scripts/studio-draft.py').open('a') as output:
            output.write("print('BLOCKED: fixture gate')\n")
        assert req('/api/draft','fixture-owner',{'prompt':'Blocked unattended test','unattended':True})[0]==202
        for _ in range(150):
            state=req('/api/state','fixture-owner')[1]
            if state.get('status')=='done':break
            time.sleep(.05)
        assert state['kind']=='draft' and not (root/'phases.log').read_text(),state
        proc.terminate(); proc.wait(timeout=5)
        proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner','STUDIO_DRAFT_TIMEOUT_MS':'300','PATH':str(root/'bin')+':'+os.environ['PATH']})
        for _ in range(100):
            try:
                if req('/api/me','fixture-owner')[0]==200: break
            except ConnectionRefusedError: time.sleep(.03)
        (root/'scripts/studio-draft.py').write_text('import time; time.sleep(30)')
        status,state=req('/api/draft','fixture-owner',{'prompt':'Timeout recovery test','unattended':True})
        assert status==202
        for _ in range(150):
            state=req('/api/state','fixture-owner')[1]
            if state['status']=='failed':break
            time.sleep(.05)
        assert state['status']=='failed' and 'timed out' in state['error'],state
        print('PASS: manifest integrity, planning watchdog; unattended sequencing without browser, blocked plan stops, range 416, cancelled process holds lock, and stale feedback denied.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


class StudioWorkflowTests(unittest.TestCase):
    def test_manual_unattended_and_recovery(self):
        run_fixture()


if __name__ == '__main__':
    unittest.main()
