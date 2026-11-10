import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, getMediaDuration } from '../shared/ffmpegExec.js';
import { logger } from '../../shared/logger.js';
import { sceneVoice } from '../voice/VoiceProvider.js';
import { renderOverlay, type OverlayItem } from './overlayRenderer.js';
import { makeCaption, makeWordmark, ensureLuxuryFont } from './luxuryText.js';
import { writeAmbientBed, writeSfxWav, type SfxCue } from './sfx.js';
import type { StillsSpec, SceneTransition } from './types.js';

const GOLD = '0xC9A24B';

/** ffmpeg filter fragment (with trailing comma) applied at the START of a scene entered with this transition. */
export function transitionIn(t: SceneTransition = 'fade'): string {
  switch (t) {
    case 'flash': return 'fade=t=in:st=0:d=0.14:color=white,';
    case 'gold': return `fade=t=in:st=0:d=0.22:color=${GOLD},`;
    case 'cut': return '';
    case 'whip': return "gblur=sigma=48:sigmaV=0:steps=2:enable='lt(t,0.12)',";
    case 'punch': return "eq=brightness='0.32*max(0,1-t/0.16)':eval=frame,";
    default: return 'fade=t=in:st=0:d=0.28,';
  }
}

/** Fragment applied at the END of the scene that precedes a scene entered with transition t. */
export function transitionOut(t: SceneTransition = 'fade', dur: number): string {
  const at = (d: number) => (dur - d).toFixed(2);
  switch (t) {
    case 'flash': return `fade=t=out:st=${at(0.14)}:d=0.14:color=white,`;
    case 'gold': return `fade=t=out:st=${at(0.22)}:d=0.22:color=${GOLD},`;
    case 'whip': return `gblur=sigma=48:sigmaV=0:steps=2:enable='gte(t,${(dur - 0.1).toFixed(2)})',`;
    case 'cut':
    case 'punch': return '';
    default: return `fade=t=out:st=${at(0.28)}:d=0.28,`;
  }
}

const LEAD = 0.18;
const TAIL = 0.5;
const END_TAIL = 3.2;

const PUNCT_BREAK = /[.,!?;:—–-]$/;

