import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { synthesize } from '../src/media/voice/VoiceProvider.ts';

const dir = 'storage/episodes/claude-youtube-skill';
await mkdir(dir, { recursive: true });
const scenes = [
  ['STOP RETYPING', 'YOUR YOUTUBE PROMPT', ['ONE IDEA', 'TITLE + DESCRIPTION + HOOK'], 'Stop retyping your YouTube prompt. Teach Claude your publishing checklist once.'],
  ['PACKAGE THE SKILL', 'ONE ZIP FILE', ['youtube-publish-kit.zip', 'youtube-publish-kit / SKILL.md'], 'I made a sample skill called YouTube Publish Kit. Its ZIP contains a skill folder with a SKILL dot M D file.'],
  ['ADD IT TO CLAUDE', 'UPLOAD THE ZIP', ['Customize > Skills', '+ > Create skill', 'Upload a skill > Select ZIP'], 'In Claude, open Customize, then Skills. Click plus, Create skill, then Upload a skill. Choose the ZIP and make sure the skill is on.'],
  ['TRY ONE IDEA', 'PASTE THIS PROMPT', ['Use YouTube Publish Kit for:', '“Find hidden fees in quotes.”'], 'Now ask: use YouTube Publish Kit for my video about finding hidden fees in quotes.'],
  ['GET A PUBLISHING KIT', 'REVIEW THE DRAFT', ['TITLE · How to Spot Hidden Fees', 'DESCRIPTION · Compare setup fees.', 'THUMBNAIL · THE HIDDEN FEE'], 'You get a title, a description, and a thumbnail hook. Check the details, then reuse the skill for your next video.'],
];
const frames = [120, 168, 240, 144, 192];
const voice = { provider: 'elevenlabs', speed: 1, stability: .53, style: .22 };
const takes = [];
for (const scene of scenes) takes.push(await synthesize(scene[3], dir + '/voice', voice));
const ff = args => execFileSync('ffmpeg', ['-y','-v','error','-filter_threads','1',...args], {stdio:'inherit'});
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf', 'Poppins');
const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d');
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
for (const [i,[title,subtitle,rows]] of scenes.entries()) {
  box(0,0,1080,1920,paper,0);
  ctx.fillStyle='#DFD4BE';
  for(let x=37;x<1080;x+=45)for(let y=40;y<1920;y+=45)ctx.fillRect(x,y,2,2);
  box(68,95,944,78,ink,36);
  label('WORKLESS AI',103,147,30,paper);
  label(`CLAUDE SKILLS  0${i+1}/05`,595,147,26,lime);
  label(title,76,360,68);
  box(70,404,943,112,lime,13);
  label(subtitle,93,479,57);
  box(72,640,936,550,'#FFF9ED',26);
  label(i===4?'ILLUSTRATIVE OUTPUT':'ILLUSTRATED WALKTHROUGH',105,714,29,rust);
  rows.forEach((row,j)=>{
    const y=762+j*118;
    box(108,y,864,87,j===rows.length-1?'#F3D7C3':'#EDE5D5',14);
    box(129,y+20,51,48,ink,12);
    label(String(j+1),145,y+53,22,paper);
    label(row,206,y+56,34);
  });
  if(i===2)label('Requires code execution to be enabled.',86,1280,32,rust);
  if(i===3)label('Some accounts show Plugins in the sidebar.',86,1280,29,rust);
  box(85,1648,910,9,'#C6BDA8',4);box(85,1648,910*(i+1)/5,9,rust,4);
  const name='scene-'+i;
  await writeFile(`${dir}/${name}.png`,canvas.toBuffer('image/png'));
  const duration=frames[i]/24, take=takes[i], tempo=take.durationSec/(duration-.18);
  if(tempo<.5||tempo>2)throw Error('Narration timing out of range for scene '+i+': '+tempo);
  for(let j=0;j<take.words.length;j+=5){
    const group=take.words.slice(j,j+5);
    const start=cursor+.05+group[0].start/tempo;
    const end=Math.min(cursor+duration,cursor+.05+(take.words[j+5]?.start??group.at(-1).end+.13)/tempo);
    if(end>start)captionLines.push(`Dialogue: 0,${stamp(start)},${stamp(end)},Caption,,0,0,0,,${group.map(w=>w.word).join(' ')}`);
  }
  cursor+=duration;
  ff(['-loop','1','-framerate','24','-i',`${dir}/${name}.png`,'-i',take.audioFile,'-vf',i?'fade=t=in:d=0.16:color=0xF5ECDA':'null','-af',`atempo=${tempo},adelay=50:all=1,apad`,'-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-ar','48000',`${dir}/${name}.mp4`]);
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
ff(['-f','concat','-safe','0','-i',dir+'/concat.txt','-vf',`fps=24,ass=${dir}/captions.ass:fontsdir=assets/fonts`,'-af','loudnorm=I=-14:TP=-1.7:LRA=11,aresample=48000','-t','36','-c:v','libx264','-threads','3','-preset','veryfast','-crf','19','-c:a','aac','-b:a','192k','-movflags','+faststart',dir+'/Stop-Retyping-Your-YouTube-Prompt.mp4']);
