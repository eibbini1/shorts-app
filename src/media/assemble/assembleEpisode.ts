import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, getMediaDuration } from '../shared/ffmpegExec.js';
import { logger } from '../../shared/logger.js';
import { COLORS, ensureFont, makeChip, makePill, makeText, renderOverlay, type OverlayItem } from './overlayRenderer.js';
import { writeSfxWav, type SfxCue } from './sfx.js';
import type { AssembleSpec } from './types.js';

const SHOT = 5 / 24; // each teaser flash = 5 frames @24fps

/**
 * Assembles pre-made Veo/Flow clips (native voices kept) into a finished Short:
 * fast teaser-flash hook -> punch-in gasp -> clips, with kid-style place stamps,
 * reaction words, a progress chip and synthesized original SFX.
 */
export async function assembleEpisode(specPath: string, repoRoot: string): Promise<string> {
  const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^\uFEFF/, '')) as AssembleSpec;
  const fps = spec.fps ?? 24;
  const W = spec.width ?? 720;
  const H = spec.height ?? 1280;
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
  const out = abs(spec.output);
  const tmp = path.join(path.dirname(out), '_assemble');
  await mkdir(tmp, { recursive: true });
  ensureFont(repoRoot);

  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k'];
  const parts: string[] = [];
  const clipFiles = spec.clips.map((c) => abs(c.file));
  const clipDur = await Promise.all(clipFiles.map((f) => getMediaDuration(f)));

  // 1) Teaser flash cuts (silent, punch-in zoom each)
  const teaser = spec.teaser ?? [];
  for (let i = 0; i < teaser.length; i++) {
    const s = teaser[i]!;
    const src = clipFiles[s.clip];
    if (!src) throw new Error(`teaser[${i}] references missing clip ${s.clip}`);
    const f = path.join(tmp, `t${i}.mp4`);
    await runFfmpeg([
      '-ss', String(s.at), '-i', src, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(SHOT),
      '-filter_complex', `[0:v]scale=w='trunc(${W}*(1+0.45*t/${SHOT})/2)*2':h=-2:eval=frame,crop=${W}:${H},fps=${fps}[v]`,
      '-map', '[v]', '-map', '1:a', '-shortest', ...enc, f,
    ]);
    parts.push(f);
  }
  const t0 = teaser.length * SHOT;

  // 2) Clips (optional punch-in on the first N seconds), normalised to the same fps/audio
  for (let i = 0; i < spec.clips.length; i++) {
    const c = spec.clips[i]!;
    const src = clipFiles[i]!;
    if (c.punchInSec && c.punchInSec > 0) {
      const z = c.punchInZoom ?? 0.16;
      const a = path.join(tmp, `c${i}a.mp4`);
      const b = path.join(tmp, `c${i}b.mp4`);
      await runFfmpeg([
        '-i', src, '-t', String(c.punchInSec),
        '-filter_complex', `[0:v]scale=w='trunc(${W}*(1+${z}*t/${c.punchInSec})/2)*2':h=-2:eval=frame,crop=${W}:${H},fps=${fps}[v]`,
        '-map', '[v]', '-map', '0:a', ...enc, a,
      ]);
      await runFfmpeg(['-ss', String(c.punchInSec), '-i', src, '-vf', `fps=${fps}`, ...enc, b]);
      parts.push(a, b);
    } else {
      const f = path.join(tmp, `c${i}.mp4`);
      await runFfmpeg(['-i', src, '-vf', `fps=${fps}`, ...enc, f]);
      parts.push(f);
    }
  }

  const list = path.join(tmp, 'list.txt');
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const base = path.join(tmp, 'base.mp4');
  await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', base]);
  const totalSec = await getMediaDuration(base);

  // 3) Timeline + overlay items + SFX cues
  const starts: number[] = [];
  let acc = t0;
  for (const d of clipDur) { starts.push(acc); acc += d; }
  const items: OverlayItem[] = [];
  const cues: SfxCue[] = [];
  teaser.forEach((s, i) => {
    const last = i === teaser.length - 1;
    items.push({ start: i * SHOT, end: (i + 1) * SHOT + (last ? 0.35 : 0), bmp: makeText(s.word, last ? 138 : 150, s.color), cx: W / 2, cy: 560, shake: false });
    cues.push({ t: i * SHOT, kind: 'pop', freq: [660, 784, 988, 1319][i % 4]!, gain: 0.55 });
  });
  if (teaser.length) {
    cues.push({ t: Math.max(0, t0 - 0.35), kind: 'whoosh', gain: 0.55 });
    cues.push({ t: t0, kind: 'sparkle', gain: 0.35 });
  }
  for (const e of spec.events) {
    const s0 = starts[e.clip];
    if (s0 === undefined) throw new Error(`event "${e.text}" references missing clip ${e.clip}`);
    const start = s0 + e.at;
    const end = start + e.dur;
    if (e.kind === 'stamp') {
      items.push({ start, end, bmp: makePill(e.text, 40, COLORS[e.color], { pin: true, ...(e.sub ? { sub: e.sub } : {}) }), cx: W / 2, cy: 955, shake: false });
      cues.push({ t: start, kind: 'ding', gain: 0.35 });
    } else if (e.line2) {
      items.push({ start, end, bmp: makeText(e.text, e.size ?? 112, e.color), cx: W / 2, cy: 215, shake: false });
      items.push({ start: start + 0.2, end, bmp: makeText(e.line2.text, e.size ?? 112, e.line2.color), cx: W / 2, cy: 345, shake: false });
      cues.push({ t: start, kind: 'pop', freq: 520, gain: 0.4 });
    } else {
      items.push({ start, end, bmp: makeText(e.text, e.size ?? 100, e.color), cx: W / 2, cy: 250, shake: e.shake ?? true });
      cues.push({ t: start, kind: 'pop', freq: 520, gain: 0.4 });
    }
    if (e.sparkle) cues.push({ t: start, kind: 'sparkle', gain: 0.3 });
  }

  const overlay = path.join(tmp, 'overlay.mov');
  await renderOverlay({ items, ...(spec.chip ? { chip: makeChip(spec.chip) } : {}), chipFrom: t0 + 2.2, width: W, height: H, fps, totalSec, outFile: overlay });
  const sfx = path.join(tmp, 'sfx.wav');
  await writeSfxWav(sfx, cues, totalSec);

  // 4) Final composite: overlay on video, SFX (+ optional quiet music) mixed under the Veo voices
  const inputs = ['-i', base, '-i', overlay, '-i', sfx];
  let graph = '[0:v][1:v]overlay=0:0:format=auto[v];[2:a]volume=0.9[s];';
  if (spec.music) {
    inputs.push('-stream_loop', '-1', '-i', abs(spec.music));
    graph += `[3:a]volume=${spec.musicVolume ?? 0.12},atrim=0:${totalSec.toFixed(3)}[m];[0:a][s][m]amix=inputs=3:duration=first:normalize=0[a]`;
  } else {
    graph += '[0:a][s]amix=inputs=2:duration=first:normalize=0[a]';
  }
  await mkdir(path.dirname(out), { recursive: true });
  await runFfmpeg([...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', totalSec.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  logger.info('Assembled episode', { out, totalSec });
  return out;
}
