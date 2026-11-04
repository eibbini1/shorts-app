import { readFile,open,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson } from '../automation/spec.js';
import type { EpisodeDraft } from '../drafting/drafts.js';
const arg=(name:string)=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
const file=arg('draft');
if(!file || !process.argv.includes('--facts-reviewed'))throw new Error('Usage: npm run approve-draft -- --draft drafts/generated/name.draft.json --facts-reviewed --confirm EPISODE_ID. This approves content only; paid generation stays disabled.');
const text=await readFile(path.resolve(file),'utf8');
const draft=JSON.parse(text) as EpisodeDraft;
if(draft.version!==1 || draft.status!=='review-required' || !/^[a-z0-9][a-z0-9-]*$/.test(draft.id) || arg('confirm')!==draft.id || draft.proposedSpec.kind!=='stills' || !draft.proposedSpec.scenes.length)throw new Error('Confirm the reviewed draft ID and format');
if(draft.proposedSpec.output!=='storage/episodes/'+draft.id+'/'+draft.id+'-final.mp4')throw new Error('Unexpected draft output path');
await mkdir('episodes',{recursive:true});
const target=path.resolve('episodes',draft.id+'.assemble.json');
const handle=await open(target,'wx');
try{await handle.writeFile(JSON.stringify(draft.proposedSpec,null,2),'utf8');}finally{await handle.close();}
await atomicJson(target.replace(/\.assemble\.json$/,'.review.json'),{reviewedAt:new Date().toISOString(),draftDigest:createHash('sha256').update(text).digest('hex'),factsReviewed:true,paidGenerationApproved:false,sources:draft.sources});
console.log('CONTENT APPROVED '+target+'\nAdd supplied scene images and then add the spec to automation.json. Paid voice generation still requires separate explicit approval.');
