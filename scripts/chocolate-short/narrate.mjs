import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = path.resolve(process.env.CHOCOLATE_WORK_DIR || 'storage/chocolate-short-local');
const { KokoroTTS } = await import(path.join(root, 'storage/tools/kokoro/node_modules/kokoro-js/dist/kokoro.js'));
const { env } = await import(path.join(root, 'storage/tools/kokoro/node_modules/@huggingface/transformers/src/transformers.js'));
env.cacheDir = path.join(root, 'storage/tools/kokoro/models');
env.allowRemoteModels = false;
await mkdir(out, { recursive: true });

const scenes = [
  { text: 'A golden shell. One spoon. Watch what happens inside.', caption: 'WATCH CLOSELY', visual: 'approach' },
  { text: 'The shell breaks. Pistachio cream stretches as the spoon lifts.', caption: 'PISTACHIO CENTER', visual: 'lift' },
  { text: 'Then the raspberry center brings a bright, tart surprise.', caption: 'RASPBERRY REVEAL', visual: 'ribbon' },
  { text: 'Watch the layers fold together: crisp chocolate, cream, and fruit.', caption: 'THREE TEXTURES', visual: 'scoop' },
  { text: 'One glossy bite carries all three textures toward you.', caption: 'THE PERFECT BITE', visual: 'hero' },
  { text: 'Tart raspberry balances rich pistachio and dark chocolate.', caption: 'TART BALANCES RICH', visual: 'finish' },
];

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
for (let i = 0; i < scenes.length; i++) {
  const file = path.join(out, `voice-${String(i + 1).padStart(2, '0')}.wav`);
  const audio = await tts.generate(scenes[i].text, { voice: 'af_heart', speed: 1 });
  await audio.save(file);
  scenes[i].audio = file;
}
await writeFile(path.join(out, 'scenes.json'), JSON.stringify(scenes, null, 2) + '\n');
console.log(path.join(out, 'scenes.json'));
