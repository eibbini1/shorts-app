import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { KokoroTTS } from '../storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { writeSfxWav } from '../src/media/assemble/sfx.ts';

const episodes = [
  {
    id: 'shortcutstack-hidden-quote-fee', tool: 'NOTEBOOKLM', color: '#66EBCA',
    title: ['THE MISSING', 'FEE'], beats: [
      ['This four-eighty quote looks cheaper. Then you find the setup fee.', 'WHICH QUOTE WINS?'],
      ['Add both quotes to Notebook LM. Ask for base price, setup fees, and included revisions.', 'COMPARE BOTH SOURCES'],
      ['Ask for a citation beside every number. Open the setup citation: seventy dollars.', 'OPEN THE CITATION'],
      ['Add it to quote A. Five-fifty versus five-twenty with setup included.', 'THE PRICE FLIPS'],
      ['Quote A doesn’t say how many revisions you get. Ask before choosing a supplier.', 'ONE QUESTION LEFT'],
    ],
  },
  {
    id: 'shortcutstack-gemini-pdf-one-line', tool: 'GEMINI', color: '#C1ADFF',
    title: ['ONE LINE', 'TO FIX'], beats: [
      ['One line changed in your client PDF. Do you need to rebuild the whole thing?', 'ONE SMALL CHANGE'],
      ['Open the PDF preview in Gemini and highlight the reply-time sentence.', 'HIGHLIGHT THE LINE'],
      ['Ask Gemini to replace “within forty-eight hours” with “within two business days.”', 'REQUEST A PRECISE EDIT'],
      ['Compare both previews. Check the line breaks, and make sure the two-revision limit is still there.', 'CHECK WHAT STAYED'],
      ['Once both checks pass, download the revised PDF.', 'DOWNLOAD AFTER REVIEW'],
    ],
  },
];
const fps = 24;
const total = 33;
const frames = [132, 168, 168, 168, 156];
const width = 720;
const height = 1280;
const ink = '#F8F6EF', dark = '#0F1926', panel = '#203145', muted = '#BDCDDC', amber = '#FFD477';
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf', 'Poppins');
const c = createCanvas(width, height);
const ctx = c.getContext('2d');
function box(x,y,w,h,color,r=16) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}
function label(value,x,y,size,color=ink,align='left') {
  ctx.font=`${size}px Poppins`; ctx.fillStyle=color; ctx.textAlign=align; ctx.fillText(value,x,y); ctx.textAlign='left';
}
function dot(x,y,r,color) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
}
function downArrow(x,y,color) {
  ctx.strokeStyle=color;ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(x,y-15);ctx.lineTo(x,y+13);ctx.moveTo(x-9,y+4);ctx.lineTo(x,y+13);ctx.lineTo(x+9,y+4);ctx.stroke();
}
function ease(t) { return 1-(1-Math.max(0,Math.min(1,t)))**3; }
function doc(x,y,w,h,name,lines,accent) {
  box(x,y,w,h,'#F4F0E6',17);
  box(x+20,y+22,w-40,43,accent,8);
  label(name,x+30,y+51,19,dark);
  lines.forEach(([s,highlight],i)=>{
    const top=y+95+i*63;
    if(highlight) box(x+20,top-9,w-40,44,amber,7);
    label(s,x+29,top+20,w<300?17:23,dark);
  });
}
function card(x,y,w,name,value,color) {
  box(x,y,w,147,panel,18);
  label(name,x+23,y+43,21,muted);
  label(value,x+23,y+109,47,color);
}
function wrap(value,max) {
  let row='', rows=[];
  for(const word of value.split(/\s+/)){
    const next=row?row+' '+word:word;
    if(row&&ctx.measureText(next).width>max){rows.push(row);row=word;}else row=next;
  }
  if(row) rows.push(row);
  return rows;
}
function quoteFigures(i,t,color) {
  if(i===0){
    card(53,490,291,'QUOTE A','$480',color);
    card(376,490,291,'QUOTE B','$520',ink);
    box(104,690,512,90,amber); label('LOOK FOR THE SETUP FEE',360,744,26,dark,'center');
  } else if(i===1) {
    doc(58,476,287,330,'QUOTE A',[['Project: $480'],['Setup: $70',true],['Revisions: —']],color);
    doc(375,476,287,330,'QUOTE B',[['Project: $520'],['Setup: included'],['Two revisions']],color);
  } else if(i===2) {
    doc(84,465,552,355,'QUOTE A · SOURCE',[['Project fee: $480'],['Setup fee: $70',true],['Revision limit: unspecified']],color);
    const pointer=577+Math.sin(t*5)*12;
    dot(pointer,640,13,dark); dot(pointer,640,6,color);
  } else if(i===3) {
    card(53,487,291,'QUOTE A',t<1?'$480':'$550',amber);
    card(376,487,291,'QUOTE B','$520',color);
    label(t<1?'BASE PRICE':'$480 + $70 SETUP',198,685,19,muted,'center');
    label('SETUP INCLUDED',521,685,19,muted,'center');
    box(171,725,378,66,color); label('QUOTE B IS $30 LESS',360,768,23,dark,'center');
  } else {
    doc(85,463,550,280,'BEFORE YOU ACCEPT',[['Quote A: revisions not stated',true],['Ask for the included revision limit']],color);
    box(104,783,512,65,panel);label('SAVE THIS QUOTE CHECK',360,825,24,color,'center');
  }
}
function pdfFigures(i,t,color) {
  const old=['Reply within 48 hours',true], revised=['Reply within two business days',true], revisions=['Up to two revisions'];
  if(i<2) {
    doc(85,466,550,350,'CLIENT WELCOME GUIDE',[old,revisions,['Send feedback by email']],color);
    if(i===1){const y=575+Math.sin(t*4)*8;dot(595,y,13,dark);dot(595,y,6,color);}
  } else if(i===2) {
    box(70,468,580,110,panel);label('BEFORE',94,505,18,muted);label(old[0],94,550,28);
    downArrow(360,618,color);
    box(70,655,580,114,color);label('REQUESTED EDIT',94,695,18,dark);label(revised[0],94,739,28,dark);
  } else if(i===3) {
    doc(70,460,580,308,'REVISED PREVIEW',[revised,revisions,['Send feedback by email']],color);
    box(92,796,250,52,panel);label('LINE BREAKS',217,830,19,color,'center');
    box(377,796,250,52,panel);label('REVISION LIMIT',502,830,19,color,'center');
  } else {
    doc(118,466,484,240,'CLIENT GUIDE · REVISED',[revised,revisions],color);
    box(136,746,448,76,color);label('DOWNLOAD REVISED PDF',360,794,24,dark,'center');
  }
}
function draw(ep,i,t,duration,elapsed) {
  box(0,0,width,height,dark,0);
  for(let x=50;x<width;x+=46)for(let y=150;y<1120;y+=46) dot(x,y,1.2,'#30465B');
  label('SHORTCUTSTACK',54,97,22,ep.color);
  label(ep.tool,666,97,19,muted,'right');
  box(54,129,612,3,'#344858',2);
  label(ep.title[0],54,239,68);
  label(ep.title[1],54,315,68,ep.color);
  label(`0${i+1} / 05`,664,300,20,muted,'right');
  label(ep.beats[i][1],54,396,23,amber);
  const amount=i===0?1:ease(t/.32);
  ctx.save();ctx.translate(0,22*(1-amount));ctx.globalAlpha=amount;
  if(ep.tool==='NOTEBOOKLM')quoteFigures(i,t,ep.color);else pdfFigures(i,t,ep.color);
  ctx.restore();
  label('ILLUSTRATED EXAMPLE',360,916,17,muted,'center');
  const words=ep.beats[i][0].split(/\s+/);
  const chunkCount=Math.ceil(words.length/6);
  const index=Math.min(chunkCount-1,Math.floor(Math.max(0,t-.10)/Math.max(.1,duration-.24)*chunkCount));
  box(51,961,618,111,'#090F18',18);
  ctx.font='25px Poppins';
  const rows=wrap(words.slice(index*6,index*6+6).join(' ').replace(/Notebook LM/g,'NotebookLM'),562);
  rows.forEach((row,k)=>label(row,360,rows.length===1?1027:1009+k*36,25,ink,'center'));
  box(54,1123,612,5,'#344858',2);box(54,1123,Math.max(1,612*elapsed/total),5,ep.color,2);
  // A short colored edge wipe marks the cut while the narration stays audible.
  if(i>0&&t<.26){
    const edge=720*ease(t/.26);
    box(edge,0,720-edge,height,dark,0);
    box(edge,0,Math.min(24,720-edge),height,ep.color,0);
  }
}
function run(bin,args) {
  const p=spawnSync(bin,args,{encoding:'utf8',maxBuffer:8e6});
  if(p.status!==0) throw p.error??Error((p.stderr||p.stdout).slice(-2200));
  return p.stdout;
}
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
for(const ep of episodes.filter(ep=>!process.argv[2]||ep.id===process.argv[2])){
  const dir='storage/episodes/'+ep.id;
  await mkdir(dir,{recursive:true});
  for(const [i,[line]] of ep.beats.entries()){
    const wav=`${dir}/voice${i}.wav`;
    try{await readFile(wav);}catch{
      const audio=await tts.generate(line,{voice:'af_heart',speed:1.05});
      await audio.save(wav);
    }
    console.log(ep.id+' voice '+(i+1));
  }
  const durations=frames.map(n=>n/fps);
  const raw=frames.map((_,i)=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',`${dir}/voice${i}.wav`]).trim()));
  const tempo=raw.map((seconds,i)=>seconds/(durations[i]-.27));
  if(tempo.some(n=>!Number.isFinite(n)||n<.5||n>2))throw Error('Narration needs a new timing pass: '+tempo.join(', '));
  const enc=spawn('ffmpeg',['-y','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size','720x1280','-framerate','24','-i','pipe:0','-an','-vf','scale=1080:1920','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',dir+'/motion.mp4'],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);
  const done=once(enc,'close');
  let start=0;
  const cues=[];
  for(let i=0;i<frames.length;i++){
    if(i)cues.push({t:start+.04,kind:i===3?'ding':'whoosh',gain:.07});
    for(let f=0;f<frames[i];f++){
      draw(ep,i,f/fps,durations[i],start+f/fps);
      if(!enc.stdin.write(c.data()))await once(enc.stdin,'drain');
    }
    start+=durations[i];
  }
  enc.stdin.end();const [code]=await done;if(code!==0)throw Error(errors);
  await writeSfxWav(dir+'/effects.wav',cues,total);
  const args=raw.flatMap((_,i)=>['-i',`${dir}/voice${i}.wav`]);
  const filters=raw.map((_,i)=>`[${i+1}:a]atempo=${tempo[i]},adelay=100:all=1,apad,atrim=duration=${durations[i]}[v${i}]`).join(';');
  const concat=raw.map((_,i)=>`[v${i}]`).join('');
  run('ffmpeg',['-y','-loglevel','error','-i',dir+'/motion.mp4',...args,'-i',dir+'/effects.wav','-filter_complex',`${filters};${concat}concat=n=5:v=0:a=1[voice];[voice][6:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-t','33',dir+'/edited.mp4']);
  const spec={output:dir+'/assembled.mp4',width:1080,height:1920,fps,clips:[{file:dir+'/edited.mp4'}],events:[]};
  await writeFile(dir+'/episode.assemble.json',JSON.stringify(spec,null,2));
  await writeFile(dir+'/production.json',JSON.stringify({voice:'Kokoro af_heart',license:'Apache-2.0',duration:total,visuals:'Original illustrated examples, not screen captures',beats:ep.beats.map(([text],i)=>({text,seconds:durations[i],tempo:tempo[i]}))},null,2));
  console.log('Ready for Shorts app assembly: '+dir);
}
