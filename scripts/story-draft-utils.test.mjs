import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVisualIdentityLock, collectPromptChanges, fitOutlineIdeas, hasSupportedAsmrCue, narrationWordBand, reconcileSceneStateBefore} from './story-draft-utils.mjs';

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

test('ASMR sound planning requires a cue supported by the local Foley renderer', () => {
  assert.equal(hasSupportedAsmrCue('Oven door closing, quiet rumble'),false);
  assert.equal(hasSupportedAsmrCue('Soft oven-rack scrape and door clink'),true);
  assert.equal(hasSupportedAsmrCue('A ball bounce on the grass'),true);
  assert.equal(hasSupportedAsmrCue('Soft room tone'),true);
});

test('scene-state handoff copies the prior end state without changing the new action', () => {
  const state={before:'pizza inside oven',action:'a hand pulls the pizza out',after:'pizza rests on board'};
  assert.equal(reconcileSceneStateBefore(state,'pizza inside oven.'),false);
  assert.equal(reconcileSceneStateBefore(state,'pizza is inside oven with door closed'),true);
  assert.deepEqual(state,{
    before:'pizza is inside oven with door closed',
    action:'a hand pulls the pizza out',
    after:'pizza rests on board',
  });
});

test('every scene prompt carries the same detailed visual identity and retains its action', () => {
  const identity = 'short dark-brown fringe, round cheeks, blue onesie, and a red-yellow-green ball';
  const first = applyVisualIdentityLock('The baby giggles while holding the ball.', 'the same baby and ball', identity);
  const second = applyVisualIdentityLock('The baby rolls the ball toward the grass.', 'the same baby and ball', identity);

  for (const prompt of [first, second]) {
    assert.ok(prompt.includes(identity));
    assert.ok(prompt.includes('Do not redesign recurring subjects between shots'));
    assert.ok(prompt.length <= 1000);
  }
  assert.ok(first.includes('The baby giggles while holding the ball.'));
  assert.ok(second.includes('The baby rolls the ball toward the grass.'));
});

test('preflight prompt changes retain exact before and after text for the selected shots', () => {
  const before = [
    { imagePrompt: 'Dough waits.', motionPrompt: 'A baker spreads sauce.' },
    { imagePrompt: 'Pizza waits.', motionPrompt: 'The baker slides it in.' },
  ];
  const after = [
    { imagePrompt: 'Dough waits.', motionPrompt: 'A baker spreads sauce.' },
    { imagePrompt: 'Pizza waits.', motionPrompt: 'The baker slides it in, showing the requested handoff.' },
  ];

  assert.deepEqual(collectPromptChanges(before, after, [2], 'preserved requested action'), [{
    shot: 2,
    reason: 'preserved requested action',
    changes: [{
      field: 'motionPrompt',
      before: 'The baker slides it in.',
      after: 'The baker slides it in, showing the requested handoff.',
    }],
  }]);
});
