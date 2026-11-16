#!/usr/bin/env node
/** Browse evidence-tagged food Short patterns and original production ideas. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/creative-evidence-bank.json'), 'utf8'));
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`${flag} needs a value`);
  return args[index + 1];
};
const patternId = value('--pattern');
const ideaId = value('--idea');
const asJson = args.includes('--json');
const allowed = new Set(['--pattern', '--idea', '--json']);
for (const arg of args) if (arg.startsWith('--') && !allowed.has(arg)) throw Error(`Unknown option: ${arg}`);

const sourceById = new Map(bank.sources.map((source) => [source.id, source]));
const patterns = bank.patterns.filter((item) => !patternId || item.id === patternId);
const ideas = bank.originalProductionIdeas.filter((item) => (!ideaId || item.id === ideaId) &&
  (!patternId || item.patternId === patternId));
if (patternId && !patterns.length) throw Error(`Unknown pattern: ${patternId}`);
if (ideaId && !bank.originalProductionIdeas.some((item) => item.id === ideaId)) throw Error(`Unknown idea: ${ideaId}`);
for (const pattern of patterns) for (const id of pattern.sourceIds) if (!sourceById.has(id)) throw Error(`Missing evidence source: ${id}`);
const result = {checkedAt: bank.checkedAt, scope: bank.scope, channelContext: bank.channelContext,
  patterns: patterns.map((pattern) => ({...pattern, sources: pattern.sourceIds.map((id) => sourceById.get(id))})),
  ideas};
if (asJson) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Food Short evidence bank | checked ${bank.checkedAt}`);
  console.log(bank.channelContext);
  for (const pattern of result.patterns) {
    console.log(`\n${pattern.name} [${pattern.id}] — ${pattern.evidenceConfidence}`);
    console.log(`  Hook: ${pattern.hookMechanism}`);
    console.log(`  Montage: ${pattern.montageDirection}`);
    console.log(`  Sound: ${pattern.proposedSound}`);
    console.log(`  Review: ${pattern.continuityGate}`);
    for (const source of pattern.sources) console.log(`  Evidence: ${source.title} (${source.channel}; ${source.vidiqSnapshot.breakoutMultiple}x channel breakout at scan) ${source.url}`);
  }
  console.log('\nOriginal ideas to develop:');
  for (const idea of ideas) console.log(`  ${idea.id}: ${idea.recipe} | ${idea.hook} | ${idea.status}`);
  console.log('\nA breakout multiple is historical channel-relative data, not a forecast of views.');
}
