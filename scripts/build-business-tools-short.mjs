import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dir='storage/episodes/shortcutstack-business-tools';
await mkdir(dir,{recursive:true});
GlobalFonts.registerFromPath('assets/fonts/Poppins-Bold.ttf','Poppins');
const scenes=[
 {title:'Still doing\neverything yourself?',tag:'WORK SMARTER',sub:'5 tools for your small business',lines:['CUSTOMERS','MARKETING','MEETINGS','ADMIN'],say:'Running a small business? These five tools can help you get time back.'},
 {title:'Tidio',tag:'01 / CUSTOMER REPLIES',sub:'Support beyond office hours',lines:['Customer asks a question','AI uses your support content','Escalate when needed'],say:'Tidio helps answer customer questions around the clock, using your support content.'},
 {title:'Canva',tag:'02 / MARKETING CONTENT',sub:'Start with an idea. Build a campaign.',lines:['SOCIAL POST','PRESENTATION','AD CREATIVE'],say:'Canva helps create marketing posts, ads, and presentations with AI.'},
 {title:'Fireflies',tag:'03 / CLIENT CALLS',sub:'Turn conversations into next steps',lines:['Meeting transcript','Summary and decisions','Action items to review'],say:'Fireflies turns recorded meetings into summaries and action items. Get permission before recording.'},
 {title:'QuickBooks',tag:'04 / RECEIPTS & EXPENSES',sub:'Less sorting. More oversight.',lines:['Capture a receipt','Suggest an expense category','Review before accepting'],say:'QuickBooks helps capture receipts and categorize expenses. Always review the results.'},
 {title:'Zapier',tag:'05 / AUTOMATION',sub:'Connect the work between your apps',lines:['NEW LEAD','CRM UPDATE','FOLLOW-UP'],say:'Zapier connects your apps to automate follow-ups and repetitive tasks.'},
 {title:'Start with\none task.',tag:'GET YOUR TIME BACK',sub:'Save this for your next busy day.',lines:['Choose your biggest bottleneck','Test one workflow','Check the result'],say:'Start with one task. Check plan availability, and save this for your next busy day.'}
];
await writeFile(dir+'/scenes.json',JSON.stringify(scenes,null,2));
function text(ctx,t,x,y,size,color='#F7F6EF'){ctx.fillStyle=color;ctx.font=`${size}px Poppins`;ctx.fillText(t,x,y);}
for(let i=0;i<scenes.length;i++){
 const s=scenes[i],c=createCanvas(1080,1920),x=c.getContext('2d');
 x.fillStyle='#112B32';x.fillRect(0,0,1080,1920);
 x.fillStyle='#83E0D8';x.fillRect(80,150,44,7);text(x,'SHORTCUTSTACK',145,167,28,'#83E0D8');
 text(x,s.tag,80,280,27,'#EAC36C');
 s.title.split('\n').forEach((v,j)=>text(x,v,80,420+j*104,i===0?64:86));
 text(x,s.sub,80,i===0?625:565,31,'#BACCD0');
 const start=730;
 s.lines.forEach((v,j)=>{const y=start+j*150;x.fillStyle='#203E47';x.beginPath();x.roundRect(80,y,920,118,18);x.fill();text(x,String(j+1).padStart(2,'0'),110,y+73,29,'#83E0D8');text(x,v,185,y+73,31);if(j<s.lines.length-1){x.fillStyle='#83E0D8';x.fillRect(130,y+122,3,22);}});
 text(x,i>0&&i<6?'Illustrative workflow • features vary by plan':'Practical AI shortcuts for real work',80,1440,24,'#BACCD0');
 x.fillStyle='#EAC36C';x.fillRect(80,1510,920*((i+1)/7),7);
 text(x,'SAVE FOR LATER',80,1625,34,'#EAC36C');text(x,`${String(i+1).padStart(2,'0')} / 07`,845,1625,29,'#83E0D8');
 await writeFile(`${dir}/scene${i}.png`,c.toBuffer('image/png'));
}
if(process.argv.includes('--assets-only'))process.exit(0);
function run(bin,args){const p=spawnSync(bin,args,{encoding:'utf8'});if(p.status!==0)throw Error((p.stderr||p.stdout).slice(-1600));return p.stdout;}
const durations=scenes.map((_,i)=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',`${dir}/voice${i}.wav`]).trim()));
const raw=durations.reduce((a,b)=>a+b,0);const target=38;const speed=raw/(target-scenes.length*.12);
let elapsed=0;let srt='';
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};
for(let i=0;i<scenes.length;i++){
 const d=durations[i]/speed+.12;
 run('ffmpeg',['-y','-hide_banner','-loglevel','error','-loop','1','-i',`${dir}/scene${i}.png`,'-i',`${dir}/voice${i}.wav`,'-vf',`scale=1124:1998,crop=1080:1920:x='22+18*sin(t*0.7)':y='39+18*cos(t*0.7)',fps=24`,'-af',`atempo=${speed},apad=pad_dur=0.12,loudnorm=I=-16:TP=-1.5:LRA=11`,'-t',d.toFixed(3),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac',`${dir}/clip${i}.mp4`]);
 const words=scenes[i].say.split(' ');const groups=[];for(let w=0;w<words.length;w+=7)groups.push(words.slice(w,w+7).join(' '));groups.forEach((g,j)=>{const a=elapsed+j*(d-.12)/groups.length,b=elapsed+(j+1)*(d-.12)/groups.length;srt+=`${srt.split('-->').length}\n${stamp(a)} --> ${stamp(b)}\n${g}\n\n`;});elapsed+=d;
}
await writeFile(`${dir}/captions.srt`,srt);
await writeFile('episodes/shortcutstack-business-tools.assemble.json',JSON.stringify({output:`${dir}/assembled.mp4`,width:1080,height:1920,fps:24,clips:scenes.map((_,i)=>({file:`${dir}/clip${i}.mp4`})),events:[]},null,2));
await writeFile(`${dir}/production.json`,JSON.stringify({rawNarrationSeconds:raw,speed,targetSeconds:target,scenes},null,2));
console.log(JSON.stringify({raw, speed, target, spec:'episodes/shortcutstack-business-tools.assemble.json'}));
