import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { StillsSpec } from '../media/assemble/types.js';

/**
 * One command from spec to publish pack:
 *   npm run pipeline -- --spec episodes/menu-cut-burger.assemble.json [--skip-render] [--allow-voice-spend]
 * Steps: voice-cache guard -> render -> QA gate -> meta (title/description/tags/score) -> 3 thumbnails -> SRT/VTT
 * Writes episodes/<name>.pack.json listing every file to upload. Stops at the first hard failure.
 * The voice-cache guard refuses to render when narration is not cached (it would spend ElevenLabs characters)
 * unless --allow-voice-spend is passed.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const specRel = arg('spec', '')!;
const specPath = path.resolve(root, specRel);
const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec & { width?: number; height?: number };
const landscape = (spec.width ?? 0) > (spec.height ?? 1);
const out = path.resolve(root, spec.output);
const base = specPath.replace(/\.assemble\.json$/, '');
const voiceDir = path.join(path.dirname(out), '_voice');

const sh = (label: string, script: string, args: string[]) => {
  console.log(`\n== ${label}`);
  const r = spawnSync('cmd', ['/c', 'npx', 'tsx', script, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const text = (r.stdout ?? '') + (r.stderr ?? '');
  const tail = text.trim().split(/\r?\n/).slice(-12).join('\n');
  console.log(tail);
  if (r.status !== 0) {
    console.error(`\nPIPELINE STOPPED at "${label}" (exit ${r.status})`);
    process.exit(1);
  }
  return text;
};

// Anti-template guard (YouTube inauthentic-content policy): refuse near-duplicates of existing episodes
if (!process.argv.includes('--skip-variation')) sh('variation guard', 'src/cli/variation.ts', ['--spec', specRel]);

// Match each scene's text against the cached narration word-for-word, so the guard knows exactly which lines would be billed.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const cachedTexts = new Set<string>();
if (existsSync(voiceDir)) {
  for (const f of readdirSync(voiceDir).filter((x) => x.endsWith('.json'))) {
    try {
      const j = JSON.parse(await readFile(path.join(voiceDir, f), 'utf8')) as { words?: { word: string }[] };
      if (j.words) cachedTexts.add(norm(j.words.map((w) => w.word).join(' ')));
    } catch { /* ignore broken cache entries */ }
  }
}
const missing = spec.scenes.filter((s) => spec.voice.provider === 'elevenlabs' && !cachedTexts.has(norm(s.text)));
const chars = missing.reduce((n, s) => n + s.text.length, 0);
console.log(`voice cache: ${spec.scenes.length - missing.length}/${spec.scenes.length} scene line(s) cached; ${missing.length} would cost ${chars} ElevenLabs characters`);
if (!process.argv.includes('--skip-render')) {
  if (missing.length && !process.argv.includes('--allow-voice-spend')) {
    console.error('Uncached narration lines would spend ElevenLabs characters:\n - ' + missing.map((s) => s.text).join('\n - ') + '\nRe-run with --allow-voice-spend to approve.');
    process.exit(1);
  }
  sh('render', 'src/cli/assembleEpisode.ts', ['--spec', specRel]);
}
sh('QA gate', 'src/cli/qaCheck.ts', ['--video', spec.output, '--expect', landscape ? 'landscape' : 'portrait']);
sh('metadata', 'src/cli/metaGen.ts', ['--spec', specRel, ...(arg('bridge') ? ['--bridge', arg('bridge')!] : [])]);
sh('thumbnails', 'src/cli/makeThumbs.ts', ['--spec', specRel]);
sh('subtitles', 'src/cli/exportSubs.ts', ['--spec', specRel]);

const meta = JSON.parse(await readFile(base + '.meta.json', 'utf8')) as { title: string; hookScore: number; region: string; pinnedComment?: string };
const pack = {
  video: spec.output,
  thumbnails: ['A', 'B', 'C'].map((v) => path.join(path.dirname(spec.output), 'thumbs', `thumb_${v}.jpg`).replace(/\\/g, '/')),
  subtitles: [path.relative(root, base + '.srt').replace(/\\/g, '/'), path.relative(root, base + '.vtt').replace(/\\/g, '/')],
  meta: path.relative(root, base + '.meta.json').replace(/\\/g, '/'),
  title: meta.title,
  hookScore: meta.hookScore,
  pinnedComment: meta.pinnedComment,
  region: meta.region,
  builtAt: new Date().toISOString(),
};
await writeFile(base + '.pack.json', JSON.stringify(pack, null, 2), 'utf8');
console.log(`\nPACK READY: ${path.relative(root, base + '.pack.json')}  "${meta.title}"  hook ${meta.hookScore}/100`);
