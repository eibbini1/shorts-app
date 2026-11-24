import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectShotTypes, materializeShotRecipe } from './shot-types.mjs';

const catalogue = JSON.parse(fs.readFileSync(new URL('../data/shot-types.json', import.meta.url)));
test('default off and explicit rollback return no recipes', () => {
  const previous = process.env.SHORTS_SHOT_TYPES;
  delete process.env.SHORTS_SHOT_TYPES;
  try { assert.equal(selectShotTypes({ shotCount: 3 }), null); }
  finally { if (previous !== undefined) process.env.SHORTS_SHOT_TYPES = previous; }
  assert.equal(selectShotTypes({ enabled: false, shotCount: 3 }), null);
});
test('exactly four types enabled; every still starts mid-action and camera is locked', () => {
  assert.equal(catalogue.types.filter(type => type.enabled).length, 4);
  assert.equal(catalogue.types.filter(type => !type.enabled).length, 3);
  for (const type of catalogue.types) {
    assert.equal(type.camera.default, 'locked');
    assert.ok(type.background.props.length <= 3);
    assert.equal(type.stillPhase, 'action-underway');
    assert.ok(type.examples.still.length > 20);
  }
});
test('planner mixes two or three types without adjacent repetition', () => {
  for (const count of [2,3,6,12]) {
    const rows=selectShotTypes({ enabled:true, shotCount:count });
    assert.equal(rows.length,count);
    assert.equal(new Set(rows.map(row=>row.typeId)).size,Math.min(count,3));
    rows.forEach((row,index)=> {
      assert.equal(row.camera,'locked');
      if(index) assert.notEqual(row.typeId,rows[index-1].typeId);
    });
  }
});
test('explicit disabled types and unsupported camera motion fail before model work', () => {
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:1,typeIds:['walking-environment']}),/disabled/);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:1,typeIds:['missing']}),/Unknown/);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:1,cameraMoves:['push-in']}),/opted in/);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:0}),/shotCount/);
});
test('typed recipes retain versions, explicit choices and independent retry copies', () => {
  const rows=selectShotTypes({enabled:true,shotCount:2,typeIds:['face-led-portrait','macro-detail']});
  assert.equal(rows[0].typeId,'face-led-portrait');
  assert.equal(rows[0].libraryVersion,catalogue.version);
  const copy=selectShotTypes({enabled:true,shotCount:2,saved:rows});
  assert.deepEqual(copy,rows);
  copy[0].background.props.push('test');
  assert.notDeepEqual(copy,rows);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:3,saved:rows}),/count/);
});
test('pilot is eight matched clips and records action and preference separately', () => {
  assert.equal(catalogue.pilot.seed,2200);
  assert.equal(catalogue.pilot.totalClips,8);
  assert.deepEqual(catalogue.pilot.scores,['actionHappened','looksGood']);
});

test('beat meaning selects place, feeling and action types independently of catalogue order', () => {
  const rows=selectShotTypes({enabled:true,shotCount:4,beats:[
    {kind:'feeling'},{kind:'place'},{kind:'action',scale:'detail'},{kind:'action',scale:'contact'}]});
  assert.deepEqual(rows.map(row=>row.typeId),['face-led-portrait','wide-establishing','macro-detail','hands-in-action']);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:2,beats:[{kind:'place'}]}),/beat count/);
  assert.throws(()=>selectShotTypes({enabled:true,shotCount:1,beats:[{kind:'unknown'}]}),/Unknown beat/);
});
test('action templates stay generic while retaining the original concrete examples', () => {
  for(const type of catalogue.types) {
    assert.ok(type.motionTemplate.includes('{action}'));
    assert.ok(type.stillTemplate.includes('{action}'));
    assert.ok(type.examples.motion.length>20);
    assert.ok(type.examples.still.length>20);
  }
  const recipe=selectShotTypes({enabled:true,shotCount:1,typeIds:['macro-detail']})[0];
  const original=structuredClone(recipe);
  const rendered=materializeShotRecipe(recipe,{
    action:'A bead of rain slides down the glass',
    startState:'The bead is already sliding on the same window.'});
  assert.ok(rendered.motionPrompt.startsWith('A bead of rain slides down the glass'));
  assert.ok(rendered.imagePrompt.includes('already sliding'));
  assert.doesNotMatch(rendered.motionPrompt,/filling|cream|shell/);
  assert.doesNotMatch(rendered.motionPrompt,/\{action\}/);
  assert.deepEqual(recipe,original);
  assert.throws(()=>materializeShotRecipe(recipe,{action:'',startState:'x'}),/action/);
  assert.throws(()=>materializeShotRecipe(recipe,{action:'Moves',startState:''}),/start state/);
});
