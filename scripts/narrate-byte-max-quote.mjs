import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { synthesize } from '../src/media/voice/VoiceProvider.ts';
import { beats } from './byte-max-quote-story.mjs';
const dir='storage/episodes/byte-max-hidden-fee';
const takes=[];
for (const [index,[speaker,,line]] of beats.entries()) {
  const voiceId=speaker==='Byte'?(process.env.BYTE_VOICE_ID||'UgBBYS2sOqTuMpoF3BR0'):(process.env.MAX_VOICE_ID||'7EzWGsX10sAS4c9m9cPf');
  takes.push(await synthesize(line,dir+'/voice',{provider:'elevenlabs',voiceId,speed:1,stability:speaker==='Byte'?.57:.38,style:.25}));
  console.log('Recorded',index+1,speaker);
}
await writeFile(dir+'/takes.json',JSON.stringify(takes));
