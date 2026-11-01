import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Assign publish slots from regional peak windows (UTC). Max 3 per day, region-matched first.
 *   npm run plan-schedule -- --metas "episodes/a.meta.json,episodes/b.meta.json" --start 2026-11-02 [--tz 3]
 * Slots: IN = 14:30 UTC (India 8pm, UK 2:30pm, US East 9:30am), UK = 19:00 UTC (UK 7pm, US East 2pm, CA 2pm),
 * US = 00:00 UTC next day (US East 7pm, US West 4pm). Replace with Studio's "when your viewers are on YouTube" once there is data.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const metas = (arg('metas', '')!).split(',').map((s) => s.trim()).filter(Boolean);
const start = new Date(`${arg('start')}T00:00:00Z`);
const tz = Number(arg('tz', '3')); // Amman = UTC+3
if (!metas.length || Number.isNaN(start.getTime())) throw new Error('need --metas a.json,b.json and --start YYYY-MM-DD');

const SLOTS: Record<string, { hh: number; mm: number; dayShift: number; label: string }> = {
  in: { hh: 14, mm: 30, dayShift: 0, label: 'India 8pm / UK 2:30pm / US East 9:30am' },
  uk: { hh: 19, mm: 0, dayShift: 0, label: 'UK 7pm / US East 2pm / Canada 2pm' },
  us: { hh: 0, mm: 0, dayShift: 1, label: 'US East 7pm / US West 4pm' },
};
const loaded = await Promise.all(metas.map(async (m) => ({ file: m, meta: JSON.parse(await readFile(path.resolve(root, m), 'utf8')) as { title: string; region: string; hookScore: number } })));
loaded.sort((a, b) => b.meta.hookScore - a.meta.hookScore);
const used = new Set<string>();
const plan = loaded.map((x) => {
  const order = [x.meta.region, 'uk', 'us', 'in'];
  for (let day = 0; day < 30; day++) {
    for (const r of order) {
      const s = SLOTS[r]!;
      const when = new Date(start.getTime() + (day + s.dayShift) * 86400000 + (s.hh * 60 + s.mm) * 60000);
      const key = `${day}-${r}`;
      if (used.has(key)) continue;
      used.add(key);
      return { file: x.file, title: x.meta.title, region: x.meta.region, publishAtUtc: when.toISOString(), local: new Date(when.getTime() + tz * 3600000).toISOString().replace('T', ' ').slice(0, 16), window: s.label };
    }
  }
  throw new Error('no slot');
});
plan.sort((a, b) => a.publishAtUtc.localeCompare(b.publishAtUtc));
await writeFile(path.join(root, 'episodes', 'schedule.plan.json'), JSON.stringify(plan, null, 2), 'utf8');
for (const p of plan) console.log(`${p.publishAtUtc}  (local UTC${tz >= 0 ? '+' : ''}${tz}: ${p.local})  ${p.title}  [${p.window}]`);
