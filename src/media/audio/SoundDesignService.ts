import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import type { Script, SfxCue } from '../../shared/types.js';
import { runFfmpeg } from '../shared/ffmpegExec.js';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg']);

type Mood = 'tense' | 'upbeat' | 'curious' | 'neutral';
type SfxName = 'whoosh' | 'riser' | 'ding' | 'thud';

const MOOD_KEYWORDS: Record<Exclude<Mood, 'neutral'>, string[]> = {
  tense: ['warning', 'never', 'illegal', 'banned', 'secret', 'shocking', 'worst'],
  upbeat: ['best', 'amazing', 'love', 'perfect', 'win', 'guaranteed', 'free'],
  curious: ['why', 'how', 'what', 'guess', 'weird', 'wonder', 'sounds fake'],
};

export interface SoundDesignPlan {
  musicPath?: string;
  sfxCues: SfxCue[];
}

/**
 * Builds the sound-design layer for a script: a background music bed picked
 * by mood, and SFX cues timed to section boundaries (a whoosh on every scene
 * cut, an anticipation riser just before the CTA). Looks for real licensed
 * assets in the configured library directories first — organized as
 * `<dir>/<tag>/*.mp3` or `<dir>/<tag>.mp3` — and falls back to short
 * synthesized placeholder tones (same spirit as MockTTSProvider's silent
 * placeholder, per docs/DECISIONS.md D3) so the pipeline is always runnable
 * end-to-end even with an empty/unconfigured library.
 */
export class SoundDesignService {
  constructor(
    private readonly musicLibraryDir: string | undefined,
    private readonly sfxLibraryDir: string | undefined,
    private readonly placeholderDir: string,
  ) {}

  async plan(script: Script): Promise<SoundDesignPlan> {
    const mood = deriveMood(script);
    const musicPath = await this.resolveMusic(mood);
    const sfxCues = await this.buildSfxCues(script);
    return { ...(musicPath !== undefined ? { musicPath } : {}), sfxCues };
  }

  private async resolveMusic(mood: Mood): Promise<string | undefined> {
    const fromLibrary = await pickFromLibrary(this.musicLibraryDir, mood);
    if (fromLibrary) return fromLibrary;
    return this.synthesizePlaceholder('music-pad-v2', musicPadSynthArgs);
  }

  private async buildSfxCues(script: Script): Promise<SfxCue[]> {
    const cues: SfxCue[] = [];

    for (let i = 1; i < script.sections.length; i++) {
      const section = script.sections[i]!;

      const whoosh = await this.resolveSfx('whoosh');
      if (whoosh) cues.push({ path: whoosh, atSec: section.startSec, volume: 0.5 });

      if (section.label === 'cta') {
        const riser = await this.resolveSfx('riser');
        if (riser) cues.push({ path: riser, atSec: Math.max(0, section.startSec - 0.35), volume: 0.4 });
      }
    }

    return cues;
  }

  private async resolveSfx(name: SfxName): Promise<string | undefined> {
    const fromLibrary = await pickFromLibrary(this.sfxLibraryDir, name);
    if (fromLibrary) return fromLibrary;
    return this.synthesizePlaceholder(name, () => SFX_SYNTH_ARGS[name]());
  }

  /** Synthesizes (once, then caches on disk) a short placeholder tone via ffmpeg's lavfi audio sources. */
  private async synthesizePlaceholder(name: string, buildArgs: () => string[]): Promise<string> {
    const outPath = `${this.placeholderDir}/${name}.wav`;
    if (existsSync(outPath)) return outPath;
    await mkdir(this.placeholderDir, { recursive: true });
    await runFfmpeg([...buildArgs(), outPath]);
    return outPath;
  }
}

function deriveMood(script: Script): Mood {
  const text = script.fullText.toLowerCase();
  let bestMood: Mood = 'neutral';
  let bestScore = 0;

  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS) as [Exclude<Mood, 'neutral'>, string[]][]) {
    const score = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMood = mood;
    }
  }

  return bestMood;
}

async function pickFromLibrary(dir: string | undefined, tag: string): Promise<string | undefined> {
  if (!dir) return undefined;

  const subDir = `${dir}/${tag}`;
  if (existsSync(subDir)) {
    const files = await safeReaddir(subDir);
    const match = files.find((f) => AUDIO_EXTENSIONS.has(extOf(f)));
    if (match) return `${subDir}/${match}`;
  }

  for (const ext of AUDIO_EXTENSIONS) {
    const flatPath = `${dir}/${tag}${ext}`;
    if (existsSync(flatPath)) return flatPath;
  }

  return undefined;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function extOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

// --- Placeholder synthesis (no real audio assets required) -----------------

function musicPadSynthArgs(): string[] {
  // 8s Am(add9)-style pad built from INTEGER-Hz sines over an 8s window, so every tone
  // completes whole cycles and the bed loops with no click or fade-dip (the old 4s
  // fade-in/out pad audibly "pulsed" under narration). Slow tremolo (0.125 Hz = exactly one
  // cycle per loop) + low-pass + a touch of echo give it air without needing a licensed track.
  return [
    '-f', 'lavfi', '-i', 'sine=frequency=110:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=262:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=495:duration=8',
    '-filter_complex',
    '[0:a][1:a][2:a][3:a][4:a]amix=inputs=5:duration=first:normalize=0,' +
      'lowpass=f=1800,tremolo=f=0.125:d=0.35,aecho=0.8:0.6:120|240:0.25|0.15,volume=0.9[aout]',
    '-map', '[aout]',
  ];
}

const SFX_SYNTH_ARGS: Record<SfxName, () => string[]> = {
  whoosh: () => [
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.4:c=pink:r=44100',
    '-filter_complex', '[0:a]afade=t=in:d=0.05,afade=t=out:st=0.25:d=0.15,volume=0.7[aout]',
    '-map', '[aout]',
  ],
  riser: () => [
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.4:c=white:r=44100',
    '-filter_complex', '[0:a]afade=t=in:d=0.4,volume=0.5[aout]',
    '-map', '[aout]',
  ],
  ding: () => [
    '-f', 'lavfi', '-i', 'sine=frequency=1200:duration=0.25',
    '-filter_complex', '[0:a]afade=t=out:st=0.1:d=0.15,volume=0.5[aout]',
    '-map', '[aout]',
  ],
  thud: () => [
    '-f', 'lavfi', '-i', 'sine=frequency=80:duration=0.3',
    '-filter_complex', '[0:a]afade=t=out:st=0.05:d=0.25,volume=0.6[aout]',
    '-map', '[aout]',
  ],
};
