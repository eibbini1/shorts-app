import test from 'node:test';
import assert from 'node:assert/strict';
import {hookBank,patternsFor,pickPatterns,hookGuidance} from './hook-bank.mjs';

test('bank covers all eleven hook-writer mechanisms with unique ids',()=>{
  const mechs=new Set(hookBank.patterns.map(p=>p.mechanism));
  assert.deepEqual([...mechs].sort(),Object.keys(hookBank.mechanisms).sort());
  assert.equal(new Set(hookBank.patterns.map(p=>p.id)).size,hookBank.patterns.length);
});

test('every pattern has spoken, onScreen, visual and motionSafe text; no hard-contact verbs',()=>{
  const hard=/\b(flip|toss|catch|knead|whisk)\w*\b/i;
  for(const p of hookBank.patterns){
    for(const key of ['spoken','onScreen','visual','motionSafe']) assert.ok(p[key]&&p[key].length>3,`${p.id}.${key}`);
    assert.ok(!hard.test(p.motionSafe),`${p.id} motionSafe uses a hard-contact verb`);
    assert.ok(p.spoken.split(/\s+/).length<=14,`${p.id} spoken line too long`);
  }
});

test('no pattern reproduces a banned template',()=>{
  for(const p of hookBank.patterns) assert.ok(!/secret nobody|won't believe|nobody tells/i.test(p.spoken),p.id);
});

test('food kind excludes object-only patterns and includes food ones',()=>{
  const food=patternsFor('food').map(p=>p.id);
  assert.ok(food.includes('tr-raw-to-glossy'));
  assert.ok(!patternsFor('food').some(p=>!p.fit.includes('food')&&!p.fit.includes('any')));
});

test('pickPatterns is stable per topic and spans different mechanisms',()=>{
  const a=pickPatterns('lava cake',{kind:'food',count:3}), b=pickPatterns('lava cake',{kind:'food',count:3});
  assert.deepEqual(a.map(p=>p.id),b.map(p=>p.id));
  assert.equal(new Set(a.map(p=>p.mechanism)).size,3);
  assert.notDeepEqual(a.map(p=>p.id),pickPatterns('a paper boat',{kind:'any',count:3}).map(p=>p.id));
});

test('hookGuidance stays short and states the truth rule',()=>{
  const text=hookGuidance('lava cake',{foodProcess:true});
  assert.ok(text.length<650,`length ${text.length}`);
  assert.match(text,/muted/);
  assert.match(text,/promise only what the film delivers/);
});
