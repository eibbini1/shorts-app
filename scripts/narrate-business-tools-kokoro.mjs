import {KokoroTTS} from '../storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js';
import {env} from '../storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
const dir='storage/episodes/shortcutstack-business-tools-v2';
await mkdir(dir,{recursive:true});
env.cacheDir=path.resolve('storage/tools/kokoro/models');
const scenes=JSON.parse(await readFile('storage/episodes/shortcutstack-business-tools/scenes.json','utf8'));
console.log('Loading Kokoro q8 CPU model (cached on D drive).');
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
for(let i=0;i<scenes.length;i++){
 const file=path.join(dir,`voice${i}.wav`);
 try{await access(file);console.log('Cached scene '+i);continue;}catch{}
 const audio=await tts.generate(scenes[i].say,{voice:'af_heart',speed:1.05});
 await audio.save(file);console.log('Narrated scene '+i);
}
await writeFile(dir+'/voice-provenance.json',JSON.stringify({engine:'kokoro-js 1.2.1',model:'onnx-community/Kokoro-82M-v1.0-ONNX',dtype:'q8',voice:'af_heart',speed:1.05,license:'Apache-2.0',source:'https://huggingface.co/hexgrad/Kokoro-82M',generatedAt:new Date().toISOString(),paidApiCalls:0},null,2));
