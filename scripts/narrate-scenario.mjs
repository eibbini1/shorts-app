import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { scenarioSettings, verifyScenario } from './scenario-schema.mjs';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run scenario:narrate -- SCENARIO.json');
const source = await readFile(file, 'utf8');
const draft = JSON.parse(source.replace(/^\uFEFF/, ''));
verifyScenario(draft.plan, scenarioSettings(draft.settings));
const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const voice = 'af_heart';
const speed = 1;
const digest = text => createHash('sha256').update(text).digest('hex');
const folder = path.resolve('storage/narration');
await mkdir(folder, { recursive: true });
let tts;
const shots = [];
for (const [index, shot] of draft.plan.shots.entries()) {
  const key = digest(JSON.stringify({ model, voice, speed, dtype: 'q8', text: shot.narration }));
  const output = path.join(folder, key + '.wav');
  const metadata = path.join(folder, key + '.json');
  const lock = await open(path.join(folder, key + '.lock'), 'wx');
  try {
    let result;
    try {
      result = JSON.parse(await readFile(metadata, 'utf8'));
      if (digest(await readFile(output)) !== result.audioHash) throw new Error('Narration cache checksum mismatch');
      console.log('Reused shot ' + index);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!tts) {
        const { KokoroTTS } = await import('../storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js');
        const { env } = await import('../storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js');
        env.cacheDir = path.resolve('storage/tools/kokoro/models');
        env.allowRemoteModels = false;
        tts = await KokoroTTS.from_pretrained(model, { dtype: 'q8', device: 'cpu' });
      }
      // Long takes can be silently truncated by the model tokenizer.
      if (shot.narration.length > 450) throw new Error('Split shot ' + index + ' into shorter narration takes (maximum 450 characters)');
      const audio = await tts.generate(shot.narration, { voice, speed });
      const temp = output + '.' + randomUUID() + '.wav';
      await audio.save(temp);
      const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', temp], { encoding: 'utf8' }));
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid generated narration duration');
      await rename(temp, output);
      result = { file: output, model, voice, speed, dtype: 'q8', text: shot.narration, durationSeconds: seconds, audioHash: digest(await readFile(output)), alignmentStatus: 'required' };
      const metaTemp = metadata + '.' + randomUUID() + '.tmp';
      await writeFile(metaTemp, JSON.stringify(result, null, 2));
      await rename(metaTemp, metadata);
      console.log('Generated shot ' + index + ' (' + seconds.toFixed(2) + ' seconds)');
    }
    shots.push({ ...result, shot: index, targetSeconds: shot.seconds, exceedsTarget: result.durationSeconds > shot.seconds });
  } finally { await lock.close(); await unlink(path.join(folder, key + '.lock')); }
}
const manifest = path.join(folder, digest(source) + '.manifest.json');
const temporary = manifest + '.' + randomUUID() + '.tmp';
await writeFile(temporary, JSON.stringify({ scenarioDigest: digest(source), status: 'alignment-required', shots }, null, 2));
await rename(temporary, manifest);
console.log('Narration manifest: ' + manifest);
