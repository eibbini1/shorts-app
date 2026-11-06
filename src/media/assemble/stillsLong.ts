import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, getMediaDuration } from '../shared/ffmpegExec.js';
import { logger } from '../../shared/logger.js';
import { sceneVoice } from '../voice/VoiceProvider.js';
import { renderOverlay, type OverlayItem } from './overlayRenderer.js';
import { makeCaption, makeWordmark, ensureLuxuryFont } from './luxuryText.js';
import { writeAmbientBed, writeSfxWav, type SfxCue } from './sfx.js';
import type { StillsSpec } from './types.js';

/**
 * Landscape (16:9) luxury long-form builder: same look as the vertical Shorts builder
 * (stillsEpisode.ts) but sized from spec.width/height, with the extra camera moves
 * (hook, reveal, side, tiltdown, tiltup, diag) and per-scene transitions (fade, flash, gold, cut).
 */
type Motion = 'in' | 'out' | 'left' | 'right' | 'hook' | 'reveal' | 'side' | 'tiltdown' | 'tiltup' | 'diag';
type Transition = 'fade' | 'flash' | 'gold' | 'cut';
type LongScene = { narration?: import('../voice/VoiceProvider.js').LocalNarration; image: string; video?: string; text: string; motion?: Motion; transition?: Transition };
type LongSpec = Omit<StillsSpec, 'scenes'> & { width?: number; height?: number; scenes: LongScene[] };

const LEAD = 0.18;
const TAIL = 0.5;
const END_TAIL = 3.2;
const PUNCT_BREAK = /[.,!?;:—–-]$/;
const CX = 'iw/2-(iw/zoom/2)';
const CY = 'ih/2-(ih/zoom/2)';

function camera(m: Motion, F: number): { z: string; x: string; y: string } {
  switch (m) {
    case 'in': return { z: `1+0.2*on/${F}`, x: CX, y: CY };
    case 'out': return { z: `1.2-0.2*on/${F}`, x: CX, y: CY };
    case 'hook': return { z: `1+0.3*on/${F}`, x: CX, y: CY };
    case 'reveal': return { z: `1.3-0.3*on/${F}`, x: CX, y: CY };
    case 'left': return { z: '1.14', x: `(iw-iw/zoom)*(1-on/${F})`, y: CY };
    case 'right': return { z: '1.14', x: `(iw-iw/zoom)*(on/${F})`, y: CY };
    case 'side': return { z: '1.1', x: `(iw-iw/zoom)*(on/${F})`, y: CY };
    case 'tiltdown': return { z: '1.2', x: CX, y: `(ih-ih/zoom)*(on/${F})` };
    case 'tiltup': return { z: '1.2', x: CX, y: `(ih-ih/zoom)*(1-on/${F})` };
    case 'diag': return { z: '1.15', x: `(iw-iw/zoom)*(on/${F})`, y: `(ih-ih/zoom)*(on/${F})` };
  }
}
const FADE_COLOR: Record<Transition, string | null> = { fade: 'black', flash: 'white', gold: '0xECC470', cut: null };

