import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {selectPeopleStory} from './people-stories.mjs';
const request={enabled:true,mode:'people-stories',user:'owner',projectId:'one'};
test('history is restricted to finished exports for this user',()=>{
 const ignored=[{user:'other',status:'done',kind:'render',video:'a',technicalQa:{status:'passed'}},{user:'owner',status:'failed'}];
 assert.deepEqual(selectPeopleStory({...request,sessions:ignored}),selectPeopleStory({...request,sessions:[]}));
});
test('each dimension avoids the previous two and choices are independent',()=>{
 const sessions=[];
 const combinations=new Set();
 for(let i=0;i<12;i++){
  const choice=selectPeopleStory({...request,projectId:String(i),sessions});
  for(const prior of sessions.slice(-2)) for(const key of ['personId','settingId','shapeId']) assert.notEqual(choice[key],prior.options.varietySelection[key]);
  combinations.add(choice.personId+choice.settingId);
  sessions.push({user:'owner',status:'done',kind:'render',video:String(i),technicalQa:{status:'passed'},updatedAt:i,options:{varietySelection:choice}});
 }
 assert.ok(combinations.size>3);
});
test('explicit choices and saved retries win',()=>{
 const saved=selectPeopleStory(request);
 assert.deepEqual(selectPeopleStory({...request,saved}),saved);
 const pinned=selectPeopleStory({...request,personId:'silver-curls',ending:'She smiles.'});
 assert.equal(pinned.personId,'silver-curls');assert.equal(pinned.ending,'She smiles.');
});
test('same-first-picture gate distinguishes actions while rejecting duplicate starts',()=>{
 const code="import sys; sys.path.insert(0,'scripts'); import runpy; m=runpy.run_path('scripts/audit-local-story.py'); f=m['near_duplicate']; assert not f('She reads a note. Same rooftop and blue jacket.','She folds the note. Same rooftop and blue jacket.'); assert f('She reads a note. Same rooftop.','She reads a note. Different light.')";
 execFileSync('python3',['-B','-c',code]);
});
test('opt in leaves food defaults alone and versioned selection is deterministic',()=>{
 assert.equal(selectPeopleStory({...request,enabled:false}),null);
 assert.equal(selectPeopleStory({...request,mode:'food'}),null);
 assert.deepEqual(selectPeopleStory(request),selectPeopleStory(request));
 assert.equal(selectPeopleStory(request).version,1);
});
