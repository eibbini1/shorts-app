import test from 'node:test';
import assert from 'node:assert/strict';
import { createShotTypeContext, applyTypedShots } from './shot-type-planner.mjs';
import { verifyScenario, scenarioSettings } from './scenario-schema.mjs';

const outline={protagonist:'A fictional adult in a blue shirt',setting:'A quiet rooftop',visualBible:'Same blue shirt, grey curls, same bench and rooftop.'};
const shots=[
 {seconds:5,narration:'She settles on the bench.',imagePrompt:'She is already settling onto the bench.',motionPrompt:'The camera pushes in as she settles.',sound:'cloth rustle',sceneState:{before:'She is midway through settling onto the bench.',action:'She settles onto the bench',after:'She is seated on the bench.'}},
 {seconds:5,narration:'She smiles softly at the memory.',imagePrompt:'She is already beginning to smile.',motionPrompt:'The camera zooms as she smiles.',sound:'room tone',sceneState:{before:'She is seated on the bench.',action:'She smiles softly',after:'She smiles softly.'}},
];
test('flag off preserves exact legacy shot objects even with malformed people input',()=>{
 const ctx=createShotTypeContext({enabled:false,peopleStory:'invalid'});
 assert.equal(ctx,null);
 assert.equal(applyTypedShots(ctx,{shots}).shots,shots);
});
test('explicit people mapping resolves a real studio, person and stable lighting',()=>{
 const ctx=createShotTypeContext({enabled:true,projectId:'fixture',peopleStory:JSON.stringify({
   mode:'people-stories',personId:'silver-curls',settingId:'rooftop',shapeId:'message',lightingVariantId:'soft-evening'})});
 assert.equal(ctx.peopleStory.studioId,'rooftop-evening');
 assert.match(ctx.person,/silver curls/);
 assert.equal(ctx.studio.lightingVariantId,'soft-evening');
 const explicit=createShotTypeContext({enabled:true,projectId:'fixture',peopleStory:ctx.peopleStory,explicitSetting:'one purple-walled room'});
 assert.equal(explicit.setting,'one purple-walled room');
 assert.throws(()=>createShotTypeContext({enabled:true,peopleStory:{mode:'food'}}),/people-stories/);
});
test('typed framing follows beat content, keeps scene chain and timing, removes camera motion',()=>{
 const ctx=createShotTypeContext({enabled:true});
 const before=structuredClone(shots);
 const result=applyTypedShots(ctx,{shots,beats:[{label:'Place'},{label:'Payoff'}],outline,ending:'She smiles softly.'});
 assert.deepEqual(result.recipes.map(r=>r.typeId),['wide-establishing','face-led-portrait']);
 assert.deepEqual(shots,before);
 result.shots.forEach((shot,i)=>{
   assert.equal(shot.seconds,before[i].seconds);
   assert.equal(shot.narration,before[i].narration);
   assert.equal(shot.sound,before[i].sound);
   assert.deepEqual(shot.sceneState,before[i].sceneState);
   assert.match(shot.motionPrompt,/camera stays locked/);
   assert.doesNotMatch(shot.motionPrompt,/pushes in|zooms/);
   assert.ok(shot.motionPrompt.includes(before[i].sceneState.action));
   assert.ok(shot.imagePrompt.length<=1000 && shot.motionPrompt.length<=1000);
 });
 assert.ok(result.shots[1].motionPrompt.startsWith('Final physical moment: She smiles softly.'));
 const ideas=Array.from({length:5},(_,i)=>({title:'Idea '+(i+1),angle:'A quiet rooftop moment'}));
 verifyScenario({ideas,title:'A woman smiles',hook:'She settles',payoff:'She smiles softly.',shots:result.shots,claimsToCheck:[]},scenarioSettings({seconds:10}));
});
test('camera instructions inside actions and incompatible first frames need a choice',()=>{
 const ctx=createShotTypeContext({enabled:true});
 const bad=structuredClone(shots);bad[0].sceneState.action='The camera zooms toward her face';
 assert.throws(()=>applyTypedShots(ctx,{shots:bad,beats:[],outline}),/camera/);
 const poised=structuredClone(shots);poised[0].sceneState.before='She is about to sit down.';
 assert.throws(()=>applyTypedShots(ctx,{shots:poised,beats:[],outline}),/already underway/);
});
test('food payoff remains a detail action and does not become a face reaction',()=>{
 const ctx=createShotTypeContext({enabled:true});
 const food=structuredClone(shots.slice(0,1));
 food[0].sceneState={before:'Cream is already flowing through an open crack.',action:'The cream flows through the existing crack',after:'Cream pools inside the shell.'};
 const result=applyTypedShots(ctx,{shots:food,beats:[{label:'Payoff'}],outline});
 assert.equal(result.recipes[0].typeId,'macro-detail');
});
