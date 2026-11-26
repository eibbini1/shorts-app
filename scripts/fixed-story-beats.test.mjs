import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixedBeats } from './fixed-story-beats.mjs';

const beats = [
  {before:'The bowl is empty.', action:'She pours cocoa into the bowl.', after:'Cocoa fills the bowl.'},
  {before:'Cocoa fills the bowl.', action:'She lifts the truffle from the cocoa.', after:'She holds the cocoa-dusted truffle.'},
];
test('fixed states preserve the action, chain and exact requested ending', () => {
  const result=validateFixedBeats(beats,2,'She holds the cocoa-dusted truffle');
  assert.deepEqual(result,beats);
  assert.notEqual(result[0],beats[0]);
  assert.throws(()=>validateFixedBeats(beats,3),/exactly 3/);
  assert.throws(()=>validateFixedBeats(beats,2,'She drops the truffle'),/requested ending/);
});
test('rejects broken and backward state chains before asking a model', () => {
  assert.throws(()=>validateFixedBeats([beats[0],{...beats[1],before:'The truffle is elsewhere.'}],2),/previous exact/);
  assert.throws(()=>validateFixedBeats([beats[0],{...beats[1],after:beats[0].before}],2),/earlier state/);
  assert.throws(()=>validateFixedBeats([beats[0],{...beats[1],after:beats[1].before}],2),/changes the state/);
});
