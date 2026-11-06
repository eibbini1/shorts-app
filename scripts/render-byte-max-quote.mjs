import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { beats } from './byte-max-quote-story.mjs';
import { writeSfxWav, writeAmbientBed } from '../src/media/assemble/sfx.ts';

const dir='storage/episodes/byte-max-hidden-fee';
await mkdir(dir,{recursive:true});
const storyboard=await loadImage(process.argv[2]||dir+'/pilot-storyboard.png');
const takes=JSON.parse(await readFile(dir+'/takes.json','utf8'));
if(takes.length!==beats.length)throw Error('Dialogue and picture counts differ');
const run=args=>execFileSync('ffmpeg',['-y','-v','error','-filter_threads','1',...args],{stdio:'inherit'});
const canvas=createCanvas(1920,1080),ctx=canvas.getContext('2d');
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf','Poppins');
function box(x,y,w,h,r,fill){
  ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function label(s,x,y,size,color,maxWidth){
  ctx.fillStyle=color;ctx.font=`${size}px Poppins`;ctx.fillText(s,x,y,maxWidth);
}
const ink='#121B25',paper='#FFF0D1',gold='#FFBF64',cyan='#6BE6F5';
const crops=[[0,0],[518,0],[1033,0],[0,519],[518,519],[1033,519]];
const cue=[],lines=[],segments=[];
const tempo=takes.reduce((sum,take)=>sum+take.durationSec,0)/198;
if(!Number.isFinite(tempo)||tempo<.5||tempo>2)throw Error('Invalid voice tempo');
let cursor=0;
function stamp(seconds) {
  const c=Math.round(seconds*100);
  return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`;
}
for(const [index,[speaker,shot,,title,detail]] of beats.entries()) {
  const take=takes[index], accent=speaker==='Max'?gold:cyan;
  const [sx,sy]=crops[shot], sw=shot%3===2?503:499, sh=500;
  const left=index%2===0, pictureX=left?0:895, cardX=left?1060:84;
  const duration=Math.ceil((take.durationSec/tempo+.36)*24)/24;
  ctx.fillStyle=ink;ctx.fillRect(0,0,1920,1080);
  ctx.drawImage(storyboard,sx,sy,sw,sh,pictureX,0,1025,1025);
  const shade=ctx.createLinearGradient(left?780:890,0,left?1025:1120,0);
  shade.addColorStop(0,left?'#121B2500':ink);shade.addColorStop(1,left?ink:'#121B2500');
  ctx.fillStyle=shade;ctx.fillRect(left?780:890,0,245,1025);
  for(let x=cardX;x<cardX+735;x+=42)for(let y=190;y<840;y+=42){ctx.fillStyle='#233443';ctx.fillRect(x,y,2,2);}
  box(cardX,100,725,62,21,'#203140');
  label('SHORTCUTSTACK   /   BYTE & MAX',cardX+22,140,28,accent,670);
  const part=index<8?'01  FIND THE FEE':index<12?'02  FIX ONE LINE':index<18?'03  DRAFT THE REPLY':'THE TAKEAWAY';
  label(part,cardX+4,298,33,accent,700);
  label(title,cardX,388,52,paper,725);
  box(cardX,464,725,150,26,paper);
  box(cardX+20,484,10,110,5,accent);
  label(detail,cardX+43,552,40,ink,658);
  if(index===5){
    box(cardX,666,725,107,20,'#214C44');label('QUOTE B  ·  $520 WITH SETUP',cardX+30,733,36,'#BBFFCF',665);
  } else if(index===9||index===11){
    label(index===9?'BEFORE   48 hours':'UNCHANGED   Revision limit',cardX+3,725,34,accent,720);
  } else if(index>=13&&index<=17){
    box(cardX,669,725,93,18,'#263E53');label('DRAFT ONLY   /   HUMAN REVIEW',cardX+25,728,32,cyan,670);
  } else {
    label('FICTIONAL WORKSHOP EXAMPLE',cardX+3,720,25,'#B8C9D1',700);
  }
  box(0,1017,1920,63,0,ink);
  box(92,1038,1736,5,2,'#42505A');box(92,1038,1736*(index+1)/beats.length,5,2,accent);
  const name='beat-'+String(index).padStart(2,'0');
  await writeFile(dir+'/'+name+'.png',canvas.toBuffer('image/png'));
  const frames=Math.round(duration*24);
  const zoom=`zoompan=z='1+0.025*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=1920x1080:fps=24`;
  run(['-i',dir+'/'+name+'.png','-i',take.audioFile,'-vf',zoom,'-af',`atempo=${tempo},aresample=48000,adelay=100:all=1,apad`,'-t',String(duration),'-c:v','libx264','-threads','2','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000',dir+'/'+name+'.mp4']);
  segments.push("file '"+name+".mp4'");
  const {words}=take;
  for(let n=0;n<words.length;n+=7){
    const group=words.slice(n,n+7);
    const start=cursor+.1+group[0].start/tempo;
    const end=Math.min(cursor+duration,cursor+.1+(words[n+7]?.start??group.at(-1).end+.14)/tempo);
    if(end>start)lines.push(`Dialogue: 0,${stamp(start)},${stamp(end)},${speaker},,0,0,0,,${group.map(w=>w.word).join(' ')}`);
  }
  if([0,1,3,5,8,11,12,14,16,18].includes(index))cue.push({t:cursor+.04,kind:[3,8,12].includes(index)?'whoosh':index===5?'ding':'pop',gain:.1});
  cursor+=duration;
  console.log('Rendered',name);
}
const styles=['Max','Byte'].map((name,i)=>`Style: ${name},Poppins,46,${i?'&H00F5E66B':'&H0064BFFF'},&H00FFFFFF,&H00251B12,&H00251B12,-1,0,0,0,100,100,0,0,3,15,0,2,100,100,96,1`).join('\n');
await writeFile(dir+'/captions.ass',`[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`+lines.join('\n'));
await writeFile(dir+'/concat.txt',segments.join('\n'));
await writeSfxWav(dir+'/effects.wav',cue,cursor);
await writeAmbientBed(dir+'/ambience.wav',cursor);
run(['-f','concat','-safe','0','-i',dir+'/concat.txt','-i',dir+'/effects.wav','-i',dir+'/ambience.wav','-filter_complex_threads','1','-filter_complex',`[0:v]fps=24,ass=${dir}/captions.ass:fontsdir=assets/fonts[v];[2:a]volume=.11[bed];[0:a][1:a][bed]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-14:TP=-1.7:LRA=11[a]`,'-map','[v]','-map','[a]','-t',String(cursor),'-c:v','libx264','-threads','3','-preset','veryfast','-crf','19','-c:a','aac','-b:a','192k','-movflags','+faststart',dir+'/Byte-and-Max-The-Hidden-Fee-Review.mp4']);
console.log('Review cut',cursor.toFixed(2),'seconds');
