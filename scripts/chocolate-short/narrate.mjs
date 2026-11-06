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
  { text: 'The gold is only the beginning. What is hiding beneath this chocolate shell?', caption: 'WHAT IS INSIDE?', visual: 'motion' },
  { text: 'The spoon moves closer. One gentle touch, and the moment changes.', caption: 'WAIT FOR IT', visual: 'opening' },
  { text: 'Now look inside. Dark chocolate opens around a soft pistachio center.', caption: 'THE REVEAL', visual: 'reveal' },
  { text: 'A bright ribbon of raspberry runs through the middle. Crisp, creamy, and a little tart.', caption: 'PISTACHIO + RASPBERRY', visual: 'reveal-detail' },
  { text: 'One spoonful brings all three layers together. Which part would you taste first?', caption: 'YOUR FIRST BITE?', visual: 'reveal-spoon' },
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
