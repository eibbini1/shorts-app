import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chapters } from './agent-explainer-content.mjs';
import { writeSfxWav } from '../src/media/assemble/sfx.ts';

const dir = 'storage/episodes/build-ai-agent';
const takes = JSON.parse(await readFile(dir + '/narration.json', 'utf8'));
const width = 1920, height = 1080;
const paper = '#F6EDDC', ink = '#28251F', cream = '#FFFAEE', rust = '#A84633', green = '#327356';
const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf', 'Poppins');
function box(x,y,w,h,r,fill,stroke) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}
}
function text(s,x,y,size,color=ink) {
  ctx.font=`${size}px Poppins`;ctx.fillStyle=color;ctx.fillText(s,x,y);
}
function line(x,y,xx,yy,color=ink,w=3) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle=color;ctx.lineWidth=w;ctx.stroke();
}
function circle(x,y,r,color) {
  ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
}
function presenter(active) {
  box(88,748,205,149,42,'#253C51',ink);
  circle(191,725,56,'#673C2B');circle(191,718,47,'#DAA584');
  box(149,670,84,23,10,'#673C2B');circle(175,715,4,ink);circle(208,715,4,ink);
  box(169,737,45,15,7,'#673C2B');line(191,791,191,861,'#FAE7D0',5);
  if(active){line(270,813,319,767,'#253C51',24);circle(321,764,11,'#DAA584');}
}
const labels = ['Intro','Job','Tools','Loop','Demo','Approval','Testing','Build'];
const evidence = [
  ['“Can you replace it by Friday?”','A request still needs facts.'],
  ['Missing order ID? Ask for it.','Unclear policy? Route to review.'],
  ['find_order(order_id)','get_policy(topic)'],
  ['MAX 3 TOOL CALLS','On timeout, stop and hand off'],
  ['DEMO POLICY · photo required','REPLY · ask for a photo'],
  ['Approve the exact action','Application enforces the gate'],
  ['Check the trace after each run','An email cannot grant permissions'],
  ['Start on fictional tickets','Improve one failure at a time'],
];
function draw(index, phase) {
  const [eyebrow,title,steps] = chapters[index];
  ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);
  for(let x=26;x<width;x+=39) for(let y=22;y<height;y+=39) circle(x,y,1.1,'#E3D6C0');
  box(65,44,1790,72,28,ink);
  labels.forEach((label,i)=>{
    const x=85+i*219;
    if(i===index)box(x,55,203,50,21,rust);
    text(label,x+22,89,25,i===index?cream:'#DFD4C0');
  });
  text(eyebrow,92,202,28,rust);
  text(title,88,303,64);
  box(365,380,1460,490,27,cream,'#C9B89E');
  steps.forEach((step,i)=>{
    const x=410+i*464,y=443;
    const active=i<=phase;
    box(x+7,y+8,410,134,19,'#DFD2BC');
    box(x,y,410,134,19,active?(i===2?'#DCEBDE':'#F4D6C5'):'#F3EBDD',ink);
    circle(x+46,y+40,17,active?(i===2?green:rust):'#A0927E');
    text(String(i+1),x+41,y+46,17,cream);text(step,x+21,y+102,25);
    if(i<2){line(x+415,y+65,x+457,y+65,rust,4);line(x+447,y+58,x+457,y+65,rust,4);line(x+447,y+72,x+457,y+65,rust,4);}
  });
  box(411,642,1359,168,17,'#F3EADB', '#D1C1A9');
  text(phase<2?'WORKING EXAMPLE':'WHAT TO CHECK',439,692,23,rust);
  text(evidence[index][phase<2?0:1],439,764,38);
  presenter(phase>0);
  text('WORKLESS AI',94,938,24,rust);
  line(367,899,1819,899,'#CABB9F',2);
}
function ff(args) { execFileSync('ffmpeg',['-y','-v','error','-filter_threads','1',...args],{stdio:'inherit'}); }
function stamp(seconds) {
  const cs=Math.round(seconds*100);
  return `${Math.floor(cs/360000)}:${String(Math.floor(cs/6000)%60).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;
}
const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Poppins,45,&H00FFF8E9,&H00FFF8E9,&H001F2528,&H001F2528,-1,0,0,0,100,100,0,0,3,15,0,2,30,30,74,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const cues = [], segments = [], captions = [];
const rawDuration = takes.reduce((sum,take)=>sum+take.durationSec,0);
const tempo = rawDuration / 265;
let cursor = 0;
for (const [i,take] of takes.entries()) {
  const frameCount = Math.ceil((take.durationSec/tempo+.45)*24);
  const duration = frameCount/24;
  const cuts = [0, Math.round(frameCount*.31), Math.round(frameCount*.65), frameCount];
  for(let phase=0;phase<3;phase++) {
    draw(i,phase);
    const stem=`${dir}/scene-${i}-${phase}`;
    await writeFile(stem+'.png',canvas.toBuffer('image/png'));
    const frames=cuts[phase+1]-cuts[phase];
    const filter = phase===0 && i>0 ? 'fade=t=in:d=0.23:color=0xF6EDDC' : 'null';
    ff(['-loop','1','-framerate','24','-i',stem+'.png','-vf',filter,'-frames:v',String(frames),'-an','-c:v','libx264','-threads','2','-preset','ultrafast','-crf','17','-pix_fmt','yuv420p',stem+'.mp4']);
    segments.push(stem.split('/').at(-1)+'.mp4');
    cues.push({t:cursor+cuts[phase]/24+.035,kind:phase===0&&i>0?'whoosh':'pop',freq:phase===2?780:570,gain:phase===0?.11:.065});
  }
  const words=take.words;
  for(let w=0;w<words.length;) {
    const chunk=[];
    do {chunk.push(words[w++]);} while(w<words.length&&chunk.length<4&&!/[.!?,]$/.test(chunk.at(-1).word));
    const start=cursor+.1+chunk[0].start/tempo;
    const end=Math.min(cursor+duration,cursor+.1+(words[w]?.start??chunk.at(-1).end+.17)/tempo);
    if(end>start) captions.push(`Dialogue: 0,${stamp(start)},${stamp(end)},Caption,,0,0,0,,${chunk.map(word=>word.word).join(' ')}`);
  }
  ff(['-i',take.audioFile,'-af',`atempo=${tempo},aresample=48000,adelay=100:all=1,apad,atrim=duration=${duration}`,'-c:a','pcm_s16le',`${dir}/narration-${i}.wav`]);
  cursor+=duration;
  console.log('Rendered chapter',i+1);
}
await writeFile(dir+'/video.txt',segments.map(file=>"file '"+file+"'").join('\n'));
await writeFile(dir+'/audio.txt',takes.map((_,i)=>"file 'narration-"+i+".wav'").join('\n'));
await writeFile(dir+'/captions.ass',header+captions.join('\n')+'\n');
await writeSfxWav(dir+'/effects.wav',cues,cursor);
ff(['-f','concat','-safe','0','-i',dir+'/video.txt','-f','concat','-safe','0','-i',dir+'/audio.txt','-i',dir+'/effects.wav','-filter_complex_threads','1','-filter_complex',`[0:v]ass=${dir}/captions.ass:fontsdir=assets/fonts[v];[1:a][2:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,'-map','[v]','-map','[a]','-t',String(cursor),'-c:v','libx264','-threads','3','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',dir+'/How-to-Build-Your-First-AI-Agent.mp4']);
console.log('Finished', cursor, 'seconds');
