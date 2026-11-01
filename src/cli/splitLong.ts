import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assembleStills } from '../media/assemble/stillsEpisode.js';
import type { StillsSpec } from '../media/assemble/types.js';

/**
 * Cut portrait Shorts out of a long landscape stills spec by scene ranges. Narration is reused from the
 * long video's voice cache (same text + voice settings = same cache key), so cuts cost 0 ElevenLabs characters.
 *
 *   npm run split-long -- --spec episodes/menu-long.assemble.json --prefix menu-cut \
 *        --cuts "saffron:5-9,truffle:10-13,wagyu:14-17,burger:18-21,dessert:25-27+30" [--render]
 *
 * Scene numbers are 1-based as in the spec. "a-b+c" joins a range and single scenes.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const specPath = path.resolve(root, arg('spec', 'episodes/menu-long.assemble.json')!);
const prefix = arg('prefix', 'cut')!;
const cutsArg = arg('cuts', '')!;
const render = process.argv.includes('--render');
if (!cutsArg) throw new Error('--cuts "name:5-9,name2:10-13" is required');

const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec & { scenes: { motion?: string }[] };
const portraitMotion: Record<string, 'in' | 'out' | 'left' | 'right'> = {
  in: 'in', out: 'out', left: 'left', right: 'right', hook: 'in', reveal: 'out', side: 'left', tiltdown: 'in', tiltup: 'out', diag: 'right',
};
/** --hooks episodes/menu-cut.hooks.json  ->  { "burger": { "hook": "This burger is covered in real gold.", "cta": "Would you take a bite? Follow for more.", "hookImage": "optional path" } } */
const hooksArg = arg('hooks');
const hooks: Record<string, { hook?: string; hookText?: string; cta?: string; hookImage?: string; ctaImage?: string }> = hooksArg
  ? JSON.parse((await readFile(path.resolve(root, hooksArg), 'utf8')).replace(/^﻿/, ''))
  : {};
if (hooksArg && process.argv.includes('--mock-voice')) spec.voice = { ...spec.voice, provider: 'mock' }; // test renders without spending credits
const srcVoice = path.join(path.dirname(path.resolve(root, spec.output)), '_voice');

for (const cut of cutsArg.split(',').map((s) => s.trim()).filter(Boolean)) {
  const [name, ranges] = cut.split(':');
  if (!name || !ranges) throw new Error(`bad cut "${cut}"`);
  const idx: number[] = [];
  for (const part of ranges.split('+')) {
    const [a, b] = part.split('-').map(Number);
    for (let n = a!; n <= (b ?? a!); n++) idx.push(n);
  }
  const scenes = idx.map((n, k) => {
    const s = spec.scenes[n - 1];
    if (!s) throw new Error(`scene ${n} does not exist`);
    const m = portraitMotion[(s as { motion?: string }).motion ?? 'in'] ?? 'in';
    return { image: s.image, text: s.text, motion: k === 0 ? ('in' as const) : m };
  });
  // Optional punchy opener / closer per cut (new lines cost ElevenLabs characters; reused cut lines cost none).
  const h = hooks[name];
  if (h?.hook) scenes.unshift({ image: h.hookImage ?? scenes[0]!.image, text: h.hook, motion: 'in' as const });
  if (h?.cta) scenes.push({ image: h.ctaImage ?? scenes[scenes.length - 1]!.image, text: h.cta, motion: 'out' as const });
  const out = `storage/episodes/${prefix}-${name}/${prefix}-${name}-final.mp4`;
  const cutSpec: StillsSpec = { ...spec, output: out, kicker: name.replace(/-/g, ' ').toUpperCase(), scenes: scenes as StillsSpec['scenes'] };
  if (h?.hook) { cutSpec.tightOpen = true; if (h.hookText) cutSpec.hookText = h.hookText; } // v2: sound + text from frame 0
  delete (cutSpec as { width?: number }).width;
  delete (cutSpec as { height?: number }).height;
  const specOut = path.join(root, 'episodes', `${prefix}-${name}.assemble.json`);
  await writeFile(specOut, JSON.stringify(cutSpec, null, 2), 'utf8');
  const dstVoice = path.join(root, path.dirname(out), '_voice');
  await mkdir(dstVoice, { recursive: true });
  await cp(srcVoice, dstVoice, { recursive: true }); // reuse cached narration
  console.log(`wrote ${path.relative(root, specOut)} (${scenes.length} scenes)`);
  if (render) {
    const f = await assembleStills(specOut, root);
    console.log(`rendered ${f}`);
  }
}
