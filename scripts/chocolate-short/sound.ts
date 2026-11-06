import { writeAmbientBed, writeSfxWav } from '../../src/media/assemble/sfx.ts';

const root = process.env.CHOCOLATE_WORK_DIR || 'storage/chocolate-short-local';
async function main() {
await writeAmbientBed(root + '/ambient.wav', 30);
await writeSfxWav(root + '/sfx.wav', [
  { t: 0.10, kind: 'sparkle', gain: 0.10 },
  { t: 3.65, kind: 'pop', freq: 610, gain: 0.16 },
  { t: 4.40, kind: 'pop', freq: 460, gain: 0.22 },
  { t: 7.65, kind: 'whoosh', gain: 0.13 },
  { t: 14.75, kind: 'sparkle', gain: 0.06 },
  { t: 22.00, kind: 'whoosh', gain: 0.08 },
], 30);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
