import path from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {KokoroTTS} from '../storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js';
import {env} from '../storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js';

const [scenarioFile, workArg] = process.argv.slice(2);
if (!scenarioFile || !workArg) throw new Error('Usage: node scripts/narrate-any-local.mjs scenario.json work-dir');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const work = path.resolve(workArg);
await mkdir(work, {recursive:true});
const data = JSON.parse(await readFile(scenarioFile, 'utf8'));
const shots = data.plan.shots;
const total = shots.reduce((sum, shot) => sum + shot.seconds, 0);
const voice = data.settings?.voice ?? process.env.KOKORO_VOICE ?? (/cat|comedy|funny|old man|male narrator/i.test(data.plan.title + ' ' + data.plan.hook) ? 'am_adam' : 'af_heart');
env.cacheDir = path.join(root, 'storage/tools/kokoro/models');
env.allowRemoteModels = false;
const ELEVEN_VOICES = {brian:'nPczCjzI2devNBz1zQrb', daniel:'onwK4e9ZLuTAKqWW03F9', george:'JBFqnCBsd6RMkjVDRZzb', adam:'pNInz6obpgDQGcFmaJgB', charlie:'IKne3meq5aSn9XLyUdCD'};
const useEleven = String(voice).startsWith('eleven:');
const tts = useEleven ? null : await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {dtype:'q8', device:'cpu'});
// ElevenLabs path: key read from .env or the environment and never printed. Each line is cached by exact text + voice settings, so re-runs spend no credits.
async function elevenSpeak(text, outWav) {
  const name = String(voice).slice(7).toLowerCase();
  const voiceId = ELEVEN_VOICES[name] ?? name;
  const modelId = data.settings?.voiceModel ?? 'eleven_multilingual_v2';
  const settings = {stability:0.5, similarity_boost:0.75, style:0.2, use_speaker_boost:true, speed:data.settings?.voiceSpeed ?? 1.05};
  const cacheDir = path.join(root, 'storage/eleven-cache');
  await mkdir(cacheDir, {recursive:true});
  const hash = createHash('sha256').update(JSON.stringify([voiceId, modelId, settings, text])).digest('hex').slice(0, 24);
  const mp3 = path.join(cacheDir, `${hash}.mp3`);
  if (!existsSync(mp3)) {
    let key = process.env.ELEVENLABS_API_KEY;
    if (!key) { try { key = (await readFile(path.join(root, '.env'), 'utf8')).match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim(); } catch {} }
    if (!key) throw new Error('ELEVENLABS_API_KEY is not set in .env');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method:'POST', headers:{'xi-api-key':key, 'content-type':'application/json', accept:'audio/mpeg'},
      body:JSON.stringify({text, model_id:modelId, voice_settings:settings}),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
    console.log(`ElevenLabs spent ${text.length} characters`);
  } else console.log('ElevenLabs line served from cache (0 characters)');
  execFileSync('ffmpeg', ['-y','-v','error','-i',mp3,'-ar','48000','-ac','1',outWav]);
}
const args = ['-y','-v','error','-f','lavfi','-t',String(total),'-i','anullsrc=r=48000:cl=stereo'];
const filters=[];
const lines=[];
let at=0;
for (let i=0;i<shots.length;i++) {
  const shot=shots[i];
  const output=path.join(work,`voice-${i}.wav`);
  const text=shot.narration.trim();
  if (useEleven) await elevenSpeak(text, output);
  else { const audio=await tts.generate(text,{voice,speed:1}); await audio.save(output); }
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'}).trim());
  const space=shot.seconds-0.3;
  const tempo=Math.max(useEleven?0.9:1,duration/space); // ElevenLabs lines may be slowed up to 10% to avoid dead air
  if (tempo>1.5) throw new Error(`Shot ${i+1} narration is too long (${duration.toFixed(1)}s for ${shot.seconds}s). Edit its narration and rerun.`);
  const lead=Number(shot.voiceLeadSeconds ?? 0);
  if (!Number.isFinite(lead) || lead<0 || lead>0.75 || (i===0 && lead>0)) throw new Error(`Shot ${i+1} voiceLeadSeconds must be 0–0.75 (and 0 for the first shot)`);
  const voiceAt=at+0.15-lead;
  args.push('-i',output);
  filters.push(`[${i+1}:a]aresample=48000,atempo=${tempo.toFixed(4)},adelay=${Math.round(voiceAt*1000)}:all=1[v${i}]`);
  lines.push({shot:i+1,atSeconds:voiceAt,text,voice,tempo,voiceLeadSeconds:lead});
  at+=shot.seconds;
  console.log(`Narrated shot ${i+1}/${shots.length} locally`);
}
filters.push('[0:a]'+shots.map((_,i)=>`[v${i}]`).join('')+`amix=inputs=${shots.length+1}:duration=first:normalize=0[a]`);
args.push('-filter_complex',filters.join(';'),'-map','[a]','-t',String(total),'-c:a','pcm_s16le',path.join(work,'voice-timeline.wav'));
execFileSync('ffmpeg',args,{stdio:'inherit'});
await writeFile(path.join(work,'voice-provenance.json'),JSON.stringify({engine:useEleven?'ElevenLabs':'Kokoro local ONNX',voice,lines},null,2)+'\n');
