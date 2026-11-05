import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { sceneVoice, voiceCachePaths } from '../media/voice/VoiceProvider.js';
import { getMediaDuration, runFfmpeg } from '../media/shared/ffmpegExec.js';
import type { StillsSpec } from '../media/assemble/types.js';

export async function loadSpec(file: string, root = process.cwd()): Promise<StillsSpec & { width?: number; height?: number }> {
  if (!file.endsWith('.assemble.json')) throw new Error('Episode filename must end with .assemble.json');
  const spec = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  if (spec.kind !== 'stills' || typeof spec.output !== 'string' || !spec.output.endsWith('.mp4')) throw new Error('Need a stills spec with an MP4 output');
  if (!spec.brand || typeof spec.brand.name !== 'string' || !spec.brand.name.trim()) throw new Error('Missing brand.name');
  if (!spec.voice || !['elevenlabs', 'mock'].includes(spec.voice.provider)) throw new Error('Unsupported voice provider');
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) throw new Error('Need at least one scene');
  if (spec.fps !== undefined && (!Number.isFinite(spec.fps) || spec.fps < 23 || spec.fps > 60)) throw new Error('fps must be between 23 and 60');
  if (spec.portraitHeight !== undefined && (![1280, 1920].includes(spec.portraitHeight) || (spec.width ?? 0) > (spec.height ?? 1))) {
    throw new Error('portraitHeight must be 1280 or 1920 and requires portrait output');
  }
  for (const [i, scene] of spec.scenes.entries()) {
    if (typeof scene.text !== 'string' || !scene.text.trim() || typeof scene.image !== 'string' || !scene.image.trim()) throw new Error('Scene ' + (i + 1) + ' needs narration and an image');
    if (scene.colorGrade !== undefined && (!['cinema', 'natural', 'food'].includes(scene.colorGrade) || (spec.width ?? 0) > (spec.height ?? 1))) {
      throw new Error('Scene ' + (i + 1) + ': colorGrade must be cinema, natural, or food and is supported for portrait only');
    }
    if (scene.transition && !['fade', 'flash', 'gold', 'cut', 'punch', 'whip'].includes(scene.transition)) throw new Error('Invalid scene transition');
    if (scene.motion && !['in', 'out', 'left', 'right', ...((spec.width ?? 0) > (spec.height ?? 1) ? ['hook', 'reveal', 'side', 'tiltdown', 'tiltup', 'diag'] : [])].includes(scene.motion)) throw new Error('Invalid scene motion');
    if (scene.sourceAudioGain !== undefined && (!Number.isFinite(scene.sourceAudioGain) || scene.sourceAudioGain < 0 || scene.sourceAudioGain > 1 || !scene.video || (spec.width ?? 0) > (spec.height ?? 1))) {
      throw new Error('Scene ' + (i + 1) + ': sourceAudioGain requires portrait video and a gain from 0 to 1');
    }
    if (scene.videoFill !== undefined && (!['loop', 'hold'].includes(scene.videoFill) || !scene.video || (spec.width ?? 0) > (spec.height ?? 1))) {
      throw new Error('Scene ' + (i + 1) + ': videoFill requires portrait video and must be loop or hold');
    }
    if (scene.video !== undefined) {
      if (typeof scene.video !== 'string' || !scene.video.trim()) throw new Error('Scene video requires a local path');
      const video = await stat(path.resolve(root, scene.video));
      if (!video.isFile() || !video.size) throw new Error('Empty scene video: ' + scene.video);
      const videoPath = path.resolve(root, scene.video);
      const duration = await getMediaDuration(videoPath);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Scene video needs a positive duration: ' + scene.video);
      await runFfmpeg(['-i', videoPath, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-']);
      if (scene.sourceAudioGain > 0) await runFfmpeg(['-i', videoPath, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-']);
    }
    if (scene.narration !== undefined) {
      const narration = await sceneVoice(scene, root, '', spec.voice, true);
      await runFfmpeg(['-i', narration.audioFile, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-']);
    }
    const image = await stat(path.resolve(root, scene.image));
    if (!image.isFile() || !image.size) throw new Error('Empty scene image: ' + scene.image);
  }
  if (spec.music && spec.music !== 'ambient') await stat(path.resolve(root, spec.music));
  return spec;
}

export async function fileDigest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function inputDigest(file: string, spec: StillsSpec, root = process.cwd()): Promise<string> {
  const hash = createHash('sha256').update(await readFile(file));
  for (const image of [...new Set(spec.scenes.flatMap(s => [s.image, ...(s.video ? [s.video] : []), ...(s.openingStill ? [s.openingStill.image] : [])]))]) {
    for await (const chunk of createReadStream(path.resolve(root, image))) hash.update(chunk);
  }
  if (spec.music && spec.music !== 'ambient') hash.update(await readFile(path.resolve(root, spec.music)));
  // Renderer/tool changes and replaced cache audio also invalidate completed packs.
  const operationalClis = new Set(['automate.ts', 'ytUpload.ts', 'channelSnapshot.ts'].map(name => path.join(root, 'src', 'cli', name)));
  const publishing = path.join(root, 'src', 'publishing');
  async function sourceTree(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '__tests__' || entry.name.endsWith('.test.ts')) continue;
      const file = path.join(dir, entry.name);
      if (file === publishing) continue;
      if (entry.isDirectory()) await sourceTree(file);
      else if (!operationalClis.has(file) && file.endsWith('.ts')) hash.update(path.relative(root, file)).update(await readFile(file));
    }
  }
  await sourceTree(path.join(root, 'src'));
  hash.update(process.env.ELEVENLABS_VOICE_ID ?? 'default');
  const voiceDir = path.join(path.dirname(path.resolve(root, spec.output)), '_voice');
  for (const scene of spec.scenes) {
    if (scene.narration) {
      hash.update(await fileDigest(path.resolve(root, scene.narration.file)));
      continue;
    }
    for (const file of Object.values(voiceCachePaths(scene.text, voiceDir, spec.voice))) {
    try { hash.update(await readFile(file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; hash.update('missing:' + file); }
  }
  }
  hash.update(await readFile(path.join(root, 'assets', 'fonts', 'Lora-Variable.ttf')));
  return hash.digest('hex');
}

export async function atomicJson(file: string, data: unknown): Promise<void> {
  const { mkdir, rename, writeFile, rm } = await import('node:fs/promises');
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  try { await writeFile(temp, JSON.stringify(data, null, 2), 'utf8'); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
