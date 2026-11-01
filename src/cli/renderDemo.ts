/**
 * Offline look-dev tool: renders a Short from a folder of stills/clips + a narration file
 * through the REAL VideoRenderer / SubtitleBuilder / SoundDesignService, with no LLM, TTS or
 * stock-API calls. Use it to iterate on the cinematic look in seconds.
 *
 *   npm run render-demo -- --media ./demo-media --audio ./narration.wav \
 *     --text "Spoken text here. Second sentence. Final call to action." --out ./storage/demo
 */
import { readdirSync, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { VideoRenderer } from '../media/video/VideoRenderer.js';
import { SubtitleBuilder } from '../media/subtitles/SubtitleBuilder.js';
import { SoundDesignService } from '../media/audio/SoundDesignService.js';
import { getMediaDuration } from '../media/shared/ffmpegExec.js';
import type { AudioAsset, Script, ScriptSection, VisualAsset, WordTiming } from '../shared/types.js';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`Missing --${name}`);
  return v;
}

async function main(): Promise<void> {
  const mediaDir = resolve(arg('media'));
  const audioPath = resolve(arg('audio'));
  const text = arg('text');
  const outDir = resolve(arg('out', './storage/demo'));
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(mediaDir).sort();
  const visuals: VisualAsset[] = files
    .filter((f) => ['.png', '.jpg', '.jpeg', '.mp4', '.mov', '.webm'].includes(extname(f).toLowerCase()))
    .map((f) => ({
      path: join(mediaDir, f),
      type: ['.mp4', '.mov', '.webm'].includes(extname(f).toLowerCase()) ? ('video' as const) : ('image' as const),
    })) as VisualAsset[];
  if (visuals.length === 0) throw new Error(`No media in ${mediaDir}`);

  const durationSec = await getMediaDuration(audioPath);
  const words = text.trim().split(/\s+/);
  const per = durationSec / words.length;
  const wordTimings: WordTiming[] = words.map((word, i) => ({ word, startSec: i * per, endSec: (i + 1) * per }));
  const audio: AudioAsset = { path: audioPath, durationSec, wordTimings };

  // hook = first sentence, cta = last sentence, body = the rest (drives SFX + music mood).
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const labels: ScriptSection['label'][] = sentences.map((_, i) => (i === 0 ? 'hook' : i === sentences.length - 1 ? 'cta' : 'body'));
  let cursor = 0;
  const sections: ScriptSection[] = sentences.map((s, i) => {
    const n = s.split(/\s+/).length;
    const sec = { label: labels[i]!, text: s, startSec: cursor * per, endSec: (cursor + n) * per } as ScriptSection;
    cursor += n;
    return sec;
  });
  const script = { sections, fullText: text, estimatedDurationSec: durationSec, visualKeywords: [], idea: { title: 'demo', angle: '', niche: 'demo', visualKeywords: [] } } as unknown as Script;

  // Visual slots follow the narration timeline evenly.
  visuals.forEach((v) => { v.durationSec = durationSec / visuals.length; });

  const subs = new SubtitleBuilder();
  const assPath = await subs.writeAss(subs.buildWordCues(audio, script), join(outDir, 'demo.ass'));
  const sound = await new SoundDesignService(process.env.MUSIC_LIBRARY_DIR, process.env.SFX_LIBRARY_DIR, join(outDir, 'placeholders')).plan(script);

  const result = await new VideoRenderer(outDir).render({
    audio, visuals, subtitles: { cues: [], assPath },
    ...(sound.musicPath ? { musicPath: sound.musicPath } : {}),
    sfxCues: sound.sfxCues, outputBaseName: arg('name', 'demo'),
  });
  // eslint-disable-next-line no-console
  console.log(`Rendered ${result.path} (${result.durationSec.toFixed(1)}s)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
