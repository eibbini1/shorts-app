import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
const read = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const [scenarioFile, manifestFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw new Error('Usage: node scripts/local-media-export.mjs SCENARIO APPROVED_MANIFEST OUTPUT_SPEC');
const { plan, settings = { brand: 'Billionaire Bites', format: 'short' } } = await read(scenarioFile);
const manifest = await read(manifestFile);
if (manifest.shots.length !== plan.shots.length) throw new Error('One approved clip and narration per scenario shot required');
const scenes = [];
for (const [index, shot] of plan.shots.entries()) {
  const approved = manifest.shots[index];
  if (approved.approved !== true || !approved.narration?.words?.length) throw new Error('Each shot requires explicit approval and aligned narration');
  if (approved.narration.words.map(item => item.word.trim()).join(' ') !== shot.narration.trim().replace(/\s+/g, ' ')) throw new Error('Narration timings must match scenario text');
  await access(approved.video);
  await access(approved.narration.file);
  scenes.push({ image: '', video: path.resolve(approved.video), text: shot.narration, narration: { ...approved.narration, file: path.resolve(approved.narration.file) }, transition: 'fade', colorGrade: settings.brand === 'Billionaire Bites' ? 'food' : 'natural' });
}
await writeFile(outputFile, JSON.stringify({
  kind: 'stills', requireMotion: true, output: manifest.output, fps: 24, ...(settings.format === 'long' ? { width: 1920, height: 1080 } : {}),
  voice: { provider: 'mock' }, hookText: plan.hook, brand: { name: settings.brand },
  music: 'ambient', musicVolume: 0.08, scenes,
}, null, 2), { flag: 'wx' });
console.log('Review assembly spec saved. Run npm run assemble-abdul -- --spec ' + outputFile);
