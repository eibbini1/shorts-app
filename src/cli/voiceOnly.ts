import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { synthesize } from '../media/voice/VoiceProvider.js';
import type { StillsSpec } from '../media/assemble/types.js';

/** Usage: npx tsx src/cli/voiceOnly.ts episodes/<ep>.assemble.json  -> pre-generates + caches narration (same cache the assembler uses). */
const specPath = path.resolve(process.cwd(), process.argv[2] ?? '');
const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec;
const dir = path.join(path.dirname(path.resolve(process.cwd(), spec.output)), '_voice');
for (const [i, sc] of spec.scenes.entries()) {
  const v = await synthesize(sc.text, dir, spec.voice);
  console.log(`scene ${i + 1}: ${v.durationSec.toFixed(2)}s, ${v.words.length} words -> ${v.audioFile}`);
}
console.log('VOICE_DONE');
