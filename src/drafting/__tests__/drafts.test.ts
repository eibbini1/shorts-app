import { describe,it,expect } from 'vitest';
import { buildDraft,reviewMarkdown,type DraftBrief } from '../drafts.js';
import type { StillsSpec } from '../../media/assemble/types.js';
const reference:StillsSpec={kind:'stills',output:'x.mp4',voice:{provider:'elevenlabs',speed:1},brand:{name:'Billionaire Bites'},scenes:[]};
const brief:DraftBrief={id:'new-food-ep1',title:'A sourced food story',hookText:'A NEW ANGLE',kicker:'LOOK CLOSER',sources:[{url:'https://example.org/source',title:'Source',checkedAt:'2026-11-02',claims:['Source-supported fact.']}],lines:['A factual opening.','One sourced fact.','Another verified detail.','What do you think?'],visuals:['Food close-up','Food context','Ingredient texture','Finished plate']};
describe('review-first drafts',()=>{
  it('matches the channel style but always requires review without creating paid assets',()=>{
    const draft=buildDraft(brief,reference,new Date('2026-11-02T12:00:00Z'));
    expect(draft.status).toBe('review-required');expect(draft.proposedSpec.voice).toEqual(reference.voice);
    expect(draft.proposedSpec.scenes).toHaveLength(4);expect(draft.visualPrompts.every(p=>p.includes('9:16'))).toBe(true);
    expect(draft.reviewChecklist.some(c=>c.includes('spending separately'))).toBe(true);
    expect(reviewMarkdown(draft)).toContain('No API calls or paid generation have run');
  });
  it('refuses unsafe IDs and missing evidence',()=>{
    expect(()=>buildDraft({...brief,id:'../overwrite'},reference)).toThrow('safe ID');
    expect(()=>buildDraft({...brief,sources:[]},reference)).toThrow('source links');
  });
});
