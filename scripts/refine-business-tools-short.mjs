import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {writeSfxWav} from '../src/media/assemble/sfx.ts';
const D='storage/episodes/shortcutstack-business-tools-v2';
await mkdir(D,{recursive:true});
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf','Poppins');
const scenes=JSON.parse(await readFile('storage/episodes/shortcutstack-business-tools/scenes.json','utf8'));
const bg='#102B33',ink='#F8F6ED',cyan='#86E4D7',gold='#F3C76A',muted='#B5CACD',panel='#21454D';
const run=(bin,args)=>{let p=spawnSync(bin,args,{encoding:'utf8',maxBuffer:10e6});if(p.status!==0)throw Error((p.stderr||p.stdout).slice(-1800));return p.stdout;};
const dur=scenes.map((_,i)=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',`${D}/voice${i}.wav`]).trim()));
const speed=dur.reduce((a,b)=>a+b,0)/(38-7*.13);
const lengths=dur.map(d=>Math.ceil((d/speed+.13)*24)/24);
const starts=[];let total=0;lengths.forEach(d=>{starts.push(total);total+=d;});
const c=createCanvas(720,1280),x=c.getContext('2d');
const ease=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),3);
function rect(a,b,w,h,col,r=16){x.fillStyle=col;x.beginPath();x.roundRect(a,b,w,h,r);x.fill();}
function txt(s,a,b,size=28,col=ink,align='left'){x.fillStyle=col;x.font=`${size}px Poppins`;x.textAlign=align;x.fillText(s,a,b);x.textAlign='left';}
function circle(a,b,r,col){x.fillStyle=col;x.beginPath();x.arc(a,b,r,0,Math.PI*2);x.fill();}
function line(a,b,c,d,col=cyan,width=5){x.strokeStyle=col;x.lineWidth=width;x.lineCap='round';x.beginPath();x.moveTo(a,b);x.lineTo(c,d);x.stroke();}
function check(a,b,k=1){line(a,b,a+9*k,b+10*k,cyan,4);line(a+9*k,b+10*k,a+28*k,b-13*k,cyan,4);}
function robot(a,b,t,scale=1){x.save();x.translate(a,b);x.scale(scale,scale);rect(-65,-62,130,105,'#E0E6DD',25);rect(-51,-48,102,72,bg,16);circle(-23,-15,7,cyan);circle(23,-15,7,cyan);line(-20,12,20,12,cyan,4);line(0,-62,0,-80,muted);circle(0,-84,7,gold);rect(-44,52,88,75,'#E0E6DD',18);circle(0,82,13,cyan);line(-55,65,-90,85,'#E0E6DD',12);line(55,65,90,48+Math.sin(t*4)*12,'#E0E6DD',12);x.restore();}
function person(a,b,t,scale=1){x.save();x.translate(a,b);x.scale(scale,scale);rect(-65,18,130,152,gold,35);circle(0,-28,48,'#DBA07C');x.fillStyle='#423B38';x.beginPath();x.arc(0,-43,49,Math.PI,Math.PI*2);x.fill();circle(-17,-25,4,bg);circle(17,-25,4,bg);line(-13,0,13,0,bg,3);line(-60,62,-94,110,gold,23);line(60,62,104,85+Math.sin(t*3)*10,gold,23);x.restore();}
function arrow(a,b,c,d,t){line(a,b,c,d,'#54747A',5);const p=(t*.65)%1;circle(a+(c-a)*p,b+(d-b)*p,7,cyan);}
function pill(s,a,b,w=220){rect(a,b,w,42,panel,21);txt(s,a+w/2,b+28,18,cyan,'center');}
function draw(i,t,d){
 x.fillStyle=bg;x.fillRect(0,0,720,1280);
 // restrained technical grid
 x.globalAlpha=.22;for(let a=40;a<720;a+=64)for(let b=180;b<1100;b+=64)circle(a,b,1.2,muted);x.globalAlpha=1;
 txt('SHORTCUTSTACK',54,94,21,cyan);txt('AI FOR REAL WORK',54,125,12,muted);
 rect(592,64,75,50,panel,25);txt(i===0?'START':i===6?'SAVE':`${i}/5`,630,98,21,gold,'center');
 const titles=[['STOP DOING','EVERYTHING.'],['Tidio'],['Canva'],['Fireflies'],['QuickBooks'],['Zapier'],['ONE TASK.','LESS BUSYWORK.']];
 txt(i===0?'YOUR NEXT HIRE? A BETTER WORKFLOW.':i===6?'START SMALL. CHECK THE RESULT.':scenes[i].tag,54,190,16,gold);
 titles[i].forEach((s,j)=>txt(s,54,267+j*65,i===0||i===6?48:65));
 const enter=ease(t/.5);x.save();x.translate(0,25*(1-enter));x.globalAlpha=enter;
 if(i===0){
  const labels=['CUSTOMERS','MEETINGS','MARKETING','RECEIPTS'];
  labels.forEach((s,j)=>{const a=58+(j%2)*325,b=380+Math.floor(j/2)*98+Math.sin(t*2+j)*5;rect(a,b,297,70,panel,14);txt(s,a+22,b+44,22);circle(a+263,b+35,10,gold);});
  person(270,716,t,1.13);robot(505,750,t,.76);rect(120,865,480,18,'#52777B',4);rect(209,755,230,130,'#355861',12);rect(225,769,198,97,bg,8);txt('TOO MANY TABS',324,828,18,cyan,'center');pill('5 TOOLS. ONE CLEAR JOB.',180,935,360);
 }else if(i===1){
  rect(175,370,370,515,'#DDE8E3',40);rect(189,385,342,483,panel,28);rect(298,396,124,18,bg,9);txt('CUSTOMER SUPPORT',360,458,18,cyan,'center');
  [['Do you ship on weekends?',460,1],['Here are our shipping hours.',565,1.4],['Need a person? I can help.',680,2.2]].forEach(([s,b,at],j)=>{const p=ease((t-at)/.4);x.globalAlpha=p;rect(j===0?216:205,b,296,78,j===0?'#365965':'#75D6C8',15);txt(s,j===0?230:220,b+45,15,j===0?ink:bg);});x.globalAlpha=1;robot(116,808,t,.48);pill('AVAILABLE AFTER HOURS',180,935,360);
 }else if(i===2){
  const colors=[gold,cyan,'#E9DDC7'];for(let j=0;j<3;j++){const p=ease((t-j*.35)/.65);x.save();x.translate(132+j*210,630);x.rotate((j-1)*.1+(1-p)*.2);x.scale(p,p);rect(-83,-170,166,294,colors[j],14);txt(['SOCIAL','SLIDES','ADS'][j],0,-130,20,bg,'center');rect(-60,-95,120,100,bg,8);circle(0,-45,32,colors[j]);rect(-60,25,115,9,bg,4);rect(-60,47,82,9,bg,4);rect(-60,81,70,24,bg,6);x.restore();}pill('IDEA → MARKETING DRAFT',150,935,420);
 }else if(i===3){
  rect(70,390,580,170,panel,20);txt('CLIENT CALL',100,435,20,muted);for(let j=0;j<35;j++){let h=12+Math.abs(Math.sin(j*1.2+t*5))*54;rect(100+j*15,495-h/2,7,h,j%3===0?gold:cyan,3);}arrow(360,580,360,633,t);
  rect(103,655,514,210,'#E4EBDF',18);['SUMMARY','DECISIONS','ACTION ITEMS'].forEach((s,j)=>{const p=ease((t-.7-j*.45)/.35);x.globalAlpha=p;check(135,700+j*59,.7);txt(s,180,707+j*59,23,bg);});x.globalAlpha=1;pill('GET RECORDING PERMISSION',130,935,460);
 }else if(i===4){
  for(let j=0;j<3;j++){x.save();x.translate(166+j*24,500+j*20);x.rotate(-.13+j*.09);rect(-70,-100,160,230,'#E9E5D7',9);txt('RECEIPT',-48,-53,17,bg);for(let k=0;k<4;k++)rect(-48,-25+k*26,103-k*11,6,'#78928D',2);x.restore();}arrow(280,560,404,560,t);
  rect(420,430,230,292,panel,18);['TRAVEL','SUPPLIES','REVIEW'].forEach((s,j)=>{txt(s,445,490+j*68,16,muted);rect(445,508+j*68,160*ease((t-j*.35)/.9),13,j===2?gold:cyan,4);});robot(340,789,t,.54);pill('AI SUGGESTS. YOU REVIEW.',135,935,450);
 }else if(i===5){
  const nodes=[[150,460,'LEAD'],[550,650,'CRM'],[170,810,'FOLLOW-UP']];arrow(210,485,490,620,t);arrow(495,689,232,788,t+.7);nodes.forEach(([a,b,s],j)=>{const p=ease((t-j*.3)/.5);x.save();x.translate(a,b);x.scale(.9+.1*p,.9+.1*p);rect(-95,-60,190,120,panel,20);circle(0,-12,18,j===0?gold:cyan);txt(s,0,40,18,ink,'center');x.restore();});pill('CONNECT → TEST → MONITOR',130,935,460);
 }else{
  person(244,575,t,1.25);robot(494,640,t,.95);rect(110,800,500,95,cyan,20);txt('SAVE THIS SHORT',360,859,36,bg,'center');txt('Follow for practical AI shortcuts.',360,955,23,muted,'center');
 }
 x.restore();
 if(i>0&&i<6)txt('Illustrative workflow · availability varies by plan',360,1017,13,muted,'center');
 // Chunk captions, isolated from the figures.
 const words=scenes[i].say.split(/\s+/),n=Math.ceil(words.length/5),step=Math.min(n-1,Math.floor(t/(d-.13)*n));
 const caption=words.slice(step*5,step*5+5).join(' ');
 rect(40,1044,640,110,'#0B2027',14);x.font='27px Poppins';const list=caption.split(' ');let row='',rows=[];for(const w of list){if(x.measureText(row+' '+w).width>580){rows.push(row);row=w;}else row+=(row?' ':'')+w;}if(row)rows.push(row);rows.forEach((s,j)=>txt(s,360,rows.length===1?1110:1088+j*39,27,ink,'center'));
 rect(54,1190,612,4,'#3A5960',2);rect(54,1190,612*((starts[i]+t)/total),4,cyan,2);
 // Directional wipe bridges each scene without flashing the full frame.
 if(i>0&&t<.23){const p=ease(t/.23);rect(720*p,0,720,1280,cyan,0);rect(720*p+40,0,720,1280,bg,0);}
 if(t>d-.18&&i<6){const p=ease((t-(d-.18))/.18);rect(720-760*p,0,760*p,1280,cyan,0);}
}
const args=['-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size','720x1280','-framerate','24','-i','pipe:0','-an','-vf','scale=1080:1920','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',`${D}/motion.mp4`];
const enc=spawn('ffmpeg',args,{stdio:['pipe','ignore','pipe']});let err='';enc.stderr.on('data',b=>err+=b);enc.stdin.on('error',()=>{});
for(let i=0;i<7;i++){
 for(let f=0;f<Math.round(lengths[i]*24);f++){draw(i,f/24,lengths[i]);if(!enc.stdin.write(c.data()))await once(enc.stdin,'drain');}
 console.log('Rendered animated scene '+i);
}
enc.stdin.end();const [code]=await once(enc,'close');if(code!==0)throw Error(err);
const cues=[];starts.slice(1).forEach(t=>cues.push({t:Math.max(0,t-.12),kind:'whoosh',gain:.1}));starts.slice(1,6).forEach(t=>cues.push({t:t+.6,kind:'pop',freq:600,gain:.065}));cues.push({t:starts[6]+.5,kind:'ding',gain:.07});
await writeSfxWav(`${D}/effects.wav`,cues,total);
const a=[];for(let i=0;i<7;i++)a.push('-i',`${D}/voice${i}.wav`);a.push('-i',`${D}/effects.wav`);
let graph=lengths.map((d,i)=>`[${i}:a]atempo=${speed},apad,atrim=duration=${d.toFixed(6)},asetpts=PTS-STARTPTS[a${i}]`).join(';')+';'+lengths.map((_,i)=>`[a${i}]`).join('')+'concat=n=7:v=0:a=1[v];[v][7:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]';
run('ffmpeg',['-y','-hide_banner','-loglevel','error',...a,'-filter_complex',graph,'-map','[a]','-c:a','pcm_s16le',`${D}/mixed.wav`]);
run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',`${D}/motion.mp4`,'-i',`${D}/mixed.wav`,'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',`${D}/edited.mp4`]);
await writeFile('episodes/shortcutstack-business-tools-v2.assemble.json',JSON.stringify({output:`${D}/ShortcutStack-AI-Tools-Refined.mp4`,width:1080,height:1920,fps:24,clips:[{file:`${D}/edited.mp4`}],events:[]},null,2));
await writeFile(`${D}/edit-provenance.json`,JSON.stringify({duration:total,speed,sceneStarts:starts,sceneDurations:lengths,narration:'Kokoro af_heart',figures:'Original canvas vector illustrations',effects:'Locally synthesized whooshes, pops and ding from Shorts app',captions:'Phrase timings estimated within each narration segment',originalPreserved:true},null,2));
console.log('Ready for app assembly: '+total.toFixed(3)+' seconds');
