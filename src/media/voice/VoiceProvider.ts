import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getMediaDuration } from '../shared/ffmpegExec.js';

export interface LocalNarration { file: string; words: WordTiming[] }

export async function sceneVoice(
  scene: { text: string; narration?: LocalNarration }, root: string, outDir: string,
  opts: VoiceOptions, cacheOnly = false,
): Promise<VoiceResult> {
  if (scene.narration === undefined) return synthesize(scene.text, outDir, opts, cacheOnly);
  const input = scene.narration;
  if (!input || typeof input.file !== 'string' || !input.file.trim() || !Array.isArray(input.words) || !input.words.length) {
    throw new Error('Local narration requires a file and nonempty word timings');
  }
  const audioFile = path.resolve(root, input.file);
  const durationSec = await getMediaDuration(audioFile);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Local narration must have positive duration');
  let previous = 0;
  for (const word of input.words) {
    if (!word || typeof word.word !== 'string' || !word.word.trim() || !Number.isFinite(word.start) ||
        !Number.isFinite(word.end) || word.start < previous || word.end <= word.start || word.end > durationSec + 0.02) {
      throw new Error('Local narration word timings must be ordered and within the audio duration');
    }
    previous = word.end;
  }
  if (input.words.map(word => word.word.trim()).join(' ') !== scene.text.trim().replace(/\s+/g, ' ')) {
    throw new Error('Local narration words must match the scene text');
  }
  return { audioFile, durationSec, words: input.words };
}

export interface WordTiming { word: string; start: number; end: number }
export interface VoiceResult { audioFile: string; durationSec: number; words: WordTiming[] }
export interface VoiceOptions { provider: 'elevenlabs' | 'mock'; voiceId?: string; modelId?: string; speed?: number; stability?: number; style?: number }

/** Groups ElevenLabs character-level alignment into word timings. */
export function wordsFromAlignment(chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const words: WordTiming[] = [];
  let cur = '';
  let s = 0;
  let e = 0;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) { words.push({ word: cur, start: s, end: e }); cur = ''; }
      return;
    }
    if (!cur) s = starts[i] ?? 0;
    cur += ch;
    e = ends[i] ?? e;
  });
  if (cur) words.push({ word: cur, start: s, end: e });
  return words;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn(cmd, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    c.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    c.on('error', rej);
    c.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} failed: ${err.slice(-400)}`))));
  });
}

/**
 * Text -> narration audio + word timings. Results are cached by content hash so
 * re-running an episode never re-spends ElevenLabs credits.
 */
export function voiceCachePaths(text: string, outDir: string, opts: VoiceOptions) {
  const key = createHash('sha1').update(JSON.stringify([text, opts])).digest('hex').slice(0, 12);
  return { audioFile: path.join(outDir, key + '.mp3'), metaFile: path.join(outDir, key + '.json') };
}

export async function readCachedVoice(text: string, outDir: string, opts: VoiceOptions): Promise<VoiceResult | null> {
  const { audioFile, metaFile } = voiceCachePaths(text, outDir, opts);
  if (!existsSync(audioFile)) return null;
  try {
    const m = JSON.parse(await readFile(metaFile, 'utf8')) as VoiceResult;
    if (!Number.isFinite(m.durationSec) || m.durationSec <= 0 || !Array.isArray(m.words) || !m.words.length ||
        m.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start)) return null;
    return { ...m, audioFile };
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function synthesize(text: string, outDir: string, opts: VoiceOptions, cacheOnly = false): Promise<VoiceResult> {
  const cached = await readCachedVoice(text, outDir, opts);
  if (cached) return cached;
  if (cacheOnly || (opts.provider === 'elevenlabs' && process.env.VOICE_CACHE_ONLY === '1')) throw new Error('No valid cached narration for this exact text and voice settings; generate narration explicitly first.');
  await mkdir(outDir, { recursive: true });
  const { audioFile, metaFile } = voiceCachePaths(text, outDir, opts);
  let words: WordTiming[];
  if (opts.provider === 'elevenlabs') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set in .env');
    const voiceId = opts.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? 'nPczCjzI2devNBz1zQrb'; // "Brian": deep, resonant narrator
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: opts.modelId ?? 'eleven_multilingual_v2',
        voice_settings: { stability: opts.stability ?? 0.55, similarity_boost: 0.8, style: opts.style ?? 0.35, use_speaker_boost: true, speed: opts.speed ?? 0.94 },
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { audio_base64: string; alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
    await writeFile(audioFile, Buffer.from(j.audio_base64, 'base64'));
    words = wordsFromAlignment(j.alignment.characters, j.alignment.character_start_times_seconds, j.alignment.character_end_times_seconds);
  } else {
    // mock: silent audio, timing spread by word length (pipeline testing without credits)
    const toks = text.split(/\s+/).filter(Boolean);
    const total = Math.max(1.5, toks.length * 0.38);
    await run('ffmpeg', ['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', total.toFixed(2), '-q:a', '9', audioFile]);
    const weights = toks.map((t) => t.length + 2);
    const sum = weights.reduce((a, b) => a + b, 0);
    let t0 = 0;
    words = toks.map((w, i) => { const d = (weights[i]! / sum) * total; const r = { word: w, start: t0, end: t0 + d }; t0 += d; return r; });
  }
  const durationSec = await getMediaDuration(audioFile);
  const out: VoiceResult = { audioFile, durationSec, words };
  await writeFile(metaFile, JSON.stringify({ durationSec, words }), 'utf8');
  return out;
}
