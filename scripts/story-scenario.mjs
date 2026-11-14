// Build an exact, reviewable story arc with local Ollama before any media rendering.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseArgs} from 'node:util';
import {z} from 'zod';
import {scenarioSettings, verifyScenario} from './scenario-schema.mjs';

const args=parseArgs({allowPositionals:true,options:{style:{type:'string',default:'cinematic'},ending:{type:'string',default:''},title:{type:'string',default:''},format:{type:'string',default:'short'},seconds:{type:'string',default:'30'},model:{type:'string',default:'qwen3:1.7b'}}});
const execFileAsync=promisify(execFile);
const [topic,id]=args.positionals;
if (!topic?.trim() || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id??'')) throw new Error('Usage: node scripts/story-scenario.mjs "subject" draft-id [--style ...] [--ending ...] [--seconds 30]');
const foodProcess=/\b(cook|cooking|sear|toast|assemble|bake|baking|food|hot dog|burger|scallop|steak|pizza|chocolate|pastry|dessert)\b/i.test(topic);
const hotDog=/\bhot[ -]?dog\b/i.test(topic);
const prehistoricCars=/\b(flin(?:t)?ston(?:e)?s?|stone[ -]?age|caveman|prehistoric)\b/i.test(topic) && /\b(cars?|vehicles?|racing)\b/i.test(topic);
const subjectRules=prehistoricCars?
  'The user wants playful prehistoric cartoon cars: handmade stone-and-wood vehicles, stone wheels, foot-powered movement, expressive rounded characters and physical comedy. Keep the story inside this primitive cartoon world. Never introduce a real car make or model, combustion engine, carburetor, fuel, GPS, asphalt race track or modern repair manual.':
  `The exact requested subject is "${topic}". Preserve its defining nouns, era, species, medium and visual premise throughout the outline and every shot. Do not substitute a realistic or unrelated subject. ${hotDog?'The hot dog must keep one long cylindrical frankfurter and one elongated split-top brioche hot-dog bun in every food shot: never a round roll, burger patty, meatball, or multiple sausages.':''}`;
