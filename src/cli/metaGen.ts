import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StillsSpec } from '../media/assemble/types.js';
import { spokenToDigits, scoreHook, pinnedComment, shortTitle } from './viralUtils.js';

/**
 * Upload metadata + viral-readiness score from a stills spec.
 *   npm run meta-gen -- --spec episodes/steak-ep1.assemble.json [--title "..."] [--region uk|us|in]
 * Writes episodes/<name>.meta.json and prints the hook score with fixes. Heuristics, not guarantees.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const specPath = path.resolve(root, arg('spec', '')!);
const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec;
const texts = spec.scenes.map((s) => s.text);
const all = texts.join(' ');
const first = texts[0] ?? '';
const last = texts[texts.length - 1] ?? '';

const KEYWORDS: [RegExp, string][] = [
  [/gold/i, 'edible gold'], [/saffron/i, 'saffron'], [/truffle/i, 'white truffle'], [/wagyu|kobe/i, 'A5 wagyu'],
  [/caviar/i, 'caviar'], [/burger/i, 'gold burger'], [/steak|tomahawk/i, 'gold steak'], [/biryani/i, 'gold biryani'],
  [/ice cream|scoop/i, 'gold ice cream'], [/cupcake/i, 'gold cupcake'], [/dessert|sundae/i, 'most expensive dessert'],
  [/dubai/i, 'Dubai'], [/london|liverpool|\buk\b/i, 'UK luxury food'], [/pizza/i, 'most expensive pizza'],
];
const tags = new Set<string>(['luxury food', 'most expensive food', 'billionaire food', 'Billionaire Bites', 'food facts', 'shorts']);
for (const [re, t] of KEYWORDS) if (re.test(all)) tags.add(t);
for (const k of spec.keywords ?? []) tags.add(k);

const { score, fixes, breakdown } = scoreHook(texts, spec.hookText);
const rawTitle = first.replace(/\s+Here's why\.?$/i, '').replace(/\.$/, '');
const title = shortTitle(arg('title') ?? spokenToDigits(rawTitle)) || spec.kicker || 'Luxury food';
const hashtags = ['#luxuryfood', ...[...tags].slice(6, 8).map((t) => '#' + t.replace(/\W+/g, '').toLowerCase()), '#shorts'];
const description = [
  spokenToDigits(`${first} ${last}`).replace(/\s+/g, ' ').trim(),
  '',
  ...(arg('bridge') ? [`Full story: ${arg('bridge')}`, ''] : []),
  "Follow Billionaire Bites for the world's most extraordinary food.",
  'Voiceover and visuals are AI-generated.',
  `Keywords: ${[...tags].slice(0, 12).join(', ')}`,
  hashtags.join(' '),
].join('\n');

const region = arg('region') ?? (/[£]|london|liverpool|(?:costs?|pay|price)[^.!?]{0,45}pounds/i.test(all) ? 'uk' : /dirham|biryani|rupee|india/i.test(all) ? 'in' : 'us');
const family = /illegal|banned|forbidden/i.test(all) ? 'taboo' : /only one|pick one|vs\.?\b/i.test(all) ? 'choice' : 'price';
const topic = spec.kicker || [...tags][6] || 'this';
const pinned = pinnedComment(family, topic);
const meta = { title, description, tags: [...tags], categoryId: '24', language: 'en', madeForKids: false, containsSyntheticMedia: true, region, hookScore: score, breakdown, fixes, pinnedComment: pinned, bridge: arg('bridge') ?? null };
const out = specPath.replace(/\.assemble\.json$/, '') + '.meta.json';
await writeFile(out, JSON.stringify(meta, null, 2), 'utf8');
console.log(`hook score ${score}/100  region=${region}\ntitle: ${title}\nbreakdown: ${JSON.stringify(breakdown)}`);
for (const f of fixes) console.log(' - fix: ' + f);
console.log(`pinned comment (post and pin right after publishing): ${pinned}`);
console.log(`wrote ${path.relative(root, out)}`);
