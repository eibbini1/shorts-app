import unittest


def run_fixture():
    import atexit, hashlib, http.client, json, os, pathlib, shutil, socket, subprocess, tempfile, time, threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    root=pathlib.Path(tempfile.mkdtemp(prefix='ishorts-ux-check-'))
    for folder in ['scripts','outputs','storage/studio-sessions','drafts/generated','bin']:
        (root/folder).mkdir(parents=True)
    shutil.copy('scripts/studio-server.mjs',root/'scripts')
    shutil.copy('scripts/studio-export-review.mjs',root/'scripts')
    shutil.copy('scripts/studio-ideas.mjs',root/'scripts')
    shutil.copy('scripts/studio-refine-idea.mjs',root/'scripts')
    shutil.copy('scripts/story-action-gate.mjs',root/'scripts')
    shutil.copy('scripts/creative-learning.mjs',root/'scripts')
    (root/'studio/dist').mkdir(parents=True)
    (root/'studio/dist/index.html').write_text('<html>Studio fixture</html>')
    (root/'bin/pgrep').write_text('#!/bin/sh\nexit 1\n')
    (root/'bin/pgrep').chmod(0o755)
    scenario='drafts/generated/fixture.local-scenario.json'
    (root/scenario).write_text('{}')
    session='1794900000000'
    (root/'storage/studio-sessions'/f'{session}.json').write_text(json.dumps(dict(id=session, user='creator-a', name='fixture', scenario=scenario, status='done', kind='stills', lines=[], steps=[])))
    legacy='1794900000003'
    (root/'storage/studio-sessions'/f'{legacy}.json').write_text(json.dumps(dict(id=legacy, user='fixture-owner', name='older plan', scenario=scenario, status='done', kind='draft',
        prompt='A chef pours honey, then plates a pear tart.', lines=['BLOCKED: first shot misses the hook', 'Fixed automatically: preserved the requested action'],
        plan={'title':'Pear tart','shots':[{'seconds':5,'narration':'Pour honey.','imagePrompt':'A pear tart.','motionPrompt':'A chef pours honey.','sound':'pour'}]}, steps=[])))
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
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=64x64:r=24:d=1',
        '-f','lavfi','-i','sine=frequency=440:duration=1','-map','0:v:0','-map','1:a:0','-c:v','libx264',
        '-pix_fmt','yuv420p','-c:a','aac','-shortest','outputs/review-a.mp4'],cwd=root,check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i','outputs/review-a.mp4','-f','lavfi',
        '-i','sine=frequency=880:duration=1','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac',
        '-shortest','outputs/review-b.mp4'],cwd=root,check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=64x64:r=24:d=1',
        '-f','lavfi','-i','sine=frequency=880:duration=1','-map','0:v:0','-map','1:a:0','-c:v','libx264',
        '-pix_fmt','yuv420p','-c:a','aac','-shortest','outputs/review-c.mp4'],cwd=root,check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i','outputs/review-a.mp4','-frames:v','1',
        'outputs/review-a.contact.png'],cwd=root,check=True)
    review_scenario='drafts/generated/review.local-scenario.json'
    review_story={'settings':{'seconds':1},'plan':{'shots':[{'seconds':1,'motionPrompt':'A chef places one fresh basil leaf.'}]}}
    story_file=root/review_scenario
    story_file.write_text(json.dumps(review_story))
    video_file=root/'outputs/review-a.mp4'; contact_file=root/'outputs/review-a.contact.png'
    review_report={'videoSha256':hashlib.sha256(video_file.read_bytes()).hexdigest(),
        'scenarioSha256':hashlib.sha256(story_file.read_bytes()).hexdigest(),
        'contactSheetSha256':hashlib.sha256(contact_file.read_bytes()).hexdigest(),
        'sampleTimeline':[{'shot':1,'startSeconds':0.12,'middleSeconds':0.5,'endSeconds':0.88,
            'plannedAction':review_story['plan']['shots'][0]['motionPrompt']}], 'shotMotion':[4], 'flags':{},
        'visionChecked':False,'notMachineChecked':[]}
    (root/'outputs/review-a.prereview.json').write_text(json.dumps(review_report))
    review_session='1794900000002'
    (root/'storage/studio-sessions'/f'{review_session}.json').write_text(json.dumps(dict(id=review_session,
        user='creator-a',name='checkpoint fixture',scenario=review_scenario,video='outputs/review-a.mp4',
        status='done',kind='render',lines=[],steps=[])))
    class OllamaFixture(BaseHTTPRequestHandler):
        def do_POST(self):
            size=int(self.headers.get('Content-Length','0'))
            request=json.loads(self.rfile.read(size))
            source=json.loads(request['messages'][1]['content'])['originalSentence']
            if source == 'tomatoes':
                result={'decision':'needs_choices','message':'Choose the cooking direction.',
                    'refinedPrompt':'','hook':'','mustShow':'','obstacle':'','turn':'','ending':'',
                    'question':'Which tomato dish should the chef finish?', 'choices':[
                        {'label':'Sauce','prompt':'A chef chops tomatoes, simmers them, then coats pasta.',
                         'hook':'A tomato splits under the knife.','mustShow':'Tomatoes simmer and coat the pasta.',
                         'obstacle':'The sauce is watery.','turn':'The chef simmers it until thick.',
                         'ending':'Glossy sauce coats the pasta.'},
                        {'label':'Salsa','prompt':'A chef dices tomatoes and herbs, then spoons salsa into a bowl.',
                         'hook':'A tomato cube drops into a bowl.','mustShow':'The chef dices and mixes tomatoes.',
                         'obstacle':'The salsa releases liquid.','turn':'The chef drains it before seasoning.',
                         'ending':'Fresh salsa fills the serving bowl.'}]}
            else:
                result={'decision':'ready','message':'The idea is clear; the director brief is ready.',
                    'refinedPrompt':'A chef chops tomatoes, simmers them into thick sauce, then coats fresh pasta.',
                    'hook':'A ripe tomato splits under the knife in a tight opening shot.',
                    'mustShow':'The chef chops tomatoes and stirs them into a simmering pan.',
                    'obstacle':'The sauce is watery and slides off the pasta.',
                    'turn':'The chef simmers until it thickens and clings to the spoon.',
                    'ending':'Glossy tomato sauce coats the pasta.','question':'','choices':[]}
            payload=json.dumps({'message':{'content':json.dumps(result)}}).encode()
            self.send_response(200); self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
        def log_message(self,*args): pass
    ollama=ThreadingHTTPServer(('127.0.0.1',0),OllamaFixture)
    threading.Thread(target=ollama.serve_forever,daemon=True).start()
    with socket.socket() as s:
        s.bind(('127.0.0.1',0))
        port=s.getsockname()[1]
    proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner',
        'SHORTS_OLLAMA_CHAT_URL':f'http://127.0.0.1:{ollama.server_port}/api/chat','PATH':str(root/'bin')+':'+os.environ['PATH']})
    def cleanup():
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=5)
        ollama.shutdown(); ollama.server_close()
    atexit.register(cleanup)
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
    def finish(target_session=None):
        target_session = target_session or session
        for _ in range(100):
            status,data=req('/api/sessions/'+target_session,'creator-a')
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
        assert req('/api/comparison-feedback','creator-a',{'baseline':'outputs/review-a.mp4','candidate':'outputs/review-b.mp4'})[0]==403
        code, saved = req('/api/comparison-feedback','fixture-owner',{'baseline':'outputs/review-a.mp4','candidate':'outputs/review-b.mp4','notes':'Both acceptable.'})
        assert code==200 and saved['outcome']=='both-acceptable-no-preference',saved
        assert (root/'storage/learning/creative.sqlite').is_file()
        code, mismatch = req('/api/comparison-feedback','fixture-owner',{'baseline':'outputs/review-a.mp4','candidate':'outputs/review-c.mp4'})
        assert code==422 and 'identical decoded picture streams' in mismatch['error'],mismatch
        assert req('/api/comparison-feedback','fixture-owner',{'baseline':'outputs/review-a.mp4','candidate':'outputs/review-a.mp4'})[0]==400
        assert req('/api/comparison-feedback','fixture-owner',{'baseline':'outputs/../outside.mp4','candidate':'outputs/review-b.mp4'})[0]==422
        assert req('/api/checkpoint-review?sessionId='+review_session,'creator-b')[0]==404
        code, pending_review=req('/api/checkpoint-review?sessionId='+review_session,'fixture-owner')
        assert code==200 and pending_review['available'] and pending_review['review'] is None,pending_review
        assert req('/api/checkpoint-review','creator-a',{'sessionId':review_session,'video':'outputs/review-a.mp4',
            'confirmed':True,'shotFindings':[],'payoff':'achieved'})[0]==400
        report_file=root/'outputs/review-a.prereview.json'
        original_report=report_file.read_text()
        stale_report=json.loads(original_report); stale_report['scenarioSha256']='stale'
        report_file.write_text(json.dumps(stale_report))
        code, stale_review=req('/api/checkpoint-review','creator-a',{'sessionId':review_session,'video':'outputs/review-a.mp4',
            'confirmed':True,'shotFindings':[{'shot':1,'outcome':'matches'}],'payoff':'achieved'})
        assert code==409 and 'stale' in stale_review['error'],stale_review
        report_file.write_text(original_report)
        code, saved_review=req('/api/checkpoint-review','creator-a',{'sessionId':review_session,'video':'outputs/review-a.mp4',
            'confirmed':True,'shotFindings':[{'shot':1,'outcome':'partial'}],'payoff':'not-visible','notes':'Fixture end action not visible.'})
        assert code==200 and saved_review['review']['shotFindings'][0]['plannedAction']=='A chef places one fresh basil leaf.',saved_review
        code, loaded_review=req('/api/checkpoint-review?sessionId='+review_session,'creator-a')
        assert code==200 and loaded_review['review']['payoff']=='not-visible',loaded_review
        assert req('/api/learning','creator-a')[1]['checkpointReviews']==1
        assert req('/api/learning','creator-b')[1]['checkpointReviews']==0
        assert req('/api/idea','creator-a',{'look':'invalid'})[0]==400
        (root/'scripts/studio-draft.py').write_text("import json\nfrom pathlib import Path\np=Path('drafts/generated/fresh.local-scenario.json')\np.write_text(json.dumps({'plan':{'title':'The Copper Kite','shots':[{'seconds':5},{'seconds':5}]}}))\nprint(p, flush=True)\n")
        before_ambiguous=req('/api/state','creator-a')[1]
        status, choices=req('/api/draft','creator-a',{'prompt':'tomatoes','seconds':20,'look':'food','refine':True})
        assert status==200 and choices['decision']=='needs_choices' and len(choices['refinement']['choices'])==2,choices
        after_ambiguous=req('/api/state','creator-a')[1]
        assert after_ambiguous.get('id')==before_ambiguous.get('id') and after_ambiguous.get('status')==before_ambiguous.get('status')  # ambiguous idea starts no job
        chosen=choices['refinement']['choices'][0]
        status, approved=req('/api/draft','creator-a',{'prompt':chosen['prompt'],'originalPrompt':'tomatoes','seconds':20,'look':'food',
            'hook':chosen['hook'],'mustShow':chosen['mustShow'],'obstacle':chosen['obstacle'],'turn':chosen['turn'],'ending':chosen['ending']})
        assert status==202 and approved['options']['originalPrompt']=='tomatoes',approved
        choice_answers=json.loads(next((root/'storage').glob('studio-answers-*.json')).read_text())
        assert choice_answers['topic']=='tomatoes' and choice_answers['hook']==chosen['hook']
        assert choice_answers['mustShow']==chosen['mustShow'] and choice_answers['ending']==chosen['ending']
        finish(approved['id'])
        for answer in (root/'storage').glob('studio-answers-*.json'): answer.unlink()
        status, draft=req('/api/draft','creator-a',{'prompt':'A chef chopping tomatoes for pasta','seconds':20,'look':'cartoon','refine':True})
        assert status==202 and draft['options']['seconds']==20, draft
        answer_files=list((root/'storage').glob('studio-answers-*.json'))
        assert len(answer_files)==1
        answers=json.loads(answer_files[0].read_text())
        assert answers['topic']=='A chef chopping tomatoes for pasta'
        assert answers['hook']=='A chef chopping tomatoes for pasta'
        assert answers['mustShow']=='A chef chopping tomatoes for pasta'
        assert answers['obstacle']=='The sauce is watery and slides off the pasta.'
        assert answers['turn']=='The chef simmers until it thickens and clings to the spoon.'
        assert answers['ending']=='Glossy tomato sauce coats the pasta.'
        assert draft['options']['originalPrompt']=='A chef chopping tomatoes for pasta'
        assert draft['options']['storyPrompt']=='A chef chops tomatoes, simmers them into thick sauce, then coats fresh pasta.'
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
        learning_data=req('/api/learning','fixture-owner')[1]
        assert learning_data['gateEvents']>0 and learning_data['scenePlans']>=2,learning_data
        assert any(event['outcome']=='blocked' for event in learning_data['recentGateEvents']),learning_data
        backfilled=[json.loads(line) for line in (root/'storage/studio-learning/runs.jsonl').read_text().splitlines() if json.loads(line).get('session')==legacy]
        assert len([row for row in backfilled if row['type']=='gate-event'])==2
        assert len([row for row in backfilled if row['type']=='scene-plan'])==1
        proc.terminate(); proc.wait(timeout=5); ollama.shutdown(); ollama.server_close()
        prior_count=len(backfilled)
        proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner','STUDIO_DRAFT_TIMEOUT_MS':'300','PATH':str(root/'bin')+':'+os.environ['PATH']})
        for _ in range(100):
            try:
                if req('/api/me','fixture-owner')[0]==200: break
            except ConnectionRefusedError: time.sleep(.03)
        after_restart=[json.loads(line) for line in (root/'storage/studio-learning/runs.jsonl').read_text().splitlines() if json.loads(line).get('session')==legacy]
        assert len(after_restart)==prior_count, 'persisted learning evidence is backfilled only once'
        (root/'scripts/studio-draft.py').write_text('import time; time.sleep(30)')
        status,state=req('/api/draft','fixture-owner',{'prompt':'Timeout recovery test','unattended':True})
        assert status==202
        for _ in range(150):
            state=req('/api/state','fixture-owner')[1]
            if state['status']=='failed':break
            time.sleep(.05)
        assert state['status']=='failed' and 'timed out' in state['error'],state
        print('PASS: manifest integrity, scenario-bound checkpoint review and access controls, planning watchdog; unattended sequencing without browser, blocked plan stops, range 416, cancelled process holds lock, and stale feedback denied.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


class StudioWorkflowTests(unittest.TestCase):
    def test_manual_unattended_and_recovery(self):
        run_fixture()


if __name__ == '__main__':
    unittest.main()
