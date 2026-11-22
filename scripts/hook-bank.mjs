import {readFileSync} from 'node:fs';

const bank=JSON.parse(readFileSync(new URL('../data/hook-bank.json',import.meta.url),'utf8'));
export const hookBank=bank;

const hash=text=>[...String(text||'')].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);

/** Patterns for a subject kind ('food' | 'object' | 'any'). */
export function patternsFor(kind){
  return bank.patterns.filter(p=>p.fit.includes(kind)||p.fit.includes('any'));
}

/** Pick `count` patterns of different mechanisms, stable for the same topic. */
export function pickPatterns(topic,{kind='any',count=3}={}){
  const pool=patternsFor(kind), start=hash(topic)%pool.length, out=[], seen=new Set();
  for(let i=0;i<pool.length&&out.length<count;i++){
    const p=pool[(start+i*5)%pool.length];
    if(!seen.has(p.mechanism)){seen.add(p.mechanism); out.push(p);}
  }
  for(let i=0;i<pool.length&&out.length<count;i++){
    const p=pool[(start+i)%pool.length];
    if(!out.includes(p)) out.push(p);
  }
  return out;
}

/** Short planner text: hook ideas to adapt, never to copy, with the truth rule. */
export function hookGuidance(topic,{foodProcess=false,count=3}={}){
  const picks=pickPatterns(topic,{kind:foodProcess?'food':'any',count});
  const lines=picks.map(p=>`${p.mechanism}: "${p.spoken}"`).join('; ');
  return `Hook patterns to adapt to this exact subject (do not copy the braces or the wording): ${lines}. The first frame must work muted, show one visible action, and promise only what the film delivers.`;
}
