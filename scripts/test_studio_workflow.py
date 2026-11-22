import unittest


def run_fixture():
    import atexit, base64, hashlib, http.client, json, os, pathlib, shutil, socket, struct, subprocess, tempfile, time, threading, zlib
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    root=pathlib.Path(tempfile.mkdtemp(prefix='ishorts-ux-check-'))
    for folder in ['scripts','outputs','storage/studio-sessions','storage/studio-learning','drafts/generated','bin']:
        (root/folder).mkdir(parents=True)
    shutil.copy('scripts/studio-server.mjs',root/'scripts')
    shutil.copy('scripts/studio-session-utils.mjs',root/'scripts')
    shutil.copy('scripts/studio-export-review.mjs',root/'scripts')
    shutil.copy('scripts/studio-ideas.mjs',root/'scripts')
    shutil.copy('scripts/studio-refine-idea.mjs',root/'scripts')
    shutil.copy('scripts/studio-learning-signals.mjs',root/'scripts')
    shutil.copy('scripts/studio-learning-memory.mjs',root/'scripts')
    shutil.copy('scripts/story-action-gate.mjs',root/'scripts')
    shutil.copy('scripts/creative-learning.mjs',root/'scripts')
    shutil.copy('scripts/pipeline-events.mjs',root/'scripts')
    (root/'scripts/check-env.py').write_text("import sys\nprint('OK  ffmpeg')\nprint('FAIL FLUX model  -> run the setup script')\nsys.exit(1)\n")
    (root/'studio/dist').mkdir(parents=True)
    (root/'studio/dist/index.html').write_text('<html>Studio fixture</html>')
    (root/'bin/pgrep').write_text('#!/bin/sh\nexit 1\n')
    (root/'bin/pgrep').chmod(0o755)
    scenario='drafts/generated/fixture.local-scenario.json'
    (root/scenario).write_text('{}')
    session='1794900000000'
    (root/'storage/studio-sessions'/f'{session}.json').write_text(json.dumps(dict(id=session, user='creator-a', name='fixture', scenario=scenario, status='done', kind='stills', lines=[], steps=[])))
    unattended_session='1794900000009'
    (root/'storage/studio-sessions'/f'{unattended_session}.json').write_text(json.dumps(dict(
        id=unattended_session, user='creator-a', name='unattended fixture',
        scenario='drafts/generated/fresh.local-scenario.json', status='done',
        kind='stills', options={'unattended':True}, unattendedRun=True, lines=[], steps=[])))
    failed_stills='1794900000008'
    (root/'storage/studio-sessions'/f'{failed_stills}.json').write_text(json.dumps(dict(
        id=failed_stills, user='creator-a', name='failed first frames', scenario=scenario, status='failed',
        kind='stills', options={'chain':True}, lines=['Vision review unavailable'], steps=['Generating stills'])))
    legacy='1794900000003'
    (root/'storage/studio-sessions'/f'{legacy}.json').write_text(json.dumps(dict(id=legacy, user='fixture-owner', name='older plan', scenario=scenario, status='done', kind='draft',
        prompt='A chef pours honey, then plates a pear tart.', lines=['BLOCKED: first shot misses the hook', 'Fixed automatically: preserved the requested action'],
        plan={'title':'Pear tart','shots':[{'seconds':5,'narration':'Pour honey.','imagePrompt':'A pear tart.','motionPrompt':'A chef pours honey.','sound':'pour'}]}, steps=[])))
    legacy_retry='1794900000007'
    legacy_prompt='A chef sears halloumi, then dips a crisp golden bite into herbed yogurt.'
    (root/'storage/studio-sessions'/f'{legacy_retry}.json').write_text(json.dumps(dict(id=legacy_retry, user='creator-a', name='legacy Halloumi retry',
        prompt=legacy_prompt, createdAt=int(legacy_retry), options={'originalPrompt':legacy_prompt,'look':'food','seconds':60,'orientation':'vertical'},
        scenario=scenario,plan={'title':'Previous Halloumi plan','shots':[{'seconds':5}]},video='outputs/review-a.mp4',
        technicalQa={'status':'passed'},status='failed',kind='draft',lines=['BLOCKED: previous local model failure'],steps=[],attempts=[])))
    (root/'storage'/f'studio-answers-{int(legacy_retry)+2}.json').write_text(json.dumps({
        'topic':legacy_prompt,'style':'luxury cinematic food film','set':'dark luxury kitchen',
        'hook':'A golden halloumi bite catches the light','mustShow':legacy_prompt,
        'obstacle':'The halloumi risks sticking in the pan.','turn':'The chef lowers the heat and bastes it with garlic butter.',
        'ending':'A crisp bite dips into cool herbed yogurt.','audio':'voiced','seconds':60,'orientation':'vertical'}))
    (root/'storage/studio-users.json').write_text(json.dumps({'users':[{'name':n,'token':n,'role':'creator','dailyRenders':2} for n in ('creator-a','creator-b')]}))
    seeded_learning=[
        {'type':'run','session':'seed-a','user':'creator-a','look':'food'},
        {'type':'feedback','session':'seed-a','user':'creator-a','look':'food','rating':'down','note':'Keep the same tomato shape between shots.','videoSha256':'fixture-video-hash'},
        {'type':'run','session':'seed-b','user':'creator-a','look':'food'},
        {'type':'gate-event','session':'seed-b','user':'creator-a','look':'food','gate':'visible-action','outcome':'blocked','blocker':'beat 2 has no filmable physical action','message':'fixture action failure'},
        {'type':'run','session':'seed-c','user':'creator-a','look':'food'},
        {'type':'gate-event','session':'seed-c','user':'creator-a','look':'food','gate':'visible-action','outcome':'blocked','blocker':'beat 2 has no filmable physical action','message':'fixture action failure'},
    ]
    (root/'storage/studio-learning/runs.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in seeded_learning))
    (root/'scripts/make-local-video.sh').write_text('''echo "Fixture args: $*"
    sleep 0.4
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
    (root/'outputs/review-a.srt').write_text('1\n00:00:00,000 --> 00:00:01,000\nFixture captions\n')
    (root/'outputs/review-a.pack.json').write_text('{"title":"Fixture"}')
    (root/'outputs/review-a.pack.quality.json').write_text(json.dumps({
        'status':'review-needed','score':70,'possible':100,
        'reviewedVideoSha256':hashlib.sha256((root/'outputs/review-a.mp4').read_bytes()).hexdigest()}))
    (root/'outputs/review-a.provenance.json').write_text('{"fixture":true}')
    (root/'outputs/review-bundle.sfx.captioned.mp4').write_bytes(b'fixture video')
    (root/'outputs/review-bundle.sfx.srt').write_text('fixture captions')
    (root/'outputs/review-bundle.sfx.pack.json').write_text('{"title":"Bundle fixture"}')
    (root/'outputs/review-bundle.sfx.pack.quality.json').write_text('{"status":"review-needed"}')
    (root/'outputs/review-bundle.sfx.captioned.provenance.json').write_text('{"fixture":true}')
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
    bundle_session='1794900000010'
    (root/'storage/studio-sessions'/f'{bundle_session}.json').write_text(json.dumps(dict(id=bundle_session,
        user='creator-a',name='publishing bundle fixture',scenario=review_scenario,video='outputs/review-bundle.sfx.captioned.mp4',
        status='done',kind='render',lines=[],steps=[])))
    repair_session='1794900000004'
    repair_prompt='A chef makes tomato pasta'
    repair_brief={'topic':repair_prompt,'style':'luxury cinematic food film','set':'dark luxury kitchen',
        'hook':'A spoon circles the simmering sauce.','mustShow':repair_prompt,
        'obstacle':'The sauce is too thin.','turn':'The chef simmers it until thick.',
        'ending':'Glossy tomato sauce coats the pasta.','audio':'asmr','seconds':20,'orientation':'vertical'}
    (root/'storage/studio-sessions'/f'{repair_session}.json').write_text(json.dumps(dict(id=repair_session,
        user='creator-a',name='rendered tomato pasta',prompt=repair_prompt,createdAt=int(repair_session),
        options={'originalPrompt':repair_prompt,'storyPrompt':repair_prompt,'look':'food','seconds':20,
            'orientation':'vertical','audio':'asmr','ending':repair_brief['ending'],'brief':repair_brief},
        scenario=review_scenario,plan=review_story,video='outputs/review-a.mp4',
        technicalQa={'status':'passed'},status='done',kind='render',lines=[],steps=[],attempts=[])))
    refiner_payloads=[]
    class OllamaFixture(BaseHTTPRequestHandler):
        def do_POST(self):
            size=int(self.headers.get('Content-Length','0'))
            request=json.loads(self.rfile.read(size))
            user_payload=json.loads(request['messages'][1]['content'])
            refiner_payloads.append(user_payload)
            source=user_payload['originalSentence']
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
                    'refinedPrompt':'In a cozy kitchen, a chef chops ripe tomatoes, simmers them into a thick glossy sauce, then coats fresh pasta and finishes with a close view of sauce clinging to each strand.',
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
    tailnet_origin='https://esams-macbook-pro.tail870b21.ts.net'
    proc=subprocess.Popen(['node','scripts/studio-server.mjs'],cwd=root,env={**os.environ,'STUDIO_PORT':str(port),'STUDIO_TOKEN':'fixture-owner',
        'STUDIO_ALLOWED_ORIGINS':tailnet_origin,
        'SHORTS_OLLAMA_CHAT_URL':f'http://127.0.0.1:{ollama.server_port}/api/chat','PATH':str(root/'bin')+':'+os.environ['PATH']})
    def cleanup():
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=5)
        ollama.shutdown(); ollama.server_close()
    atexit.register(cleanup)
    def req(p,token=None,body=None,origin=None):
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=15)
        headers={'Cookie':f'studio_token={token}'} if token else {}
        if origin: headers['Origin']=origin
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
        assert req('/api/me','fixture-owner',origin=tailnet_origin)[0]==200
        assert req('/api/me',origin=tailnet_origin)[0]==401
        assert req('/api/me','fixture-owner',origin='https://untrusted.example')[0]==403
        assert req('/api/me','creator-a')[1]['maxSeconds']==20
        assert req('/api/readiness')[0]==401
        readiness_status, readiness=req('/api/readiness','creator-a')
        assert readiness_status==200 and readiness['ready'] is False
        assert [item['status'] for item in readiness['checks']]==['ok','fail']
        assert readiness['checks'][1]['fix']=='run the setup script',readiness
        assert req('/api/artifacts?sessionId='+review_session,'creator-b')[0]==404
        artifact_status, artifact_list=req('/api/artifacts?sessionId='+review_session,'creator-a')
        assert artifact_status==200 and {item['kind'] for item in artifact_list['artifacts']}=={'captions','publish-pack','quality-report','provenance'},artifact_list
        quality_file=next(item['path'] for item in artifact_list['artifacts'] if item['kind']=='quality-report')
        quality_status, quality=req('/media?p='+quality_file,'creator-a')
        assert quality_status==200 and quality['reviewedVideoSha256']==hashlib.sha256((root/'outputs/review-a.mp4').read_bytes()).hexdigest(),quality
        caption_file=next(item['path'] for item in artifact_list['artifacts'] if item['kind']=='captions')
        assert req('/media?p='+caption_file,'creator-a')==(200,'1\n00:00:00,000 --> 00:00:01,000\nFixture captions\n')
        bundle_status,bundle=req('/api/artifacts?sessionId='+bundle_session,'creator-a')
        assert bundle_status==200 and {item['path'] for item in bundle['artifacts']}=={
            'outputs/review-bundle.sfx.srt','outputs/review-bundle.sfx.pack.json',
            'outputs/review-bundle.sfx.pack.quality.json',
            'outputs/review-bundle.sfx.captioned.provenance.json'},bundle
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
        repair_payload={'prompt':'A chef makes tomato pasta, then plates glossy sauce on the pasta.',
            'originalPrompt':repair_prompt,'retrySessionId':repair_session,'repair':True,
            'repairGuidance':'Keep the same dish across shots and finish on the approved ending.',
            'hook':'A spoon circles the simmering sauce.','mustShow':'A chef makes tomato pasta, then plates glossy sauce on the pasta.',
            'obstacle':'The sauce is too thin.','turn':'The chef simmers it until thick.',
            'ending':'Glossy tomato sauce coats the pasta.','seconds':20,'orientation':'vertical','audio':'asmr',
            'requestId':'review-plan-repair'}
        status, repair_job=req('/api/draft','creator-a',repair_payload)
        assert status==202 and repair_job['id']==repair_session,repair_job
        assert repair_job['video'] is None and repair_job['previousVideo']=='outputs/review-a.mp4',repair_job
        assert repair_job['options']['storyPrompt']==repair_payload['prompt']
        assert repair_job['options']['repairGuidance']==repair_payload['repairGuidance']
        assert repair_job['options']['unattended'] is False
        repair_job=finish(repair_session)
        assert repair_job['attempts'][0]['video']=='outputs/review-a.mp4',repair_job['attempts']
        assert repair_job['previousVideo']=='outputs/review-a.mp4' and repair_job['kind']=='draft',repair_job
        status, legacy_retry_job=req('/api/draft','creator-a',{'prompt':legacy_prompt,'retrySessionId':legacy_retry,'requestId':'legacy-brief-retry'})
        assert status==202 and legacy_retry_job['id']==legacy_retry,legacy_retry_job
        assert legacy_retry_job['options']['brief']['topic']==legacy_prompt and legacy_retry_job['options']['brief']['seconds']==60
        legacy_retry_job=finish(legacy_retry)
        assert legacy_retry_job['attempts'][0]['lines']==['BLOCKED: previous local model failure'],legacy_retry_job['attempts']
        assert legacy_retry_job['previousVideo']=='outputs/review-a.mp4' and legacy_retry_job['attempts'][0]['video']=='outputs/review-a.mp4',legacy_retry_job
        before_ambiguous=req('/api/state','creator-a')[1]
        status, choices=req('/api/draft','creator-a',{'prompt':'tomatoes','seconds':20,'look':'food','refine':True})
        assert status==200 and choices['decision']=='needs_choices' and len(choices['refinement']['choices'])==2,choices
        assert refiner_payloads[-1]['learningEvidence']['humanNotes'][0]['note']=='Keep the same tomato shape between shots.'
        assert refiner_payloads[-1]['learningEvidence']['repeatedFailures'][0]['reason']=='beat 2 has no filmable physical action'
        after_ambiguous=req('/api/state','creator-a')[1]
        assert after_ambiguous.get('id')==before_ambiguous.get('id') and after_ambiguous.get('status')==before_ambiguous.get('status')  # ambiguous idea starts no job
        chosen=choices['refinement']['choices'][0]
        status, approved=req('/api/draft','creator-a',{'prompt':chosen['prompt'],'originalPrompt':'tomatoes','seconds':20,'look':'food',
            'hook':chosen['hook'],'mustShow':chosen['mustShow'],'obstacle':chosen['obstacle'],'turn':chosen['turn'],'ending':chosen['ending'],
            'requestId':'approval-replay'})
        assert status==202 and approved['options']['originalPrompt']=='tomatoes' and approved['options']['learningGuidanceCount']>=2,approved
        choice_answers={}
        for answer in (root/'storage').glob('studio-answers-*.json'):
            candidate=json.loads(answer.read_text())
            if candidate.get('hook')==chosen['hook']:
                choice_answers=candidate
                break
        assert choice_answers['topic']==chosen['prompt'] and choice_answers['hook']==chosen['hook']
        assert choice_answers['mustShow']==chosen['mustShow'] and choice_answers['ending']==chosen['ending']
        finish(approved['id'])
        _, session_summaries=req('/api/sessions','creator-a')
        assert any(item['id']==approved['id'] and item['storyPrompt']==chosen['prompt'] for item in session_summaries)
        replay_status, replay=req('/api/draft','creator-a',{'prompt':chosen['prompt'],'originalPrompt':'tomatoes','requestId':'approval-replay'})
        assert replay_status==200 and replay['id']==approved['id'],replay
        answer_count=len(list((root/'storage').glob('studio-answers-*.json')))
        duplicate_status, duplicate=req('/api/draft','creator-a',{'prompt':'tomatoes'})
        assert duplicate_status==409 and duplicate['sessionId']==approved['id'],duplicate
        duplicate_story_status, duplicate_story=req('/api/draft','creator-a',{'prompt':chosen['prompt']})
        assert duplicate_story_status==409 and duplicate_story['sessionId']==approved['id'],duplicate_story
        assert len(list((root/'storage').glob('studio-answers-*.json')))==answer_count
        retry_status, retried=req('/api/draft','creator-a',{'prompt':chosen['prompt'],'originalPrompt':'tomatoes',
            'retrySessionId':approved['id'],'requestId':'same-project-retry'})
        assert retry_status==202 and retried['id']==approved['id'] and len(retried['attempts'])==1,retried
        assert retried['attempts'][0]['plan']['plan']['title']=='The Copper Kite',retried['attempts']
        retried=finish(approved['id'])
        assert len(retried['attempts'])==1 and retried['attempts'][0]['status']=='done',retried['attempts']
        for answer in (root/'storage').glob('studio-answers-*.json'): answer.unlink()
        status, draft=req('/api/draft','creator-a',{'prompt':'A chef chopping tomatoes for pasta','seconds':20,'look':'cartoon','refine':True})
        assert status==202 and draft['options']['seconds']==20, draft
        answer_files=list((root/'storage').glob('studio-answers-*.json'))
        assert len(answer_files)==1
        answers=json.loads(answer_files[0].read_text())
        assert answers['topic']=='In a cozy kitchen, a chef chops ripe tomatoes, simmers them into a thick glossy sauce, then coats fresh pasta and finishes with a close view of sauce clinging to each strand.'
        assert answers['hook']=='A chef chopping tomatoes for pasta'
        assert answers['mustShow']=='A chef chopping tomatoes for pasta'
        assert answers['obstacle']=='The sauce is watery and slides off the pasta.'
        assert answers['turn']=='The chef simmers until it thickens and clings to the spoon.'
        assert answers['ending']=='Glossy tomato sauce coats the pasta.'
        assert draft['options']['originalPrompt']=='A chef chopping tomatoes for pasta'
        assert draft['options']['storyPrompt']=='In a cozy kitchen, a chef chops ripe tomatoes, simmers them into a thick glossy sauce, then coats fresh pasta and finishes with a close view of sauce clinging to each strand.'
        session=draft['id']
        drafted=finish()
        assert drafted['plan']['plan']['title']=='The Copper Kite',drafted
        scenario=drafted['scenario']
        work=root/'storage/any-local/fresh.local-scenario/refs'
        work.mkdir(parents=True)
        def png_chunk(kind, data):
            return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
        pixels=b''.join(b'\0'+bytes([70,120,180])*256 for _ in range(256))
        png=(b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('!IIBBBBB',256,256,8,2,0,0,0))
            +png_chunk(b'IDAT',zlib.compress(pixels))+png_chunk(b'IEND',b''))
        data_url='data:image/png;base64,'+base64.b64encode(png).decode()
        reference_payload={'scenario':scenario,'sessionId':session,'shot':1,'dataUrl':data_url}
        assert req('/api/reference-frame','creator-b',reference_payload)[0]==403
        reference_status, uploaded=req('/api/reference-frame','creator-a',reference_payload)
        assert reference_status==201 and uploaded['reference']['shot']==1,uploaded
        reference_status, uploaded=req('/api/reference-frame','creator-a',{**reference_payload,'shot':2})
        assert reference_status==201 and uploaded['reference']['shot']==2,uploaded
        references=json.loads((root/'storage/any-local/fresh.local-scenario/references.json').read_text())
        assert [item['shot'] for item in references['references']]==[1,2]
        assert len(req('/api/live-files?scenario='+scenario,'creator-a')[1]['referenceFrames'])==2
        assert req('/api/reference-frame','creator-a',{**reference_payload,'shot':3})[0]==400
        assert req('/api/reference-frame','creator-a',{**reference_payload,'dataUrl':'data:image/svg+xml;base64,PHN2Zy8+'})[0]==400
        (root/'scripts/pin-fixture.py').write_text("import hashlib,json,sys\nfrom pathlib import Path\nscenario=Path(sys.argv[1])\nwork=Path('storage/any-local')/scenario.stem\nframes=[]\nfor i in range(2):\n    file=work/'refs'/f'shot-{i:02d}-aa.png'\n    file.write_bytes(bytes([i]))\n    frames.append(dict(shot=i+1,file=str(file.relative_to(work)),sha256=hashlib.sha256(file.read_bytes()).hexdigest()))\ndata=dict(schemaVersion=1,scenarioSha256=hashlib.sha256(scenario.read_bytes()).hexdigest(),frames=frames)\nrefs=work/'references.json'\nif refs.is_file(): data['referenceManifestSha256']=hashlib.sha256(refs.read_bytes()).hexdigest()\n(work/'first-frames.json').write_text(json.dumps(data))\n")
        (root/'scripts/pending-fixture.py').write_text("import hashlib,json,sys\nfrom pathlib import Path\nscenario=Path(sys.argv[1])\nshot=int(sys.argv[2])\nwork=Path('storage/any-local')/scenario.stem\nframes=[]\ni=shot-1\ncandidates=[]\nfor number in range(1,4):\n    file=work/'refs'/f'shot-{i:02d}-{number:02x}.png'\n    file.write_bytes(f'{i}-{number}'.encode())\n    candidates.append(dict(candidate=number,file=str(file.relative_to(work)),sha256=hashlib.sha256(file.read_bytes()).hexdigest(),status='review-required' if number==1 else 'passed',reason='ingredient mismatch' if number==1 else ''))\nframes.append(dict(shot=shot,selectedFile=candidates[0]['file'],candidates=candidates))\ndata=dict(schemaVersion=1,scenarioSha256=hashlib.sha256(scenario.read_bytes()).hexdigest(),frames=frames)\nrefs=work/'references.json'\nif refs.is_file(): data['referenceManifestSha256']=hashlib.sha256(refs.read_bytes()).hexdigest()\n(work/'pending-first-frames.json').write_text(json.dumps(data))\n")
        (root/'scripts/make-local-video.sh').write_text("""set -e
echo "Fixture args: $*"
if [ "$3" = '--stills-only' ]; then
      echo 'Presentation: voiced (explicit scenario setting)'
      echo 'First-frame review only: skipping narration, soundtrack, and motion preparation.'
      echo 'Sound cue and ASMR coverage plan passed.'
      if [ "$5" = '--allow-pending-visual-review' ]; then python3 scripts/pending-fixture.py "$2" "$7"; else python3 scripts/pin-fixture.py "$2"; fi
      exit 0
    fi
    cp cached.mp4 outputs/fresh-approved.mp4
    echo 'Studio verified export: outputs/fresh-approved.mp4'
    """)
        (root/'scripts/render-studio-shot.py').write_text("""import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--scenario',required=True)
p.add_argument('--scenario-sha256',required=True)
p.add_argument('--shot',required=True,type=int)
p.add_argument('--reference',required=True)
p.add_argument('--reference-sha256',required=True)
p.add_argument('--editor',required=True)
a=p.parse_args()
scenario=Path(a.scenario); work=Path('storage/any-local')/scenario.stem
motion=work/'motion'; motion.mkdir(parents=True,exist_ok=True)
clip=motion/f'fixture-shot-{a.shot}.mp4'; clip.write_bytes(f'clip-{a.shot}'.encode())
end=motion/f'fixture-shot-{a.shot}-end.png'; end.write_bytes(f'end-{a.shot}'.encode())
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
result={'schemaVersion':1,'scenarioSha256':sha(scenario),'shot':a.shot,
 'approvedReferenceSha256':sha(Path(a.reference)),'clip':str(clip.relative_to(work)),
 'clipSha256':sha(clip),'endFrame':str(end.relative_to(work)),'endFrameSha256':sha(end)}
directory=work/'sequence'; directory.mkdir(parents=True,exist_ok=True)
(directory/f'shot-{a.shot:02d}.json').write_text(json.dumps(result))
""")
        (root/'cached.mp4').write_bytes(bytes(256))
        payload={'scenario':scenario,'sessionId':session}
        assert req('/api/stills','creator-a',payload)[0]==202
        stills=finish()
        assert stills['kind']=='stills'
        assert not {'Finishing and exporting','Mixing sound','Recording narration','Generating motion clips'}.intersection(stills['steps'])
        live=req('/api/live-files?scenario='+scenario,'creator-a')[1]
        assert len(live['stills'])==1 and live['stills'][0]['shot']==1 and live['needsHumanReview'] is True
        assert len(live['pendingFrames'])==1 and live['pendingFrames'][0]['shot']==1
        assert len(live['pendingFrames'][0]['candidates'])==3
        unattended_status, unattended_response=req('/api/approve-frames','creator-a',{
            'scenario':scenario,'sessionId':unattended_session,'selections':[]})
        assert unattended_status==409,unattended_response
        pending_manifest=work.parent/'pending-first-frames.json'
        original_pending=pending_manifest.read_text()
        tampered_pending=json.loads(original_pending)
        tampered_pending['frames'][0]['candidates'][0]['sha256']='bad'
        pending_manifest.write_text(json.dumps(tampered_pending))
        assert req('/api/approve-frames','creator-a',{
            **payload,'selections':[{'shot':1,'candidate':2}]})[0]==409
        pending_manifest.write_text(original_pending)
        approved_status, approved_frames=req('/api/approve-frames','creator-a',{
            **payload,'selections':[{'shot':1,'candidate':2}]})
        assert approved_status==200 and approved_frames['ok'] is True and approved_frames['sequential'] is True,approved_frames
        motion=finish(session)
        assert motion['kind']=='sequence-motion' and motion['status']=='done',motion
        motion_data=json.loads((work.parent/'sequence/shot-01.json').read_text())
        end_frame=work.parent/motion_data['endFrame']
        original_end=end_frame.read_bytes()
        end_frame.write_bytes(original_end+b'tampered')
        assert req('/api/sequence/next','creator-a',payload)[0]==409
        retry_status,retry_job=req('/api/sequence/retry','creator-a',payload)
        assert retry_status==202 and retry_job['kind']=='sequence-motion',retry_job
        assert finish(session)['status']=='done'
        next_status,next_job=req('/api/sequence/next','creator-a',payload)
        assert next_status==202 and next_job['kind']=='stills' and next_job['sequence']['currentShot']==2,next_job
        next_stills=finish(session)
        assert next_stills['status']=='done' and '--chain-source' in next_stills['lines'][0] and '--chain-source-sha256' in next_stills['lines'][0] and '--anchor-image' in next_stills['lines'][0] and 'shot-00-02.png' in next_stills['lines'][0],next_stills['lines']
        approved_status, approved_frames=req('/api/approve-frames','creator-a',{
            **payload,'selections':[{'shot':2,'candidate':3}]})
        assert approved_status==200 and approved_frames['sequential'] is True,approved_frames
        assert finish(session)['status']=='done'
        ready_status,ready=req('/api/sequence/next','creator-a',payload)
        assert ready_status==200 and ready['ready'] is True,ready
        manifest=work.parent/'first-frames.json'
        reviewed=json.loads(manifest.read_text())
        assert reviewed['reviewMethod']=='human' and reviewed['reviewedBy']=='creator-a'
        assert [frame['shot'] for frame in reviewed['frames']]==[1,2]
        original=manifest.read_text()
        retry_status, failed_retry=req('/api/stills','creator-a',{'scenario':scenario,'sessionId':failed_stills})
        assert retry_status==202 and failed_retry['id']==failed_stills
        failed_retry=finish(failed_stills)
        assert failed_retry['attempts'][0]['status']=='failed'
        assert failed_retry['attempts'][0]['lines']==['Vision review unavailable']
        assert '--chain-images' not in failed_retry['lines'][0]
        assert req('/api/regen','creator-a',{**payload,'shot':2})[0]==202
        assert finish()['status']=='done'
        assert json.loads((work/'seed-bumps.json').read_text())=={'1':1}
        assert req('/api/approve-frames','creator-a',{
            **payload,'selections':[{'shot':2,'candidate':2}]})[0]==200
        assert finish()['status']=='done'
        assert req('/api/sequence/next','creator-a',payload)[1]['ready'] is True
        original=manifest.read_text()
        assert req('/api/sessions/'+session,'creator-b')[0]==404
        (work/'vision-deadbeef.json').write_text(json.dumps({
            'image':str((work/'shot-01-03.png').resolve()),
            'status':'review-required',
            'verdict':{'missingOrWrong':['tofu is visible']},
        }))
        broken=json.loads(original)
        broken['frames'][0]['sha256']='bad'
        manifest.write_text(json.dumps(broken))
        pending=req('/api/live-files?scenario='+scenario,'creator-a')[1]['stills']
        assert len(pending)==2 and all(frame['verified'] is False for frame in pending),pending
        flagged=next(frame for frame in pending if frame['shot']==2)
        assert flagged['reviewStatus']=='review-required' and 'tofu' in flagged['reviewReason'],flagged
        assert req('/api/render','creator-a',payload)[0]==409
        manifest.write_text(original)
        reference_manifest=work.parent/'references.json'
        original_references=reference_manifest.read_bytes()
        reference_manifest.write_bytes(original_references+b' ')
        assert req('/api/render','creator-a',payload)[0]==409
        reference_manifest.write_bytes(original_references)
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
        replay_status, replay=req('/api/draft','creator-a',{'prompt':chosen['prompt'],'originalPrompt':'tomatoes','requestId':'approval-replay'})
        assert replay_status==200 and replay['id']==approved['id'],replay
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
        timeout_session=legacy_retry
        timeout_prompt=legacy_prompt
        (root/'scripts/studio-draft.py').write_text('import time; time.sleep(30)')
        status,state=req('/api/draft','creator-a',{'prompt':timeout_prompt,'originalPrompt':timeout_prompt,
            'retrySessionId':timeout_session,'requestId':'timeout-recovery'})
        assert status==202 and state['previousVideo']=='outputs/review-a.mp4',state
        for _ in range(150):
            state=req('/api/sessions/'+timeout_session,'creator-a')[1]
            if state['status']=='failed':break
            time.sleep(.05)
        assert state['status']=='failed' and 'retry planning' in state['error'],state
        assert state['previousVideo']=='outputs/review-a.mp4' and state['attempts'][0]['video']=='outputs/review-a.mp4',state
        (root/'scripts/studio-draft.py').write_text(
            "from pathlib import Path\n"
            "p=Path('drafts/generated/fresh.local-scenario.json')\n"
            "p.write_text('{\\\"plan\\\":{\\\"title\\\":\\\"The Copper Kite\\\",\\\"shots\\\":[{\\\"seconds\\\":5}]}}')\n"
            "print(p, flush=True)\n")
        status,retried=req('/api/draft','creator-a',{'prompt':timeout_prompt,'originalPrompt':timeout_prompt,
            'retrySessionId':timeout_session,'requestId':'timeout-retry'})
        assert status==202 and retried['previousVideo']=='outputs/review-a.mp4',retried
        state=finish(timeout_session)
        assert state['status']=='done' and state['kind']=='draft',state
        assert state['previousVideo']=='outputs/review-a.mp4' and state['attempts'][0]['video']=='outputs/review-a.mp4',state
        assert state['attempts'][-1]['status']=='failed',state['attempts']
        print('PASS: manifest integrity, scenario-bound checkpoint review and access controls, recoverable planning timeout with prior-export retention; unattended sequencing without browser, blocked plan stops, range 416, cancelled process holds lock, and stale feedback denied.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


class StudioWorkflowTests(unittest.TestCase):
    def test_manual_unattended_and_recovery(self):
        run_fixture()


if __name__ == '__main__':
    unittest.main()
