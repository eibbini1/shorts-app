import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { synthesize } from '../media/voice/VoiceProvider.js';
import type { StillsSpec } from '../media/assemble/types.js';

/**
 * SRT + VTT subtitles and auto chapter timestamps from a stills spec, using the same timing math as the renderers
 * (LEAD 0.18 s before narration, TAIL 0.5 s after each scene). Uses the cached narration only: refuses to run if the
 * episode has no _voice cache, so it can never spend ElevenLabs characters by accident.
 *   npm run export-subs -- --spec episodes/menu-long.assemble.json --chapters "1:Jewelry on a plate,3:The most expensive dinner on Earth,5:Course 1: Saffron"
 * Upload the .srt in Studio (Subtitles > Add) for accessibility and search; paste the printed chapters into the description.
 */
const LEAD0 = 0.18;
const TAIL = 0.5;
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const specPath = path.resolve(root, arg('spec', '')!);
const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec;
const voiceDir = path.join(path.dirname(path.resolve(root, spec.output)), '_voice');
if (!existsSync(voiceDir) || readdirSync(voiceDir).length === 0) throw new Error(`no cached narration in ${voiceDir}; run voiceOnly first`);

type W = { word: string; start: number; end: number };
const cues: { start: number; end: number; text: string }[] = [];
const sceneStarts: number[] = [];
let cursor = 0;
for (const [si, sc] of spec.scenes.entries()) {
  const v = await synthesize(sc.text, voiceDir, spec.voice, true);
  sceneStarts.push(cursor);
  // mirror the renderer's tight-open trim so cues stay in sync
  const tight = !!spec.tightOpen && si === 0;
  const trim = tight ? Math.max(0, ((v.words as W[])[0]?.start ?? 0) - 0.03) : 0;
  const LEAD = tight ? 0.02 : LEAD0;
  const ws = (v.words as W[]).map((w) => ({ ...w, start: w.start - trim, end: w.end - trim }));
  v.durationSec -= trim;
  let g: W[] = [];
  const flush = () => {
    if (!g.length) return;
    cues.push({ start: cursor + LEAD + g[0]!.start, end: cursor + LEAD + g[g.length - 1]!.end + 0.15, text: g.map((w) => w.word).join(' ') });
    g = [];
  };
  for (const w of ws) {
    g.push(w);
    if (g.length >= 7 || /[.!?]$/.test(w.word) || (g.length >= 4 && /[,;:]$/.test(w.word))) flush();
  }
  flush();
  cursor += LEAD + v.durationSec + TAIL;
}
// never let a cue overlap the next one
for (let i = 0; i < cues.length - 1; i++) cues[i]!.end = Math.min(cues[i]!.end, cues[i + 1]!.start - 0.02);

const ts = (s: number, sep: string) => {
  const ms = Math.round(s * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
const base = specPath.replace(/\.assemble\.json$/, '');
await writeFile(base + '.srt', cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n'), 'utf8');
await writeFile(base + '.vtt', 'WEBVTT\n\n' + cues.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n'), 'utf8');
console.log(`wrote ${path.basename(base)}.srt / .vtt  (${cues.length} cues, ${cursor.toFixed(1)} s)`);

const ch = arg('chapters');
if (ch) {
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
  const items = ch.split(/,(?=\s*\d+:)/).map((x) => x.trim());
  const lines = items.map((it) => {
    const m = it.match(/^(\d+):(.*)$/)!;
    const n = Number(m[1]);
    const t = n <= 1 ? 0 : sceneStarts[n - 1]!;
    return `${mmss(t)} ${m[2]!.trim()}`;
  });
  if (!lines[0]!.startsWith('0:00')) console.log('WARNING: first chapter must start at 0:00');
  console.log('\nCHAPTERS\n' + lines.join('\n'));
}
