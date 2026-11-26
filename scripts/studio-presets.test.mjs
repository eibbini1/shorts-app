import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadStudioPreset } from './studio-presets.mjs';
import { selectPeopleStory } from './people-stories.mjs';

const studios = fs.readdirSync(new URL('../data/studios/', import.meta.url)).filter(name=>name.endsWith('.json') && name!=='luxury-kitchen.json');
test('every everyday studio has three valid lighting choices and no claimed plates',()=>{
  assert.equal(studios.length,35); // 16 everyday + 15 worldwide + 4 Levant/Gulf
  for(const name of studios){
    const base=loadStudioPreset(name.slice(0,-5));
    assert.equal(base.status,'prompt-only');
    assert.deepEqual(base.referenceFrames,{});
    assert.equal(base.lightingVariants.length,3);
    assert.equal(new Set(base.lightingVariants.map(v=>v.id)).size,3);
    for(const variant of base.lightingVariants){
      const selected=loadStudioPreset(base.id,variant.id);
      assert.equal(selected.lighting,variant.lighting);
      assert.equal(selected.set,base.set);
      assert.ok(selected.props.length<=3);
    }
  }
});
test('preset resolver rejects traversal and missing lighting instead of substituting a kitchen',()=>{
  assert.throws(()=>loadStudioPreset('../outside'),/studio/);
  assert.throws(()=>loadStudioPreset('quiet-cafe','missing'),/lighting/);
  const kitchen=loadStudioPreset('luxury-kitchen');
  assert.equal(kitchen.lightingVariantId,'base');
});
test('people stories map independently selected settings to real studios and stable lighting',()=>{
  const options={enabled:true,mode:'people-stories',user:'owner',projectId:'mapping',settingId:'cafe-counter',personId:'silver-curls',lightingVariantId:'soft-evening'};
  const result=selectPeopleStory(options);
  assert.equal(result.studioId,'quiet-cafe');
  assert.equal(result.backgroundRecipe.lightingVariantId,'soft-evening');
  assert.equal(result.personId,'silver-curls');
  assert.deepEqual(result,selectPeopleStory(options));
  assert.deepEqual(selectPeopleStory({...options,saved:result}),result);
  assert.throws(()=>selectPeopleStory({...options,lightingVariantId:'missing'}),/lighting/);
  assert.equal(selectPeopleStory({...options,mode:'food'}),null);
});
