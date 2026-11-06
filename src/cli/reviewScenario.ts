import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compare, fingerprint } from './variation.js';
import { atomicJson } from '../automation/spec.js';

interface Scenario {
  status: string;
  settings?: { brand?: string };
  plan: { title: string; hook: string; payoff: string; shots: { narration: string; seconds: number }[]; claimsToCheck: string[] };
}
const file = process.argv[2];
if (!file) throw new Error('Usage: npm run scenario:review -- drafts/generated/ID.local-scenario.json');
const text = await readFile(file, 'utf8');
const draft = JSON.parse(text.replace(/^\uFEFF/, '')) as Scenario;
if (!draft.plan?.shots?.length || !Array.isArray(draft.plan.claimsToCheck)) throw new Error('A complete local scenario is required');
const brand = draft.settings?.brand ?? 'Billionaire Bites';
const current = fingerprint(draft.plan.shots.map(shot => shot.narration));
const repetitions: { file: string; issues: string[] }[] = [];
const unreadable: string[] = [];
for (const name of await readdir(path.dirname(file))) {
  if (!name.endsWith('.local-scenario.json')) continue;
  const otherFile = path.join(path.dirname(file), name);
  if (path.resolve(otherFile) === path.resolve(file)) continue;
  let other: Scenario;
  try { other = JSON.parse((await readFile(otherFile, 'utf8')).replace(/^\uFEFF/, '')) as Scenario; }
  catch { unreadable.push(name); continue; }
  if ((other.settings?.brand ?? 'Billionaire Bites') !== brand) continue;
  if (!other.plan?.shots?.length) { unreadable.push(name); continue; }
  const issues = compare(current, fingerprint(other.plan.shots.map(shot => shot.narration)));
  if (other.plan.title.trim().toLowerCase() === draft.plan.title.trim().toLowerCase()) issues.push('identical title');
  if (issues.length) repetitions.push({ file: name, issues });
}
const narrationWarnings = draft.plan.shots.flatMap((shot, index) => {
  const words = shot.narration.trim().split(/\s+/).length;
  return words / shot.seconds > 3.2 ? [{ shot: index, words, seconds: shot.seconds, issue: 'Narration may exceed the shot duration' }] : [];
});
const digest = createHash('sha256').update(text).digest('hex');
const report = {
  scenario: path.resolve(file), digest, brand, reviewedAt: new Date().toISOString(),
  status: 'editorial-review-required', repetitions, unreadable, narrationWarnings,
  claims: draft.plan.claimsToCheck.map(claim => ({ claim, status: 'source-review-required', sources: [] })),
  factsVerified: false, publishingApproved: false,
  limits: ['Compares local scenario drafts in the same directory and brand.', 'Claims are supplied by the model and may be incomplete; a human must review the full script.', 'No source fetching or factual verification is performed.'],
};
await mkdir('storage/reviews', { recursive: true });
const output = path.join('storage/reviews', digest + '.json');
await atomicJson(output, report);
console.log(JSON.stringify({ output, repetitions: repetitions.length, narrationWarnings: narrationWarnings.length, claims: report.claims.length, status: report.status }, null, 2));
