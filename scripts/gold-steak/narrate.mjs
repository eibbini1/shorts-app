import path from 'node:path';
import {writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {KokoroTTS} from '../../storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js';
import {env} from '../../storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const work=path.resolve(process.env.GOLD_STEAK_WORK_DIR ?? path.join(root,'storage/gold-steak-local'));
await mkdir(work,{recursive:true});
env.cacheDir=path.join(root,'storage/tools/kokoro/models');
env.allowRemoteModels=false;
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
const lines=[
 [0.35,'Before the gold comes the craft.'],
 [4.55,'Build a beautiful crust.'],
 [9.6,'Baste with rosemary butter.'],
 [14.55,'Rest. Then reveal the center.'],
 [19.5,'Finish with a touch of edible gold.'],
 [25,'The real luxury? That first bite.'],
];
const args=['-y','-v','error','-f','lavfi','-t','30','-i','anullsrc=r=48000:cl=stereo'];
const filters=[];
for(let i=0;i<lines.length;i++) {
 const [at,text]=lines[i];
 const output=path.join(work,`voice-${i}.wav`);
 const audio=await tts.generate(text,{voice:'af_heart',speed:0.96});
 await audio.save(output);
 args.push('-i',output);
 filters.push(`[${i+1}:a]aresample=48000,adelay=${Math.round(at*1000)}:all=1[v${i}]`);
 console.log('Generated local voice',i+1);
}
filters.push('[0:a]'+lines.map((_,i)=>`[v${i}]`).join('')+`amix=inputs=${lines.length+1}:duration=first:normalize=0[a]`);
args.push('-filter_complex',filters.join(';'),'-map','[a]','-t','30','-c:a','pcm_s16le',path.join(work,'voice-timeline.wav'));
execFileSync('ffmpeg',args,{stdio:'inherit'});
await writeFile(path.join(work,'voice-provenance.json'),JSON.stringify({engine:'Kokoro local ONNX',voice:'af_heart',speed:0.96,lines},null,2));
