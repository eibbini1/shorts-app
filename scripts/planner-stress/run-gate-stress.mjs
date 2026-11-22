// Stress the deterministic action gate with novel ideas. usage: node scripts/planner-stress/run-gate-stress.mjs [--json]
import fs from 'node:fs';
import { hasVisiblePhysicalAction, requestedActionClauses } from '../story-action-gate.mjs';
const ideas = JSON.parse(fs.readFileSync(new URL('./ideas.json', import.meta.url), 'utf8'));
const byCat = {}; const misses = [];
for (const row of ideas) {
  const got = hasVisiblePhysicalAction(row.idea);
  const c = (byCat[row.category] ||= { n: 0, ok: 0, falseBlock: 0, falseAllow: 0 });
  c.n++;
  if (got === row.actionable) c.ok++;
  else { if (row.actionable) c.falseBlock++; else c.falseAllow++; misses.push({ category: row.category, idea: row.idea, expected: row.actionable, got, clauses: requestedActionClauses(row.idea) }); }
}
const total = ideas.length; const ok = Object.values(byCat).reduce((n, c) => n + c.ok, 0);
const out = { total, agree: ok, agreePct: Math.round((ok / total) * 100), byCategory: byCat, misses };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`agreement ${ok}/${total} (${out.agreePct}%)`);
  for (const [k, c] of Object.entries(byCat)) console.log(k.padEnd(9), `${c.ok}/${c.n}`, `falseBlock=${c.falseBlock} falseAllow=${c.falseAllow}`);
  for (const m of misses) console.log(`MISS [${m.category}] expected=${m.expected} got=${m.got} :: ${m.idea}`);
}
