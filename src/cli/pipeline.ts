import { loadSpec, inputDigest, fileDigest, atomicJson } from '../automation/spec.js';
import { readCachedVoice } from '../media/voice/VoiceProvider.js';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { StillsSpec } from '../media/assemble/types.js';
import { buildHookRow, appendHookRow } from '../services/hookLog.js';

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
const specRel = arg('spec');
if (!specRel || specRel.startsWith('--')) throw new Error('Usage: npm run pipeline -- --spec episodes/name.assemble.json');
const specPath = path.resolve(root, specRel);
const spec = await loadSpec(specPath, root);
let fingerprint = await inputDigest(specPath, spec, root);
const landscape = (spec.width ?? 0) > (spec.height ?? 1);
const out = path.resolve(root, spec.output);
const base = specPath.replace(/\.assemble\.json$/, '');
const voiceDir = path.join(path.dirname(out), '_voice');
const receiptFile = path.join(path.dirname(out), '.render-receipt.json');
let resumeRender = false;
if (process.argv.includes('--resume')) {
  try {
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
    resumeRender = receipt.inputDigest === fingerprint && receipt.videoDigest === await fileDigest(out);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
}

const sh = (label: string, script: string, args: string[]) => {
  console.log(`\n== ${label}`);
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: root, env: { ...process.env, VOICE_CACHE_ONLY: process.argv.includes('--allow-voice-spend') ? '0' : '1' }, encoding: 'utf8', maxBuffer: 1 << 28 });
  const text = (r.stdout ?? '') + (r.stderr ?? '');
  const tail = text.trim().split(/\r?\n/).slice(-12).join('\n');
  console.log(tail);
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`\nPIPELINE STOPPED at "${label}" (exit ${r.status})`);
    process.exit(1);
  }
  return text;
};

// Anti-template guard (YouTube inauthentic-content policy): refuse near-duplicates of existing episodes
if (!process.argv.includes('--skip-variation')) sh('variation guard', 'src/cli/variation.ts', ['--spec', specRel]);

const metadataArgs = ['--spec', specRel, ...(arg('bridge') ? ['--bridge', arg('bridge')!] : [])];
const minimumArg = arg('min-hook-score');
if (process.argv.includes('--min-hook-score')) {
  const minimum = Number(minimumArg);
  if (!minimumArg || !/^\d+$/.test(minimumArg) || minimum > 100) {
    throw new Error('--min-hook-score requires an integer from 0 to 100');
  }
  sh('hook score gate', 'src/cli/metaGen.ts', metadataArgs);
  const { hookScore } = JSON.parse(await readFile(base + '.meta.json', 'utf8')) as { hookScore: number };
  if (!Number.isFinite(hookScore) || hookScore < minimum) {
    throw new Error(`Hook score ${hookScore}/100 is below ${minimum}/100. Revise the hook and payoff before rendering.`);
  }
}

// Exact text and voice settings must match the provider cache key.
const missing = [];
for (const scene of spec.scenes) {
  if (!scene.narration && spec.voice.provider === 'elevenlabs' && !await readCachedVoice(scene.text, voiceDir, spec.voice)) missing.push(scene);
}
const chars = missing.reduce((n, s) => n + s.text.length, 0);
console.log(`voice cache: ${spec.scenes.length - missing.length}/${spec.scenes.length} scene line(s) cached; ${missing.length} would cost ${chars} ElevenLabs characters`);
if (!process.argv.includes('--skip-render') && !resumeRender) {
  if (missing.length && !process.argv.includes('--allow-voice-spend')) {
    console.error('Uncached narration lines would spend ElevenLabs characters:\n - ' + missing.map((s) => s.text).join('\n - ') + '\nRe-run with --allow-voice-spend to approve.');
    process.exit(1);
  }
  sh('render', 'src/cli/assembleEpisode.ts', ['--spec', specRel]);
  fingerprint = await inputDigest(specPath, spec, root);
  await atomicJson(receiptFile, { inputDigest: fingerprint, videoDigest: await fileDigest(out) });
}
sh('QA gate', 'src/cli/qaCheck.ts', ['--video', spec.output, '--expect', landscape ? 'landscape' : 'portrait', '--report', base + '.qa.json', ...(spec.requireMotion ? ['--require-motion'] : [])]);
if (minimumArg === undefined) sh('metadata', 'src/cli/metaGen.ts', metadataArgs);
sh('thumbnails', 'src/cli/makeThumbs.ts', ['--spec', specRel]);
sh('subtitles', 'src/cli/exportSubs.ts', ['--spec', specRel]);

const meta = JSON.parse(await readFile(base + '.meta.json', 'utf8')) as { title: string; hookScore: number; region: string; pinnedComment?: string };
const pack = {
  video: spec.output,
  thumbnails: ['A', 'B', 'C'].map((v) => path.join(path.dirname(spec.output), 'thumbs', `thumb_${v}.jpg`).replace(/\\/g, '/')),
  subtitles: [path.relative(root, base + '.srt').replace(/\\/g, '/'), path.relative(root, base + '.vtt').replace(/\\/g, '/')],
  qa: path.relative(root, base + '.qa.json').replace(/\\/g, '/'),
  meta: path.relative(root, base + '.meta.json').replace(/\\/g, '/'),
  title: meta.title,
  hookScore: meta.hookScore,
  pinnedComment: meta.pinnedComment,
  region: meta.region,
  inputDigest: fingerprint,
  builtAt: new Date().toISOString(),
};
const artifacts = [pack.video, ...pack.thumbnails, ...pack.subtitles, pack.meta, pack.qa];
const artifactDigests: Record<string, string> = {};
for (const artifact of artifacts) {
  const file = path.resolve(root, artifact);
  const info = await stat(file);
  if (!info.isFile() || !info.size) throw new Error('Missing or empty pack artifact: ' + artifact);
  artifactDigests[artifact] = await fileDigest(file);
}
// Hook log: one row per Short (first spoken line + tags). Results are filled in later from Studio.
const hookRow = buildHookRow(path.basename(spec.output), spec);
if (hookRow) {
  const wrote = await appendHookRow(path.join(root, 'episodes', 'hook-log.jsonl'), hookRow);
  console.log(`hook log: ${wrote ? 'logged' : 'already logged'} "${hookRow.first_line}" [${hookRow.tags.join(', ') || 'no tags'}]`);
}
await atomicJson(base + '.pack.json', { ...pack, artifactDigests });
console.log(`\nPACK READY: ${path.relative(root, base + '.pack.json')}  "${meta.title}"  hook ${meta.hookScore}/100`);
