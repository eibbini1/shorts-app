import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StillsSpec } from '../media/assemble/types.js';
import { atomicJson } from '../automation/spec.js';
import { scoreHook } from '../cli/viralUtils.js';
import { checkVariation } from '../cli/variation.js';
export interface SourceNote { url:string; title:string; checkedAt:string; claims:string[] }
export interface DraftBrief { id:string; title:string; hookText:string; kicker:string; sources:SourceNote[]; lines:string[]; visuals:string[]; visualStyle?:string }
export interface EpisodeDraft { version:1; id:string; title:string; status:'review-required'; createdAt:string; sources:SourceNote[]; narrationCharacters:number; estimatedNarrationSeconds:number; hookScore:number; visualPrompts:string[]; proposedSpec:StillsSpec; variationWarnings:{other:string;issues:string[]}[]; reviewChecklist:string[] }
function promptedMotion(prompt: string): StillsSpec['scenes'][number]['motion'] {
  const direction = /\b(push[ -]in|zoom[ -]in|pull[ -]back|zoom[ -]out|pan[ -]left|pan[ -]right)\b/i.exec(prompt)?.[1];
  switch (direction?.toLowerCase().replace('-', ' ')) {
    case 'push in':
    case 'zoom in': return 'in';
    case 'pull back':
    case 'zoom out': return 'out';
    case 'pan left': return 'left';
    case 'pan right': return 'right';
  }
  return undefined;
}

export function buildDraft(brief:DraftBrief,reference:StillsSpec,now=new Date()):EpisodeDraft {
  if(!/^[a-z0-9][a-z0-9-]*$/.test(brief.id) || !brief.title?.trim() || brief.lines.length<4 || brief.lines.length>9 || brief.visuals.length!==brief.lines.length || brief.lines.some(s=>!s.trim()))throw new Error('Draft needs a safe ID and 4-9 narrated scenes with matching visuals');
  if(!brief.sources.length || brief.sources.some(s=>!s.title?.trim() || !s.claims.length || new URL(s.url).protocol!=='https:' || !Number.isFinite(Date.parse(s.checkedAt))))throw new Error('Draft requires dated source links and supported claims');
  if (brief.visualStyle !== undefined && (typeof brief.visualStyle !== 'string' || !brief.visualStyle.trim())) throw new Error('visualStyle must be nonempty text');
  const visualStyle = brief.visualStyle ?? 'photoreal luxury food photography, dark cinematic lighting, warm gold accents, crisp food texture';
  const motions=['in','right','left','out'] as const;
  const transitions=['cut','whip','flash','cut','gold','fade'] as const;
  const proposedSpec:StillsSpec={kind:'stills',output:'storage/episodes/'+brief.id+'/'+brief.id+'-final.mp4',fps:24,voice:{...reference.voice},brand:{...reference.brand},music:'ambient',tightOpen:true,hookText:brief.hookText,kicker:brief.kicker,scenes:brief.lines.map((text,i)=>({text,image:'storage/episodes/'+brief.id+'/stills/scene'+(i+1)+'.jpg',motion:promptedMotion(brief.visuals[i] ?? '') ?? motions[i%motions.length]!,...(i?{transition:transitions[i%transitions.length]}:{})}))};
  return {version:1,id:brief.id,title:brief.title,status:'review-required',createdAt:now.toISOString(),sources:brief.sources,narrationCharacters:brief.lines.join('').length,estimatedNarrationSeconds:Math.round(brief.lines.join(' ').split(/\s+/).length/2.6),hookScore:scoreHook(brief.lines).score,visualPrompts:brief.visuals.map(scene=>'9:16 vertical, '+visualStyle+'. '+scene+'. No text, no watermark. AI illustration; do not imply documentary evidence.'),proposedSpec,variationWarnings:[],reviewChecklist:['Review the narration and factual claims against the linked primary sources.','Confirm historical dates and avoid presenting an old record as current.','Review image prompts and keep AI visual disclosure.','Supply or explicitly approve generating the scene images.','Approve narration spending separately before using a paid voice provider.']};
}
export function reviewMarkdown(draft:EpisodeDraft):string {
  return '# '+draft.title+'\n\nStatus: review required. No API calls or paid generation have run.\n\n'+draft.proposedSpec.scenes.map((s,i)=>(i+1)+'. '+s.text+'\n\n   Visual: '+draft.visualPrompts[i]).join('\n\n')+'\n\nSources checked:\n\n'+draft.sources.map(s=>'- ['+s.title+']('+s.url+') — '+s.checkedAt).join('\n')+'\n\nReview before spending:\n\n'+draft.reviewChecklist.map(s=>'- '+s).join('\n')+'\n';
}
export async function generatePendingDrafts(root:string,briefsFile='drafts/briefs.json',referenceFile='episodes/tuna-ep1.assemble.json',dryRun=false):Promise<string[]> {
  const briefs=JSON.parse(await readFile(path.resolve(root,briefsFile),'utf8')) as DraftBrief[];
  const reference=JSON.parse((await readFile(path.resolve(root,referenceFile),'utf8')).replace(/^\uFEFF/,'')) as StillsSpec;
  const out=path.join(root,'drafts/generated');
  if(!dryRun)await mkdir(out,{recursive:true});
  const files:string[]=[];
  for(const brief of briefs){
    const draft=buildDraft(brief,reference);
    const file=path.join(out,draft.id+'.draft.json');
    try{await readFile(file);console.log('DRAFT EXISTS '+path.relative(root,file));files.push(file);continue;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(dryRun){console.log('WOULD DRAFT '+draft.title);continue;}
    // Check variation with a temporary spec in the draft folder, never the production queue.
    const temp=path.join(out,draft.id+'.assemble.json');
    try{await writeFile(temp,JSON.stringify(draft.proposedSpec));draft.variationWarnings=await checkVariation(temp,path.join(root,'episodes'));}
    finally{const {rm}=await import('node:fs/promises');await rm(temp,{force:true});}
    await atomicJson(file,draft);await writeFile(path.join(out,draft.id+'.md'),reviewMarkdown(draft),'utf8');files.push(file);
    console.log('DRAFT READY '+path.relative(root,file)+' (review required; no spending)');
  }
  return files;
}
