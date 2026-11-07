import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { synthesize } from '../src/media/voice/VoiceProvider.ts';
import { writeSfxWav } from '../src/media/assemble/sfx.ts';

const dir = 'storage/episodes/claude-youtube-skill';
await mkdir(dir, { recursive: true });
const scenes = [
  ['ONE MESSY IDEA', 'THREE READY DRAFTS', ['TITLE', 'DESCRIPTION', 'THUMBNAIL'], 'Give Claude one messy video idea. Get three drafts back: a title, a description, and a thumbnail hook.'],
  ['THE TRICK?', 'TEACH IT ONCE', ['SKILL.md', 'YOUR PUBLISHING CHECKLIST'], 'The trick is a custom skill. This little file tells Claude exactly what to produce every time you bring it a new video idea.'],
  ['INSTALL ONCE', 'UPLOAD THE ZIP', ['Customize > Skills', '+ > Create skill', 'Upload a skill > Select ZIP'], 'Drop the ZIP into Claude’s skill uploader and turn it on. The path is on screen. Now give it something messy.'],
  ['THE INPUT', 'ONE ROUGH IDEA', ['Use YouTube Publish Kit for:', '“Find hidden fees in quotes.”'], 'My whole idea is this: find hidden fees in quotes. Here is what the publishing kit could turn it into.'],
  ['THE PAYOFF', 'A KIT YOU CAN REUSE', ['How to Spot Hidden Fees', 'Compare setup fees before you buy.', 'THE HIDDEN FEE'], 'How to spot hidden fees. A description about comparing setup fees. And the thumbnail hook: the hidden fee. Next video, same skill.'],
];
const frames = [144, 168, 144, 144, 240];
const voice = { provider: 'elevenlabs', speed: 1, stability: .53, style: .22 };
const takes = [];
for (const scene of scenes) takes.push(await synthesize(scene[3], dir + '/voice', voice));
const ff = args => execFileSync('ffmpeg', ['-y','-v','error','-filter_threads','1',...args], {stdio:'inherit'});
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf', 'Poppins');
const canvas = createCanvas(720, 1280), ctx = canvas.getContext('2d');
ctx.scale(2/3,2/3);
const paper = '#F5ECDA', ink = '#21231E', lime = '#D8FA61', rust = '#A73F2E';
function box(x,y,w,h,color,r=22) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}
function label(text,x,y,size,color=ink) {
  ctx.font=`${size}px Poppins`; ctx.fillStyle=color; ctx.fillText(text,x,y);
}
const list = [], captionLines = [];
let cursor = 0;
function stamp(s) {
  const c=Math.round(s*100);
  return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`;
}
const colors=['#F4A56F','#CAB8FF','#D8FA61'];
const ease=t=>1-(1-Math.max(0,Math.min(t,1)))**3;
function icon(kind,x,y,color) {
  box(x,y,112,102,color,20);
  if(kind===2) {
    ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(x+44,y+27);ctx.lineTo(x+79,y+51);ctx.lineTo(x+44,y+76);ctx.closePath();ctx.fill();
  } else {
    for(let n=0;n<(kind===0?2:3);n++)box(x+24,y+27+n*21,65-n*9,8,ink,3);
  }
}
function draw(i,title,subtitle,rows,t,duration) {
  box(0,0,1080,1920,paper,0);
  ctx.fillStyle='#DFD4BE';
  for(let x=37;x<1080;x+=45)for(let y=40;y<1920;y+=45)ctx.fillRect(x,y,2,2);
  box(68,95,944,78,ink,36);
  label('WORKLESS AI',103,147,30,paper);
  label(`CLAUDE SKILLS  0${i+1}/05`,595,147,26,lime);
  label(title,76,360,68);
  box(70,404,943,112,lime,13);
  label(subtitle,93,479,57);
  if(i===0) {
    const tilt=Math.sin(t*3)*.035;
    ctx.save();ctx.translate(530,795);ctx.rotate(tilt);
    box(-330,-125,660,250,'#FFD58F',26);
    label('ROUGH NOTE',-277,-53,33,rust);
    label('Find hidden fees',-277,28,58);
    label('in quotes?',-277,90,58);ctx.restore();
    rows.forEach((row,j)=>{
      const x=72+j*305,y=1080+95*(1-ease((t-.18-j*.17)/.5));
      box(x,y,280,230,ink,24);icon(j,x+84,y+30,colors[j]);label(row,x+20,y+190,26,paper);
    });
  } else if(i===1) {
    const lift=22*Math.sin(t*2.4);
    box(205,706+lift,660,486,'#D8C9AA',32);
    box(177,678+lift,660,486,'#FFF9ED',32);
    icon(1,231,739+lift,colors[0]);
    label('SKILL.md',231,927+lift,87);
    label('Your publishing checklist',231,1010+lift,38,rust);
    for(let n=0;n<3;n++)box(232,1050+lift+n*23,250+n*62,9,'#D5C7B0',4);
  } else if(i===2) {
    box(73,635,932,686,ink,35);
    label('CLAUDE · MENU ILLUSTRATION',110,706,29,lime);
    rows.forEach((row,j)=>{
      const active=j===Math.min(2,Math.floor(t/1.25));
      box(110,758+j*126,853,97,active?lime:'#424339',16);
      label(row,140,821+j*126,39,active?ink:paper);
    });
    label('youtube-publish-kit.zip',140,1210,35,paper);
    label('Enable code execution and turn the skill on.',90,1380,30,rust);
  } else if(i===3) {
    box(75,669,930,524,'#FFF9ED',30);
    box(120,725,820,98,ink,20);
    label('Use YouTube Publish Kit for:',152,789,42,paper);
    const idea='Find hidden fees in quotes.';
    const n=Math.min(idea.length,Math.floor(t*15));
    label(idea.slice(0,n),122,969,53);
    if(t%1<.55&&n<idea.length)box(124+ctx.measureText(idea.slice(0,n)).width,918,8,64,rust,2);
    box(783,1046,116,88,lime,20);label('GO',811,1104,37);
  } else {
    rows.forEach((row,j)=>{
      const p=ease((t-j*.38)/.43);
      const x=82+920*(1-p),y=623+j*230;
      box(x,y,920,195,j===2?ink:'#FFF9ED',24);
      icon(j,x+30,y+42,colors[j]);
      label(['TITLE','DESCRIPTION','THUMBNAIL'][j],x+173,y+59,26,j===2?lime:rust);
      label(row,x+173,y+128,j===1?34:49,j===2?paper:ink);
    });
    label('EXAMPLE OUTPUT',90,1363,27,rust);
  }
  box(85,1648,910,9,'#C6BDA8',4);box(85,1648,910*(i+t/duration)/5,9,rust,4);
  if(i&&t<.19){const edge=1080*ease(t/.19);box(edge,0,1080-edge,1920,ink,0);box(edge,0,22,1920,lime,0);}
}
const cues=[];
for (const [i,[title,subtitle,rows]] of scenes.entries()) {
  const name='scene-'+i;
  const duration=frames[i]/24, take=takes[i], tempo=take.durationSec/(duration-.18);
  if(tempo<.5||tempo>2)throw Error('Narration timing out of range for scene '+i+': '+tempo);
  for(let j=0;j<take.words.length;j+=5){
    const group=take.words.slice(j,j+5);
    const start=cursor+.05+group[0].start/tempo;
    const end=Math.min(cursor+duration,cursor+.05+(take.words[j+5]?.start??group.at(-1).end+.13)/tempo);
    if(end>start)captionLines.push(`Dialogue: 0,${stamp(start)},${stamp(end)},Caption,,0,0,0,,${group.map(w=>w.word).join(' ')}`);
  }
  cues.push({t:cursor+.035,kind:i?'whoosh':'pop',gain:.09});
  if(i===4)for(const delay of [.18,.57,.95])cues.push({t:cursor+delay,kind:'pop',gain:.08});
  cursor+=duration;
  const enc=spawn('ffmpeg',['-y','-v','error','-filter_threads','1','-f','rawvideo','-pixel_format','rgba','-video_size','720x1280','-framerate','24','-i','pipe:0','-i',take.audioFile,'-vf','scale=1080:1920','-af',`atempo=${tempo},adelay=50:all=1,apad`,'-t',String(duration),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-ar','48000',`${dir}/${name}.mp4`],{stdio:['pipe','inherit','inherit']});
  const done=once(enc,'close');
  for(let f=0;f<frames[i];f++){
    draw(i,title,subtitle,rows,f/24,duration);
    if(!enc.stdin.write(canvas.data()))await once(enc.stdin,'drain');
  }
  enc.stdin.end();
  const [code]=await done;
  if(code!==0)throw Error('Scene render failed: '+i);
  console.log('Rendered scene',i+1);
  list.push("file '"+name+".mp4'");
}
await writeFile(dir+'/concat.txt',list.join('\n'));
await writeFile(dir+'/captions.ass',`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Poppins,50,&H00FFF8E9,&H00FFF8E9,&H001E2321,&H001E2321,-1,0,0,0,100,100,0,0,3,17,0,2,105,135,358,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`+captionLines.join('\n'));
await writeSfxWav(dir+'/motion-effects.wav',cues,cursor);
ff(['-f','concat','-safe','0','-i',dir+'/concat.txt','-i',dir+'/motion-effects.wav','-filter_complex',`[0:v]fps=24,ass=${dir}/captions.ass:fontsdir=assets/fonts[v];[0:a][1:a]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.7:LRA=11,aresample=48000[a]`,'-map','[v]','-map','[a]','-t',String(cursor),'-c:v','libx264','-threads','3','-preset','veryfast','-crf','19','-c:a','aac','-b:a','192k','-movflags','+faststart',dir+'/One-Idea-Three-Drafts.mp4']);