const forbiddenModern=/\b(fairlane|ford|chevrolet|ferrari|engine|carburetor|gasoline|petrol|fuel|gps|dashboard|asphalt|spark plug|exhaust|gearbox|piston|horsepower|repair manual)\b/i;
function subjectIssue(value){return prehistoricCars && forbiddenModern.test(value);}
const settings=scenarioSettings({brand:'Local Studio',format:args.values.format,seconds:args.values.seconds});
if (settings.seconds>60) throw new Error('Local story builder supports up to 60 seconds');
const model=args.values.model;
if (model.endsWith(':cloud')) throw new Error('Use an installed local Ollama model');
const base='http://127.0.0.1:11434';
let gemmaPath;
if(model==='gemma-local'){
  gemmaPath=(await readFile('storage/setup/gemma-model-dir.txt','utf8')).trim();
  if(!gemmaPath) throw new Error('Local Gemma model pointer is empty');
}else{
  const tags=await fetch(base+'/api/tags',{signal:AbortSignal.timeout(5000)});
  if (!tags.ok) throw new Error('Local Ollama is unavailable');
  if (!(await tags.json()).models?.some(item=>item.name===model || item.model===model)) throw new Error(`Local model is not installed: ${model}`);
}
const topicTerms=new Set((topic.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(word=>!['same','with','into','that','this','through','original','moving','kitchen'].includes(word)));
let reviewedShotExamples=[];
try{
  const records=(await readFile('storage/learning/shot-reviews.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line));
  reviewedShotExamples=records.filter(row=>row.approvedForReuse && Object.values(row.scores||{}).every(score=>score>=4) &&
    (row.subject.toLowerCase().match(/[a-z]{4,}/g)||[]).some(word=>topicTerms.has(word)))
    .slice(-2).map(row=>({subject:row.subject,successfulMotion:row.motionPrompt.slice(0,220),lesson:row.notes.slice(0,180)}));
}catch{}
const line=z.string().trim().min(1).max(1000);
const outlineSchema=z.object({ideas:z.array(z.object({title:line,angle:line})).length(5),title:line,hook:line,payoff:line,protagonist:line,setting:line,goal:line,obstacle:line,turn:line,visualBible:line});
const shotSchema=z.object({narration:line,imagePrompt:line,motionPrompt:line,sound:line});
async function ask(schema,system,payload){
  let last;
  for(let attempt=1;attempt<=2;attempt++){
    let raw;
    try{
      if(model==='gemma-local'){
        const shape=schema===outlineSchema?
          'Return one JSON object with exactly these keys: ideas (array of five objects, each with title and angle strings), title, hook, payoff, protagonist, setting, goal, obstacle, turn, visualBible (all strings). Keep each string under 250 characters.':
          'Return one JSON object with exactly four string keys: narration, imagePrompt, motionPrompt, sound.';
        const instruction=`${system} ${shape} Output only the answer JSON object, not a JSON schema, example, Markdown fence or explanation.`;
        const {stdout}=await execFileAsync('storage/tools/ltx-2-mlx/.venv/bin/mlx_lm.generate',[
          '--model',gemmaPath,'--system-prompt',instruction,'--prompt',JSON.stringify(payload),
          '--max-tokens',schema===outlineSchema?'1200':'1800','--temp','0.35','--verbose','false'],
          {timeout:600000,maxBuffer:8*1024*1024});
        raw=stdout;
      }else{
        const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(240000),body:JSON.stringify({model,stream:false,think:false,format:z.toJSONSchema(schema),options:{temperature:0.45,num_predict:3000,num_ctx:8192},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}]})});
        if(!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
        raw=(await response.json()).message?.content;
      }
      if(typeof raw!=='string') throw new Error('Local model returned no text');
      const body=raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1);
      return schema.parse(JSON.parse(body));
    }catch(error){
      last=error;
      if(model==='gemma-local' && error.code!==undefined){
        const reason=/No Metal device available/i.test(error.stderr||'')?'Metal GPU unavailable to this shell':'local Gemma process exited with an error';
        throw new Error(`${reason}. Run from a Mac Terminal with GPU access; no model retry was attempted.`);
      }
      console.error(`Story draft attempt ${attempt} failed: ${error.message}`);
      if(model==='gemma-local' && raw) console.error('Model response start:',raw.slice(0,350).replace(/\s+/g,' '));
    }
  }
  throw last;
}
const count=Math.max(2,Math.ceil(settings.seconds/5));
const baseSeconds=Math.floor(settings.seconds/count);
const durations=Array.from({length:count},(_,i)=>baseSeconds+(i<settings.seconds%count?1:0));
const core=['Hook','Setup','Goal','Approach','Obstacle','Reaction','New plan','Start new plan','Progress','Final approach','Payoff','Closing image'];
const selected=count===2?['Hook and goal','Payoff and closing image']:
  count===6?(foodProcess?['Hook','Preparation','Heat','Build','Finish','Payoff']:['Hook','Goal','Obstacle','New plan','Action','Payoff']):
  Array.from({length:count},(_,i)=>core[Math.round(i*(core.length-1)/(count-1))]);