/** Luxury/documentary Short: stills with slow camera moves, ElevenLabs narration, word-by-word gold captions, ambient bed. */
export async function assembleStills(specPath: string, repoRoot: string): Promise<string> {
  const spec = JSON.parse((await readFile(specPath, 'utf8')).replace(/^﻿/, '')) as StillsSpec;
  const H = spec.portraitHeight ?? 1280;
  if (H !== 1280 && H !== 1920) throw new Error('portraitHeight must be 1280 or 1920');
  const unit = H / 1280;
  const px = (n: number) => Math.round(n * unit);
  const W = px(720);
  const zoomW = px(1152);
  const zoomH = px(2048);
  const fps = spec.fps ?? 24;
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
  const out = abs(spec.output);
  const scratchRoot = process.env.SHORTS_RENDER_SCRATCH;
  const tmp = scratchRoot
    ? path.join(path.resolve(scratchRoot), createHash('sha256').update(out).digest('hex'))
    : path.join(path.dirname(out), '_assemble');
  for (const scene of spec.scenes) {
    if (scene.videoFill !== undefined && (!['loop', 'hold'].includes(scene.videoFill) || !scene.video)) {
      throw new Error('videoFill requires video and must be loop or hold');
    }
    const gain = scene.sourceAudioGain;
    if (gain !== undefined && (!Number.isFinite(gain) || gain < 0 || gain > 1 || !scene.video)) {
      throw new Error('sourceAudioGain requires video and a gain from 0 to 1');
    }
    if (gain && scene.video) await runFfmpeg(['-i', abs(scene.video), '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-']);
  }
  await mkdir(tmp, { recursive: true });
  ensureLuxuryFont(repoRoot);

  const voiceDir = path.join(path.dirname(out), '_voice'); // cached: re-runs never re-spend credits
  const sceneFiles: string[] = [];
  const timeline: { start: number; lead: number; dur: number; audioDur: number; words: { word: string; start: number; end: number }[] }[] = [];
  let cursor = 0;
  for (let i = 0; i < spec.scenes.length; i++) {
    const sc = spec.scenes[i]!;
    const sourceGain = sc.sourceAudioGain ?? 0;
    const grades = {
      cinema: 'eq=contrast=1.07:saturation=1.1:gamma=0.97,vignette=PI/4.5,noise=alls=4:allf=t,',
      natural: '',
      food: 'eq=contrast=1.04:saturation=1.06:gamma=1.03,',
    } as const;
    const grade = sc.colorGrade ?? 'cinema';
    if (!Object.hasOwn(grades, grade)) throw new Error('Unsupported scene colorGrade: ' + grade);
    const opening = sc.openingStill;
    if (opening !== undefined && (!opening || typeof opening.image !== 'string' || !opening.image.trim() || !Number.isFinite(opening.seconds) || opening.seconds <= 0)) {
      throw new Error('openingStill requires an image and positive seconds');
    }
    const push = sc.pushIn;
    if (push !== undefined && (!push || ![push.x, push.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1) || !Number.isFinite(push.holdSec) || push.holdSec < 0)) {
      throw new Error('pushIn requires normalized x/y coordinates and a nonnegative holdSec');
    }
    const v0 = await sceneVoice(sc, repoRoot, voiceDir, spec.voice);
    const last = i === spec.scenes.length - 1;
    // Tight open: cut dead air before the first spoken word so sound + text land at ~0.0 s
    const tight = !!spec.tightOpen && i === 0;
    const trim = tight ? Math.max(0, (v0.words[0]?.start ?? 0) - 0.03) : 0;
    const lead = tight ? 0.02 : LEAD;
    const v = trim > 0
      ? { ...v0, durationSec: v0.durationSec - trim, words: v0.words.map((w) => ({ ...w, start: w.start - trim, end: w.end - trim })) }
      : v0;
    const dur = lead + v.durationSec + (last ? END_TAIL : TAIL);
    const frames = Math.round(dur * fps);
    const motion = sc.motion ?? (['in', 'out', 'left', 'right'] as const)[i % 4]!;
    const moveFrames = Math.max(1, frames - 1 - Math.round((push?.holdSec ?? 0) * fps));
    const z = push ? `1+0.1*(1-cos(PI*min(on/${moveFrames},1)))` : { in: `1+0.2*on/${frames}`, out: `1.2-0.2*on/${frames}`, left: '1.14', right: '1.14' }[motion];
    const x = push ? `clip(iw*${push.x}-iw/zoom/2,0,iw-iw/zoom)` : { in: 'iw/2-(iw/zoom/2)', out: 'iw/2-(iw/zoom/2)', left: `(iw-iw/zoom)*(1-on/${frames})`, right: `(iw-iw/zoom)*(on/${frames})` }[motion];
    const y = push ? `clip(ih*${push.y}-ih/zoom/2,0,ih-ih/zoom)` : 'ih/2-(ih/zoom/2)';
    const f = path.join(tmp, `s${i}.mp4`);
    const inFx = i === 0 ? '' : transitionIn(sc.transition);
    const outFx = last ? `fade=t=out:st=${(dur - 0.28).toFixed(2)}:d=0.28,` : transitionOut(spec.scenes[i + 1]!.transition, dur);
    await runFfmpeg([
      '-threads', '2', '-filter_threads', '1', '-filter_complex_threads', '1',
      ...(sc.video ? [...(sc.videoFill === 'hold' ? [] : ['-stream_loop', '-1']), '-i', abs(sc.video)] : ['-loop', '1', '-framerate', String(fps), '-t', dur.toFixed(3), '-i', abs(sc.image)]), '-i', v0.audioFile,
      ...(opening ? ['-loop', '1', '-framerate', String(fps), '-i', abs(opening.image)] : []),
      '-filter_complex',
      (sc.video ? `[0:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,${sc.videoFill === 'hold' ? 'tpad=stop_mode=clone:stop=-1,' : ''}` : `[0:v]scale=${zoomW}:${zoomH}:force_original_aspect_ratio=increase,crop=${zoomW}:${zoomH},zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${W}x${H}:fps=${fps},`) +
        `${grades[grade]}${inFx}${outFx}format=yuv420p${opening ? '[scene]' : '[v]'};` +
        (opening ? `[2:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[opening];[scene][opening]overlay=enable='lt(t,${opening.seconds})'[v];` : '') +
        `[1:a]${trim > 0 ? `atrim=start=${trim.toFixed(3)},asetpts=PTS-STARTPTS,` : ''}aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.max(1, Math.round(lead * 1000))}:all=1,apad=whole_dur=${dur.toFixed(3)}${sourceGain ? '[voice];' : '[a]'}` +
        (sourceGain ? `[0:a:0]aresample=48000,aformat=channel_layouts=stereo,volume=${sourceGain}[location];[voice][location]amix=inputs=2:duration=first:normalize=0[a]` : ''),
      '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-r', String(fps), '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', f,
    ]);
    sceneFiles.push(f);
    timeline.push({ start: cursor, lead, dur, audioDur: v.durationSec, words: v.words });
    cursor += dur;
  }
  const list = path.join(tmp, 'list.txt');
  await writeFile(list, sceneFiles.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const base = path.join(tmp, 'base.mp4');
  await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', base]);
  const totalSec = await getMediaDuration(base);

  // Captions: groups of up to 3 words, break at punctuation; gold on the spoken word
  const items: OverlayItem[] = [];
  const cues: SfxCue[] = [{ t: 0.05, kind: 'sparkle', gain: 0.22 }];
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
        const start = sc.start + sc.lead + w.start;
        const nextStart = k + 1 < grp.length ? sc.start + sc.lead + ws[grp[k + 1]!]!.start : sc.start + sc.lead + w.end + 0.22;
        const following = ws[wi + 1];
        const end = Math.min(Math.max(start + 0.12, nextStart), following ? sc.start + sc.lead + following.start : sc.start + sc.dur);
        if (end <= start) return;
        items.push({ start, end, bmp: makeCaption(texts, k, px(62), px(640)), cx: W / 2, cy: px(905), shake: false, static: true, fadeIn: k === 0 ? 0.1 : 0.001, fadeOut: k === grp.length - 1 ? 0.12 : 0.001 });
      });
    });
    if (si > 0 && spec.scenes[si]!.transition !== 'cut') cues.push({ t: sc.start - 0.12, kind: 'whoosh', gain: 0.22 });
  });
  const titleStart = spec.scenes[0]?.openingStill?.seconds ?? 0;
  if (spec.hookText && titleStart < 2.4) items.push({ start: titleStart, end: 2.4, bmp: makeWordmark(spec.hookText.toUpperCase(), px(54), undefined, px(700)), cx: W / 2, cy: px(250), shake: false, static: true, fadeIn: 0.001, fadeOut: 0.3 });
  if (spec.kicker && !spec.hookText && titleStart < 4.2) items.push({ start: Math.max(0.3, titleStart), end: 4.2, bmp: makeWordmark(spec.kicker.toUpperCase(), px(25), undefined, px(700)), cx: W / 2, cy: px(175), shake: false, static: true, fadeIn: 0.6, fadeOut: 0.6 });
  const lastSc = timeline[timeline.length - 1]!;
  items.push({ start: lastSc.start + lastSc.lead + lastSc.audioDur + 0.35, end: totalSec - 0.05, bmp: makeWordmark(spec.brand.name.toUpperCase(), px(40), spec.brand.sub, px(700)), cx: W / 2, cy: px(300), shake: false, static: true, fadeIn: 0.9, fadeOut: 0.3 });

  const overlay = path.join(tmp, 'overlay.mov');
  await renderOverlay({ items, width: W, height: H, fps, totalSec, outFile: overlay });
  const sfx = path.join(tmp, 'sfx.wav');
  await writeSfxWav(sfx, cues, totalSec);

  const inputs = ['-i', base, '-i', overlay, '-i', sfx];
  const effectsVolume = spec.soundEffectsVolume ?? 0.8;
  if (!Number.isFinite(effectsVolume) || effectsVolume < 0 || effectsVolume > 1) {
    throw new Error('soundEffectsVolume must be a number from 0 to 1');
  }
  let graph = `[0:v][1:v]overlay=0:0:format=auto[v];[2:a]volume=${effectsVolume}[s];`;
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
  await runFfmpeg([...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', totalSec.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  logger.info('Assembled luxury episode', { out, totalSec });
  return out;
}
