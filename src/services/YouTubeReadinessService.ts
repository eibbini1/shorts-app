import type { Script, VideoMetadata, RenderedVideo, VisualValidationDecision } from '../shared/types.js';
export const MAX_DURATION_SEC = 180;
export interface ReadinessReport { ok: boolean; summary: string; checks: { name: string; status: 'pass' | 'warn' | 'fail'; note: string }[] }
export function assessReadiness(input: { script: Script; metadata: VideoMetadata; render: RenderedVideo; assPath?: string; recentTitles?: string[]; visualValidation?: VisualValidationDecision[] }): ReadinessReport {
  const checks: ReadinessReport['checks'] = [];
  const add = (name: string, ok: boolean, note: string, hard = true) => checks.push({name,status:ok?'pass':hard?'fail':'warn',note});
  add('duration',Number.isFinite(input.render.durationSec)&&input.render.durationSec>0&&input.render.durationSec<=MAX_DURATION_SEC,'Shorts duration ceiling: '+MAX_DURATION_SEC+' seconds');
  add('orientation',input.render.height>=input.render.width,'Vertical or square video required');
  add('title',!!input.metadata.title.trim()&&input.metadata.title.length<=100,'Title must be nonempty and at most 100 characters');
  add('captions',!!input.assPath,'Captions support accessibility',false);
  add('unique title',!input.recentTitles?.includes(input.metadata.title),'Avoid repeating recent titles',false);
  add('visual verification',!(input.visualValidation??[]).some(v=>v.verification!=='verified'),'Placeholder or unverified visuals need review',false);
  const ok=!checks.some(c=>c.status==='fail');
  return {ok,checks,summary:ok?'Ready for review ('+checks.filter(c=>c.status==='warn').length+' advisory warnings)':'Not ready for publishing'};
}
