import { appendFile, readFile, mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Hook log: one JSON line per published Short, so every opening line can be compared later.
 * Tags are descriptive only (see episodes/hook-log notes). No weights, no gate.
 * Results (views at 24 h / 72 h, average % viewed at 3 s) are filled in later from Studio.
 */

export const HOOK_TAGS = ['PRICE', 'CHOICE', 'TENSION', 'CRAVING', 'GOLD', 'QUESTION'] as const;
export type HookTag = (typeof HOOK_TAGS)[number];

export interface HookLogRow {
  short: string;
  first_line: string;
  tags: HookTag[];
  logged_at: string;
  views_24h: number | null;
  views_72h: number | null;
  avg_pct_viewed_3s: number | null;
}

const RULES: Array<[HookTag, RegExp]> = [
  ['PRICE', /[$£€]|\d|million|thousand|billion|dollar|yen|dirham|pound|price|cost|worth/i],
  ['CHOICE', /\bpick\b|would you|guess|choose|yes or no|comment|which one|or your/i],
  ['TENSION', /banned|illegal|forbidden|taboo|secret|hidden|cruel|scam|ugly/i],
  ['CRAVING', /taste|texture|melt|crisp|bite|smell|sizzl|juicy|sweet|creamy|steam|sound|soft|bursts/i],
  ['GOLD', /\bgold\b|karat|24k/i],
  ['QUESTION', /\?/],
];

/** Pure: tags for one opening line. Same line always gives the same tags. */
export function tagHook(firstLine: string): HookTag[] {
  return RULES.filter(([, re]) => re.test(firstLine)).map(([tag]) => tag);
}

/** Pure: build a row from a stills spec (first scene = the hook). Returns null if there is no opening line. */
export function buildHookRow(short: string, spec: { scenes?: { text?: string }[] }, now = new Date()): HookLogRow | null {
  const first = spec.scenes?.[0]?.text?.trim();
  if (!first) return null;
  return {
    short,
    first_line: first,
    tags: tagHook(first),
    logged_at: now.toISOString(),
    views_24h: null,
    views_72h: null,
    avg_pct_viewed_3s: null,
  };
}

/** Appends the row as one JSON line, skipping a Short that is already logged. Returns true if written. */
export async function appendHookRow(logFile: string, row: HookLogRow): Promise<boolean> {
  await mkdir(path.dirname(logFile), { recursive: true });
  const lockFile = logFile + '.lock';
  let lock;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await open(lockFile, 'wx'); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  if (!lock) throw new Error('Hook log is locked; inspect ' + lockFile);
  try {
  const existing = await readFile(logFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const already = existing.split(/\r?\n/).some((line) => {
    if (!line.trim()) return false;
    try {
      return (JSON.parse(line) as HookLogRow).short === row.short;
    } catch {
      return false;
    }
  });
  if (already) return false;
  await appendFile(logFile, (existing && !existing.endsWith('\n') ? '\n' : '') + JSON.stringify(row) + '\n', 'utf8');
  return true;
  } finally { await lock.close(); await rm(lockFile, { force: true }); }
}
