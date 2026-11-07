import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Anti-template guard (YouTube "inauthentic content": minimal variation between videos is not monetizable).
 *   npm run variation -- --spec episodes/x.assemble.json     (compare one spec against all others)
 * Exit 1 if the spec is too similar to an existing episode: same hook opener, same closing line,
 * near-duplicate hook text, or same scene count AND same closing line.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const grams = (s: string) => {
  const w = norm(s).split(' ');
  const g = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) g.add(w.slice(i, i + 3).join(' '));
  return g;
};
export const jaccard = (a: string, b: string) => {
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

export interface Fingerprint { hook: string; cta: string; scenes: number; opener: string }
export const fingerprint = (texts: string[]): Fingerprint => ({
  hook: texts[0] ?? '',
  cta: texts[texts.length - 1] ?? '',
  scenes: texts.length,
  opener: norm(texts[0] ?? '').split(' ').slice(0, 3).join(' '),
});

const lead = (f: Fingerprint) => norm(f.hook).split(' ').slice(0, 6).join(' ');

export function compare(a: Fingerprint, b: Fingerprint): string[] {
  const issues: string[] = [];
  if (a.opener && a.opener === b.opener) issues.push(`same opener "${a.opener}"`);
  // A shared 3-word opener only warns; the same first six words is a repeated opening line.
  if (lead(a).split(' ').length >= 4 && lead(a) === lead(b)) issues.push(`same opening line "${lead(a)}"`);
  if (norm(a.cta) === norm(b.cta)) issues.push('identical closing line');
  else if (jaccard(a.cta, b.cta) > 0.6) issues.push('near-identical closing line');
  if (jaccard(a.hook, b.hook) > 0.5) issues.push('near-duplicate hook text');
  return issues;
}

export const hardVariationIssues = (issues: string[]) => issues.filter(issue => !issue.startsWith('same opener '));

export async function checkVariation(specPath: string, episodesDir: string): Promise<{ other: string; issues: string[] }[]> {
  const load = async (p: string) => {
    const j = JSON.parse((await readFile(p, 'utf8')).replace(/^﻿/, '')) as { scenes?: { text: string }[] };
    return fingerprint((j.scenes ?? []).map((s) => s.text));
  };
  const me = await load(specPath);
  const hits: { other: string; issues: string[] }[] = [];
  for (const f of await readdir(episodesDir)) {
    if (!f.endsWith('.assemble.json')) continue;
    const full = path.join(episodesDir, f);
    if (path.resolve(full) === path.resolve(specPath)) continue;
    if (f.includes('menu-long')) continue; // landscape long-form, different format
    try {
      const issues = compare(me, await load(full));
      if (issues.length) hits.push({ other: f, issues });
    } catch { /* skip unreadable specs */ }
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--spec');
  const spec = path.resolve(process.cwd(), process.argv[i + 1] ?? '');
  const hits = await checkVariation(spec, path.dirname(spec));
  if (!hits.length) { console.log('variation OK: no template overlap with existing episodes'); process.exit(0); }
  for (const h of hits) console.log(`${hardVariationIssues(h.issues).length ? 'SIMILAR' : 'WARN common opening'} to ${h.other}: ${h.issues.join('; ')}`);
  if (!hits.some(h => hardVariationIssues(h.issues).length)) { console.log('variation OK: common opening phrases alone do not establish duplicated content'); process.exit(0); }
  console.log('VARIATION FAILED: rewrite the opener / closing line so each Short stands on its own.');
  process.exit(1);
}
