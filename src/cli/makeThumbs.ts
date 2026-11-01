import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { StillsSpec } from '../media/assemble/types.js';
import { spokenToDigits } from './viralUtils.js';

/**
 * Three thumbnail variants from a spec's own images (for A/B testing in Studio's "Test & compare").
 *   npm run make-thumbs -- --spec episodes/steak-ep1.assemble.json [--format landscape|portrait] [--headline "..."]
 * A = big price/claim on the opening image, B = the most luxurious image with a short punch word, C = question on the last image.
 * Output: <episode folder>/thumbs/thumb_A.jpg, thumb_B.jpg, thumb_C.jpg (under 2 MB, JPEG).
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const specPath = path.resolve(root, arg('spec', '')!);
const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec & { width?: number; height?: number };
const landscape = (arg('format') ?? ((spec.width ?? 0) > (spec.height ?? 1) ? 'landscape' : 'portrait')) === 'landscape';
const W = landscape ? 1280 : 1080;
const H = landscape ? 720 : 1920;
const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
const outDir = path.join(path.dirname(abs(spec.output)), 'thumbs');
await mkdir(outDir, { recursive: true });

const first = spec.scenes[0]!;
const luxe = spec.scenes.find((s) => /gold|diamond|caviar|truffle|wagyu/i.test(s.text)) ?? first;
const last = spec.scenes[spec.scenes.length - 1]!;
const priceMatch = spokenToDigits(first.text).match(/[$£€]\s?[\d,]+|[\d,]+ dirhams/i);
const headline = (arg('headline') ?? (priceMatch ? priceMatch[0].toUpperCase() : spokenToDigits(first.text).split(/[.?!]/)[0]!.toUpperCase())).trim();
const sub = (arg('sub') ?? (spec.kicker ?? '').toUpperCase()).trim();

const wrap = (t: string, n: number) => {
  const out: string[] = [];
  let line = '';
  for (const w of t.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3).join('\n');
};
const font = 'C\\:/Windows/Fonts/impact.ttf';
const variants: { id: string; image: string; main: string; small: string; color: string }[] = [
  { id: 'A', image: first.image, main: wrap(headline, landscape ? 14 : 11), small: sub, color: '0xF2C14E' },
  { id: 'B', image: luxe.image, main: wrap(priceMatch ? 'WORTH IT?' : 'REAL GOLD', 12), small: priceMatch ? priceMatch[0].toUpperCase() : 'EDIBLE', color: 'white' },
  { id: 'C', image: last.image, main: wrap('WOULD YOU PAY?', landscape ? 14 : 8), small: sub, color: '0xF2C14E' },
];
let ok = 0;
for (const v of variants) {
  const mainFile = path.join(outDir, `t_${v.id}_main.txt`);
  const smallFile = path.join(outDir, `t_${v.id}_small.txt`);
  await writeFile(mainFile, v.main, 'utf8');
  await writeFile(smallFile, v.small, 'utf8');
  const esc = (p: string) => p.replace(/\\/g, '/').replace(':', '\\:');
  const big = landscape ? 120 : 150;
  const small = landscape ? 54 : 64;
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=contrast=1.12:saturation=1.2,` +
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill,` +
    `drawtext=fontfile='${font}':textfile='${esc(mainFile)}':fontsize=${big}:fontcolor=${v.color}:borderw=9:bordercolor=black:line_spacing=6:x=${landscape ? 50 : 60}:y=${landscape ? 60 : 160},` +
    `drawtext=fontfile='${font}':textfile='${esc(smallFile)}':fontsize=${small}:fontcolor=white:borderw=6:bordercolor=black:x=${landscape ? 50 : 60}:y=h-${landscape ? 110 : 220}`;
  const out = path.join(outDir, `thumb_${v.id}.jpg`);
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', abs(v.image), '-vf', vf, '-frames:v', '1', '-q:v', '3', out], { encoding: 'utf8' });
  if (r.status === 0) { ok++; console.log(`wrote ${path.relative(root, out)}`); } else console.error(`variant ${v.id} failed: ${r.stderr}`);
}
if (ok < 3) process.exit(1);
