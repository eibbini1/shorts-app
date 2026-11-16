import test from 'node:test';
import assert from 'node:assert/strict';
import {fitOutlineIdeas, narrationWordBand} from './story-draft-utils.mjs';

test('extra Gemma outline ideas are capped without another model call', () => {
  const original={ideas:Array.from({length:7},(_,i)=>({title:`Idea ${i+1}`,angle:'filmable'})),title:'Chicken'};
  const fitted=fitOutlineIdeas(original);
  assert.equal(fitted.ideas.length,5);
  assert.equal(fitted.ideas[4].title,'Idea 5');
  assert.equal(original.ideas.length,7);
});

test('five-second narration accepts a sound-led pause but limits crowding', () => {
  assert.deepEqual(narrationWordBand(5),{min:4,max:12});
});