export async function assembleStillsLong(specPath: string, repoRoot: string): Promise<string> {
  const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as LongSpec;
  const W = spec.width ?? 1280;
  const H = spec.height ?? 720;
  const SW = Math.round(W * 1.6);
  const SH = Math.round(H * 1.6);
  const fps = spec.fps ?? 24;
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
  const out = abs(spec.output);
  const tmp = path.join(path.dirname(out), '_assemble');
  await mkdir(tmp, { recursive: true });
  ensureLuxuryFont(repoRoot);

  const voiceDir = path.join(path.dirname(out), '_voice'); // cached: re-runs never re-spend credits
  const sceneFiles: string[] = [];
  const timeline: { start: number; dur: number; audioDur: number; words: { word: string; start: number; end: number }[]; tr: Transition }[] = [];
  const order: Motion[] = ['in', 'out', 'left', 'right'];
  let cursor = 0;
  for (let i = 0; i < spec.scenes.length; i++) {
    const sc = spec.scenes[i]!;
    const v = await sceneVoice(sc, repoRoot, voiceDir, spec.voice);
    const last = i === spec.scenes.length - 1;
    const dur = LEAD + v.durationSec + (last ? END_TAIL : TAIL);
    const F = Math.round(dur * fps);
    const motion: Motion = sc.motion ?? order[i % 4]!;
    const cam = camera(motion, F);
    const tr: Transition = i === 0 ? 'cut' : sc.transition ?? 'fade';
    const nextTr: Transition = last ? 'fade' : spec.scenes[i + 1]!.transition ?? 'fade';
    const inCol = FADE_COLOR[tr];
    const outCol = FADE_COLOR[nextTr];
    const fadeIn = inCol ? `fade=t=in:st=0:d=0.28:color=${inCol}` : 'fade=t=in:st=0:d=0.01';
    const fadeOut = outCol ? `fade=t=out:st=${(dur - 0.28).toFixed(2)}:d=0.28:color=${outCol}` : 'fade=t=out:st=0:d=0.001:alpha=0';
    const f = path.join(tmp, `s${i}.mp4`);
    await runFfmpeg([
      '-threads', '2', '-filter_threads', '1', '-filter_complex_threads', '1',
      ...(sc.video ? ['-stream_loop', '-1', '-i', abs(sc.video)] : ['-i', abs(sc.image)]), '-i', v.audioFile,
      '-filter_complex',
      (sc.video ? `[0:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` : `[0:v]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},zoompan=z='${cam.z}':x='${cam.x}':y='${cam.y}':d=${F}:s=${W}x${H}:fps=${fps},`) +
        `eq=contrast=1.07:saturation=1.1:gamma=0.97,vignette=PI/4.5,noise=alls=4:allf=t,${fadeIn},${outCol ? fadeOut : 'null'},format=yuv420p[v];` +
        `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(LEAD * 1000)}:all=1,apad=whole_dur=${dur.toFixed(3)}[a]`,
      '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', String(fps), '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', f,
    ]);
    sceneFiles.push(f);
    timeline.push({ start: cursor, dur, audioDur: v.durationSec, words: v.words, tr });
    cursor += dur;
    logger.info('scene done', { scene: i + 1, of: spec.scenes.length, motion, tr });
  }
  const list = path.join(tmp, 'list.txt');
  await writeFile(list, sceneFiles.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const base = path.join(tmp, 'base.mp4');
  await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', base]);
  const totalSec = await getMediaDuration(base);

  // Captions: groups of up to 3 words, break at punctuation; gold on the spoken word (lower third)
  const items: OverlayItem[] = [];
  const cues: SfxCue[] = [{ t: 0.05, kind: 'sparkle', gain: 0.22 }];
  const capY = H - Math.round(H * 0.17);
  timeline.forEach((sc, si) => {
    const ws = sc.words;
    const groups: number[][] = [];
    let g: number[] = [];
    ws.forEach((w, i) => {
      g.push(i);
      if (g.length >= 3 || PUNCT_BREAK.test(w.word)) { groups.push(g); g = []; }
    });
    if (g.length) groups.push(g);
    groups.forEach((grp) => {
      const texts = grp.map((i) => ws[i]!.word);
      grp.forEach((wi, k) => {
        const w = ws[wi]!;
        const start = sc.start + LEAD + w.start;
        const nextStart = k + 1 < grp.length ? sc.start + LEAD + ws[grp[k + 1]!]!.start : sc.start + LEAD + w.end + 0.22;
        items.push({ start, end: Math.max(start + 0.12, nextStart), bmp: makeCaption(texts, k, 54, Math.round(W * 0.78)), cx: W / 2, cy: capY, shake: false, static: true, fadeIn: k === 0 ? 0.1 : 0.001, fadeOut: k === grp.length - 1 ? 0.12 : 0.001 });
      });
    });
    if (si > 0 && sc.tr !== 'cut') cues.push({ t: sc.start - 0.12, kind: 'whoosh', gain: sc.tr === 'flash' ? 0.3 : 0.22 });
  });
  if (spec.kicker) items.push({ start: 0.3, end: 4.2, bmp: makeWordmark(spec.kicker.toUpperCase(), 25), cx: W / 2, cy: Math.round(H * 0.14), shake: false, static: true, fadeIn: 0.6, fadeOut: 0.6 });
  const lastSc = timeline[timeline.length - 1]!;
  items.push({ start: lastSc.start + LEAD + lastSc.audioDur + 0.35, end: totalSec - 0.05, bmp: makeWordmark(spec.brand.name.toUpperCase(), 40, spec.brand.sub), cx: W / 2, cy: Math.round(H * 0.3), shake: false, static: true, fadeIn: 0.9, fadeOut: 0.3 });

  const overlay = path.join(tmp, 'overlay.mov');
  await renderOverlay({ items, width: W, height: H, fps, totalSec, outFile: overlay });
  const sfx = path.join(tmp, 'sfx.wav');
  await writeSfxWav(sfx, cues, totalSec);

  const inputs = ['-i', base, '-i', overlay, '-i', sfx];
  let graph = '[0:v][1:v]overlay=0:0:format=auto[v];[2:a]volume=0.8[s];';
  const musicWanted = spec.music ?? 'ambient';
  if (musicWanted !== 'none') {
    let musicFile: string;
    if (musicWanted === 'ambient') { musicFile = path.join(tmp, 'bed.wav'); await writeAmbientBed(musicFile, totalSec); } else musicFile = abs(musicWanted);
    inputs.push('-i', musicFile);
    graph += `[3:a]volume=${spec.musicVolume ?? 1.6}[m0];[0:a]asplit=2[vo][vsc];[m0][vsc]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=500[md];[vo][md][s]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  } else {
    graph += '[0:a][s]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]';
  }
  await mkdir(path.dirname(out), { recursive: true });
  await runFfmpeg([...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', totalSec.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  logger.info('Assembled landscape luxury episode', { out, totalSec, W, H });
  return out;
}
