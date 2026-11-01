import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { assembleEpisode } from '../media/assemble/assembleEpisode.js';
import { assembleStills } from '../media/assemble/stillsEpisode.js';
import { assembleStillsLong } from '../media/assemble/stillsLong.js';

/**
 * Usage: npm run assemble-abdul -- --spec episodes/chicago-ep1.assemble.json
 * Builds the finished Short from pre-made Flow/Veo clips (voices kept) + hook, text and SFX.
 */
const i = process.argv.indexOf('--spec');
const spec = i >= 0 ? process.argv[i + 1] : undefined;
if (!spec) {
  console.error('Usage: npm run assemble-abdul -- --spec episodes/<episode>.assemble.json');
  process.exit(1);
}
const root = process.cwd();
const specPath = path.resolve(root, spec);
readFile(specPath, 'utf8')
  .then((txt) => { const j = JSON.parse(txt.replace(/^﻿/, '')) as { kind?: string; width?: number; height?: number }; if (j.kind === 'stills') return (j.width ?? 0) > (j.height ?? 0) ? assembleStillsLong(specPath, root) : assembleStills(specPath, root); return assembleEpisode(specPath, root); })
  .then((out) => console.log(`\n✅ Episode ready: ${out}`))
  .catch((e) => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1); });