const beats=selected.map((label,i)=>({number:i+1,label,seconds:durations[i]}));
const outlineInstruction=`You are a visual story editor. ${subjectRules} Develop one concrete, filmable story from the user's subject. The title must describe the subject or visible payoff, and the hook must start the same story. Pick a specific protagonist or focal object, one setting, a visible goal, a physical obstacle that temporarily prevents the goal, a change of approach, and a satisfying visible outcome. ${foodProcess?'For a cooking transformation, make the obstacle a real texture or heat constraint and resolve it through visible cooking technique; never invent a disaster or unrelated mission. The six beats are hook, preparation, heat, build, finish, and payoff.':''} If the user gives an ending, the goal and payoff MUST directly be that ending. Do not invent another mission, destination or unrelated stakes. The requested ending is success, never the obstacle. The turn must visibly solve the obstacle, and the payoff must answer the opening. Avoid vague metaphors, repeated beauty shots, fabricated facts, and unsupported claims. Keep one consistent subject, lighting progression, props and location. Write compact JSON fields only.`;
const anchorWords=new Set((args.values.ending.toLowerCase().match(/[a-z]{5,}/g)||[]).filter(word=>!['after','around','before','driver','takes','taking','reaches','reach','along','while','through','there','their','where','which','empty','small','safe','sunrise','sunset','morning','night'].includes(word)));
function endingMatches(goal){
  if(!anchorWords.size) return true;
  const words=goal.toLowerCase().match(/[a-z]{5,}/g)||[];
  return [...anchorWords].filter(word=>words.some(value=>value.slice(0,5)===word.slice(0,5))).length >= Math.min(2,anchorWords.size);
}
function goalSupportsEnding(goal){
  if(!anchorWords.size) return true;
  const words=goal.toLowerCase().match(/[a-z]{5,}/g)||[];
  return [...anchorWords].some(word=>words.some(value=>value.slice(0,5)===word.slice(0,5)));
}
let outline;
let endingLocked=false;
for(let attempt=1;attempt<=2;attempt++){
  outline=await ask(outlineSchema,outlineInstruction,
    {topic,style:args.values.style,requestedTitle:args.values.title||undefined,requestedEnding:args.values.ending||'Choose a concrete satisfying ending',seconds:settings.seconds,
      correction:attempt>1?`Your prior outline violated this requirement: ${subjectRules} Keep the requested ending as the literal goal and payoff when one was supplied.`:undefined});
  const storyText=[outline.title,outline.hook,outline.payoff,outline.protagonist,outline.setting,outline.goal,outline.obstacle,outline.turn,outline.visualBible].join(' ');
  const subjectMiss=subjectIssue(storyText) || (prehistoricCars && !/\b(stone|wood|prehistoric|caveman|foot-powered|foot powered)\b/i.test(storyText));
  if(!subjectMiss){
    if(args.values.ending && !goalSupportsEnding(outline.goal)){
      outline.goal=args.values.ending;
      console.log('Locked the story goal to the requested visible ending');
    }
    break;
  }
  console.log('Rewriting an outline that missed the requested subject');
  if(attempt===2) throw new Error('The local model did not keep the requested subject. No video render was started. Try a more specific prompt or another local story model.');
}
if(args.values.ending && !endingMatches(outline.payoff)){
  outline.payoff=args.values.ending;
  endingLocked=true;
  console.log('Locked the final payoff to the exact ending you requested');
}
if(args.values.title) outline.title=args.values.title;
console.log(`Story spine: ${outline.goal} → ${outline.obstacle} → ${outline.turn} → ${outline.payoff}`);
const shots=[];
const normalize=text=>text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function similar(a,b,threshold){
  const left=new Set(normalize(a).split(' ')), right=new Set(normalize(b).split(' '));
  return [...left].filter(word=>right.has(word)).length / new Set([...left,...right]).size >= threshold;
}
let rewriteCount=0;
let fallbackCount=0;
const seenImages=[];
const seenMotion=[];
const seenNarration=[];
function beatAction(beat){
  const label=beat.label.toLowerCase();
  if(label==='preparation') return `${outline.protagonist} is prepared by hand in ${outline.setting}, before the heat or final assembly`;
  if(label==='heat') return `${outline.protagonist} visibly browns or cooks with heat in ${outline.setting}`;
  if(label==='build') return `${outline.protagonist} is assembled with one distinct ingredient, still unfinished`;
  if(label==='finish') return `${outline.protagonist} receives its final deliberate garnish or sauce, before the requested ending`;
  if(label.includes('payoff') && label.includes('closing')) return `${outline.protagonist} visibly achieves ${outline.goal}; the camera pulls back to reveal the final resolved scene in ${outline.setting}`;
  if(label.includes('closing')) return `${outline.protagonist} pauses after the result; a wide camera pullback reveals the resolved scene in ${outline.setting}`;
  if(label==='final approach') return `${outline.protagonist} comes close to ${outline.goal} without reaching it yet`;
  if(label==='progress') return `${outline.protagonist} makes visible progress using ${outline.turn}`;
  if(label==='start new plan') return `${outline.protagonist} begins carrying out ${outline.turn}`;
  if(label==='reaction') return `${outline.protagonist} reacts to ${outline.obstacle} before finding a solution`;
  if(label==='approach') return `${outline.protagonist} follows the original plan toward ${outline.goal}`;
  if(label.includes('turn') && label.includes('payoff')) return `${outline.protagonist} uses ${outline.turn} to achieve ${outline.goal}`;
  if(label.includes('payoff')) return `${outline.protagonist} visibly achieves this goal: ${outline.goal}`;
  if(label.includes('turn')) return `${outline.protagonist} changes approach: ${outline.turn}`;
  if(label.includes('setback') || label.includes('complication')) return `The physical obstacle blocks progress: ${outline.obstacle}`;
  if(label.includes('obstacle')) return `The physical obstacle blocks progress: ${outline.obstacle}`;
  if(label.includes('new plan')) return `${outline.protagonist} visibly discovers a way around the obstacle: ${outline.turn}`;
  if(label.includes('action')) return `${outline.protagonist} puts the new plan into motion toward ${outline.goal}`;
  if(label.includes('attempt')) return `${outline.protagonist} takes the first visible step toward ${outline.goal}`;
  if(label.includes('goal')) return `${outline.protagonist} prepares to achieve ${outline.goal}`;
  if(label.includes('setup')) return `Establish ${outline.protagonist} in ${outline.setting}`;
  return `Show a striking visible clue to the goal: ${outline.goal}`;
}
function beatDirective(beat){
  const label=beat.label.toLowerCase();
  if(label==='preparation') return 'Show hands preparing the same focal food or vessel before heat. One physical action, not a finished dish.';
  if(label==='heat') return 'Show a distinct visible change from heat: sear, toast, steam, or bubbling. Keep the same focal food and kitchen; do not plate or garnish yet.';
  if(label==='build') return 'Show the same food being assembled with one ingredient or carefully moved to its serving vessel. Do not add the final garnish or show a bite.';
  if(label==='finish') return 'Show one final topping, sauce, or garnish visibly added to the same food. Keep the bite or service for the payoff shot.';
  if(label.includes('payoff')) return `Show the requested ending physically achieved: ${args.values.ending||outline.payoff}. Do not show another journey or obstacle.`;
  if(label.includes('closing')) return `Show a calm resolved image after ${outline.payoff}.`;
  if(label==='final approach') return `Show ${outline.protagonist} very near ${outline.goal}, still moving toward it. Do not show success, arrival, serving, completion or the final view yet.`;
  if(label==='progress') return `Show visible progress from ${outline.turn}, in a different place or action from the prior shot. The goal is not yet reached.`;
  if(label==='start new plan'||label==='action') return `Show ${outline.protagonist} beginning to carry out ${outline.turn}. Do not show arrival or success yet.`;
  if(label==='new plan') return `Show ${outline.protagonist} visibly discovering or choosing ${outline.turn}. Do not perform it yet.`;
  if(label==='reaction') return `Show ${outline.protagonist} reacting physically to ${outline.obstacle}; do not solve it yet.`;
  if(label.includes('obstacle')||label.includes('complication')||label.includes('setback')) return `Show ${outline.obstacle} physically blocking progress. The goal is not reached yet.`;
  if(label==='approach'||label.includes('attempt')) return `Show ${outline.protagonist} approaching ${outline.goal} by the ORIGINAL plan, before ${outline.obstacle} appears. Do not use the alternative route or solution yet.`;
  if(label.includes('turn')||label.includes('adaptation')) return `Show ${outline.protagonist} visibly finding or choosing the solution: ${outline.turn}. Do not show arrival yet.`;
  if(label.includes('goal')) return `Show a concrete visible clue to ${outline.goal}, before the obstacle or payoff.`;
  if(label.includes('setup')) return `Establish ${outline.protagonist} and ${outline.setting} before the obstacle.`;
  return `Open on an immediate physical action involving ${outline.protagonist} and a visual clue to ${outline.goal}. Do not show the payoff yet.`;
}
function fallbackNarration(beat){
  const label=beat.label.toLowerCase();
  const goal=outline.goal.replace(/^to\s+/i,'').replace(/[.!?]+$/,'');
  const obstacle=outline.obstacle.replace(/[.!?]+$/,'');
  const protagonist=outline.protagonist.replace(/[.!?]+$/,'');
  if(label==='preparation') return `First, the chef prepares ${protagonist}.`;
  if(label==='heat') return `Heat transforms ${protagonist} in the pan.`;
  if(label==='build') return `The dish comes together, one layer at a time.`;
  if(label==='finish') return `One final touch completes the dish.`;
  if(label.includes('closing')||label.includes('payoff')) return `And at last, ${goal}.`;
  if(label==='final approach') return `The destination is finally close.`;
  if(label==='progress') return `The new path begins to work.`;
  if(label==='start new plan') return `${protagonist} takes the safer way forward.`;
  if(label==='reaction') return `For a moment, everything stops.`;
  if(label==='approach') return `${protagonist} follows the original plan.`;
  if(label.includes('turn')) return `A new approach changes everything.`;
  if(label.includes('setback')||label.includes('complication')||label.includes('obstacle')) return `${obstacle} blocks the way.`;
  if(label.includes('new plan')) return `A safer new plan takes shape.`;
  if(label.includes('action')||label.includes('attempt')) return `${protagonist} puts the plan into motion.`;
  if(label.includes('goal')) return `The goal: ${goal}.`;
  return `One journey leads toward ${goal}.`;
}
function shortenNarration(text,seconds){
  const limit=Math.ceil(seconds*2.5);
  const words=text.trim().split(/\s+/);
  if(words.length<=limit) return text;
  const sentences=text.match(/[^.!?]+[.!?]?/g)?.map(item=>item.trim())??[];
  const fit=sentences.find(sentence=>sentence.split(/\s+/).length<=limit);
  return fit || words.slice(0,limit).join(' ').replace(/[,;:]+$/,'')+'.';
}
for(let i=0;i<count;i++){
  const beat=beats[i];
  let shot;
  let issues=[];
  for(let attempt=1;attempt<=2;attempt++){
    shot=await ask(shotSchema,
      `Write ONE shot for ONE specific story beat. ${subjectRules} Follow the beat directive literally. Keep the same subject, location, props and lighting progression from the outline. Do not include any event assigned to a later beat. The imagePrompt depicts the START of one distinct physical event, not its finished result. The motionPrompt must name the subject and describe a physical start, visible action and changed end state; include one camera move tracking that action in a single continuous take. No camera-only pans or zooms over a static pose, no cut or montage. Narration is one specific sentence, about four to ten words for a five-second shot. No unsupported facts or generic mood-only phrases. Sound names one localized effect synchronized with the action; for food use cues such as sizzle, slice, pour, crunch or utensil clink when physically appropriate. Output only JSON.`,
      {topic,style:args.values.style,outline,beat,directive:beatDirective(beat),reviewedShotExamples,previousShots:shots.map((item,j)=>({beat:beats[j].label,imagePrompt:item.imagePrompt,motionPrompt:item.motionPrompt})),
        correction:attempt>1?`The last answer repeated a scene, included a cut, changed the subject, or had unsuitable narration. ${subjectRules} Make this beat visibly distinct and speakable.`:undefined});
    const words=shot.narration.split(/\s+/).length;
    issues=[];
    if(subjectIssue(Object.values(shot).join(' '))) issues.push('subject');
    if(seenImages.some(value=>similar(value,shot.imagePrompt,0.85))) issues.push('image');
    if(seenMotion.some(value=>similar(value,shot.motionPrompt,0.85))||/\b(cut to|quick cut|montage|transition to)\b/i.test(shot.motionPrompt)) issues.push('motion');
    if(seenNarration.some(value=>similar(value,shot.narration,0.85))||words>Math.ceil(beat.seconds*2.5)||
       words<Math.max(3,Math.floor(beat.seconds*0.8))) issues.push('narration');
    if(!issues.length) break;
    rewriteCount++;
    if(attempt===2){
      if(issues.includes('subject')) throw new Error(`Beat ${i+1} changed the requested subject. No scenario was saved or rendered.`);
      console.log(`Repairing ${issues.join(', ')} in beat ${i+1}; review it closely`);
      fallbackCount+=issues.length;
      break;
    }
    console.log(`Rewriting beat ${i+1} (${issues.join(', ')}) before saving`);
  }
  const action=beatAction(beat);
  const narration=issues.includes('narration')?fallbackNarration(beat):shot.narration;
  let image=issues.includes('image')?`${action}. Same ${outline.protagonist} in ${outline.setting}. ${args.values.style}.`:
    `${shot.imagePrompt}${/consistent subject/i.test(shot.imagePrompt)?'':` Consistent subject: ${outline.protagonist.replace(/[.!?]+$/,'')}.`} Visual style: ${args.values.style}.`;
  let motion=issues.includes('motion')?`${action}. One continuous shot. The subject moves visibly while the camera tracks the action.`:
    `${shot.motionPrompt}${/one continuous take|no cuts/i.test(shot.motionPrompt)?'':' One continuous take, no cuts.'}`;
  if(i<count-2 && !['build','finish'].includes(beat.label.toLowerCase()) && /\b(pan|sear|bast|cook)\b/i.test(image) && /\b(plate|serv)\w*/i.test(outline.goal+' '+outline.payoff)){
    image+=' Cooking stage: keep this food inside the same pan, with no serving plate or finished plated dish visible yet.';
    motion+=' Keep the food in the pan for the whole take; plating occurs in a later shot.';
  }
  if(hotDog){
    const stage=beat.label.toLowerCase();
    if(stage==='preparation') image+=' Show only one elongated split-top hot-dog bun, laid lengthwise across the frame; no sausage or round bread roll is visible yet.';
    else if(stage==='hook'||stage==='heat') image+=' Show only one long cylindrical sausage in the pan, not a round patty, meatball, or second sausage; no bun in frame yet.';
    else image+=' Show one long cylindrical sausage inside one elongated split-top hot-dog bun, laid diagonally across the frame; never a round roll or burger patty.';
    motion+=' Preserve the same long cylindrical sausage and elongated bun only when that stage includes them; no shape change or extra sausage.';
  }
  if(!prehistoricCars && (hotDog || /\b(kitchen|chef|pan|sausage|dish|food|chocolate|steak|pizza|cheese|scallop)\b/i.test(`${topic} ${outline.setting}`))){
    image+=' Continuity: one chef, one white-gloved hand, same copper pan and black slate, warm tungsten light.';
  }
  shots.push({seconds:beat.seconds,narration:shortenNarration(narration,beat.seconds),
    imagePrompt:image.slice(0,1000),motionPrompt:motion.slice(0,1000),sound:shot.sound});
  seenImages.push(issues.includes('image')?image:shot.imagePrompt);
  seenMotion.push(issues.includes('motion')?motion:shot.motionPrompt);
  seenNarration.push(narration);
  console.log(`Drafted story beat ${i+1}/${count}: ${beat.label}`);
}
for(const field of ['imagePrompt','motionPrompt']){
  const values=shots.map(shot=>normalize(shot[field]));
  if(new Set(values).size!==values.length) throw new Error(`Repeated ${field}; rerun the draft with a more specific idea or ending`);
}
const overlong=shots.flatMap((shot,i)=>shot.narration.split(/\s+/).length>Math.ceil(shot.seconds*2.5)?[i+1]:[]);
if(overlong.length) throw new Error(`Narration too long in shots ${overlong.join(', ')}; rerun with a more specific ending`);
const plan={ideas:outline.ideas,title:outline.title,hook:outline.hook,payoff:outline.payoff,shots,claimsToCheck:[]};
verifyScenario(plan,settings);
const saved={status:'review-required',settings,model,topic,style:args.values.style,requestedEnding:args.values.ending||null,totalSeconds:settings.seconds,storyArc:{protagonist:outline.protagonist,setting:outline.setting,goal:outline.goal,obstacle:outline.obstacle,turn:outline.turn,visualBible:outline.visualBible,beats},qualityChecks:{exactTiming:true,uniquePromptText:true,narrationFits:true,endingLockedFromUser:endingLocked,rewrites:rewriteCount,fieldsNeedingRepair:fallbackCount,reviewedShotExamplesUsed:reviewedShotExamples.length},plan};
await mkdir('drafts/generated',{recursive:true});
const file=`drafts/generated/${id}.local-scenario.json`;
await writeFile(file,JSON.stringify(saved,null,2)+'\n',{flag:'wx'});
console.log(`Saved full story draft: ${file}`);
