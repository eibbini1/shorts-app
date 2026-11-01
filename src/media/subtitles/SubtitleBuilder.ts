import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AudioAsset, CaptionCue, Script, SubtitleCue, SubtitleTrack, WordTiming } from '../../shared/types.js';

function toSrtTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, len = 2): string => n.toString().padStart(len, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue) =>
      [
        cue.index,
        `${toSrtTimestamp(cue.startSec)} --> ${toSrtTimestamp(cue.endSec)}`,
        cue.text,
        '',
      ].join('\n'),
    )
    .join('\n');
}

/** Simple word-count-based chunking so no single subtitle line overstays its welcome. */
function splitIntoCues(text: string, startSec: number, endSec: number, startIndex: number): SubtitleCue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordsPerCue = 6;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    chunks.push(words.slice(i, i + wordsPerCue).join(' '));
  }
  if (chunks.length === 0) return [];

  const duration = endSec - startSec;
  const perChunk = duration / chunks.length;

  return chunks.map((text2, i) => ({
    index: startIndex + i,
    startSec: startSec + i * perChunk,
    endSec: startSec + (i + 1) * perChunk,
    text: text2,
  }));
}

// --- Word-level (.ass) caption support -------------------------------------
//
// Static 6-word SRT lines read as "generic auto-captions." Short-form video
// that performs well almost always uses 1-3 word bursts that pop in exactly
// as each word is spoken. This section builds that from real TTS word
// timings (falling back to the evenly-split estimate when a provider doesn't
// give real timings) and renders it as an .ass file so VideoRenderer can
// burn in per-word pop/emphasis styling via libass, not just plain text.

const MAX_WORDS_PER_CAPTION = 3;
const MAX_CHARS_PER_CAPTION = 20;

/** Words that get an accent-color emphasis treatment when they appear in a caption. */
const EMPHASIS_WORDS = new Set([
  'free', 'secret', 'never', 'always', 'worst', 'best', 'banned', 'illegal',
  'shocking', 'insane', 'exposed', 'real', 'fake', 'warning', 'stop', 'wait',
  'truth', 'lie', 'rule', 'rules', 'nobody', 'everyone', 'guaranteed',
]);

function isEmphasisWord(rawWord: string): boolean {
  const stripped = rawWord.replace(/[^\w$%]/g, '');
  if (stripped.length === 0) return false;
  if (/\d/.test(stripped) || stripped.includes('$') || stripped.includes('%')) return true;
  return EMPHASIS_WORDS.has(stripped.toLowerCase());
}

function escapeAssText(text: string): string {
  // Curly braces start/end ASS override blocks; a literal brace in narration
  // text would otherwise be interpreted as a style command.
  return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function toAssTimestamp(totalSeconds: number): string {
  const centis = Math.max(0, Math.round(totalSeconds * 100));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor((centis % 360_000) / 6_000);
  const seconds = Math.floor((centis % 6_000) / 100);
  const cs = centis % 100;
  const pad = (n: number, len = 2): string => n.toString().padStart(len, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(cs)}`;
}

/** Groups sequential word timings into short (<=3 word / <=20 char) caption bursts. */
function groupWordTimingsIntoCues(wordTimings: WordTiming[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let current: WordTiming[] = [];
  let charCount = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    cues.push({
      index: cues.length + 1,
      startSec: current[0]!.startSec,
      endSec: current[current.length - 1]!.endSec,
      words: current.map((w) => w.word),
    });
    current = [];
    charCount = 0;
  };

  for (const wt of wordTimings) {
    const nextCharCount = charCount + wt.word.length + (current.length > 0 ? 1 : 0);
    if (current.length >= MAX_WORDS_PER_CAPTION || (current.length > 0 && nextCharCount > MAX_CHARS_PER_CAPTION)) {
      flush();
    }
    current.push(wt);
    charCount += wt.word.length + (current.length > 1 ? 1 : 0);
  }
  flush();

  return cues;
}

const CAPTION_FONT = process.env.CAPTION_FONT_NAME ?? 'Poppins';

// Alignment 2 (bottom-centre) with a large MarginV keeps captions at ~65% of the frame
// height: clear of the YouTube Shorts UI (bottom ~20%, right rail) and off the subject's
// face/dish, which centre-screen captions cover.
const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${CAPTION_FONT},100,&H00FFFFFF,&H0000D7FF,&H00101010,&H99000000,-1,0,0,0,100,100,1,0,1,7,4,2,90,90,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

/** Gold/amber accent color for emphasized words, ASS &HAABBGGRR order. */
const EMPHASIS_COLOR = '&H0000D7FF&';
const DEFAULT_COLOR = '&H00FFFFFF&';

export class SubtitleBuilder {
  /** Builds cues (in-memory) from a Script's timed sections. */
  build(script: Script): SubtitleTrack {
    const cues: SubtitleCue[] = [];
    for (const section of script.sections) {
      const sectionCues = splitIntoCues(section.text, section.startSec, section.endSec, cues.length + 1);
      cues.push(...sectionCues);
    }
    return { cues };
  }

  /** Writes the track to an .srt file and returns the track with srtPath set. */
  async writeSrt(track: SubtitleTrack, outPath: string): Promise<SubtitleTrack> {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, cuesToSrt(track.cues), 'utf-8');
    return { ...track, srtPath: outPath };
  }

  /**
   * Builds short word-level caption bursts. Uses real per-word timings from
   * the TTS provider when available (accurate sync); falls back to the
   * section-based estimate (evenly split) if a provider didn't return any.
   */
  buildWordCues(audio: AudioAsset, script: Script): CaptionCue[] {
    if (audio.wordTimings && audio.wordTimings.length > 0) {
      return groupWordTimingsIntoCues(audio.wordTimings);
    }
    // Fallback: no real word timings available, approximate from the
    // section-level SRT cues instead of failing.
    return this.build(script).cues.map((cue) => ({
      index: cue.index,
      startSec: cue.startSec,
      endSec: cue.endSec,
      words: cue.text.split(/\s+/).filter(Boolean),
    }));
  }

  /** Writes word-level cues to a styled .ass file and returns its path. */
  async writeAss(cues: CaptionCue[], outPath: string): Promise<string> {
    await mkdir(dirname(outPath), { recursive: true });
    const events = cues.flatMap((cue) => cueToDialogueLines(cue)).join('\n');
    await writeFile(outPath, `${ASS_HEADER}\n${events}\n`, 'utf-8');
    return outPath;
  }
}

/**
 * One Dialogue per spoken word: the whole burst stays on screen while the CURRENT word
 * lights up in the accent colour with a small scale pulse (the "active word" look that
 * dominates high-retention Shorts). Only the first state pops in; later states don't
 * re-pop, so the burst feels like one object being read, not flickering text.
 */
function cueToDialogueLines(cue: CaptionCue): string[] {
  const n = cue.words.length;
  const total = Math.max(0.05, cue.endSec - cue.startSec);
  // Real per-word timings aren't carried on CaptionCue, so share the burst evenly.
  const per = total / n;
  return cue.words.map((_, activeIdx) => {
    const start = toAssTimestamp(cue.startSec + activeIdx * per);
    const end = toAssTimestamp(activeIdx === n - 1 ? cue.endSec : cue.startSec + (activeIdx + 1) * per);
    const pop = activeIdx === 0 ? '{\\fscx55\\fscy55\\t(0,90,\\fscx108\\fscy108)\\t(90,170,\\fscx100\\fscy100)}' : '';
    const text = cue.words
      .map((word, i) => {
        const safe = escapeAssText(word);
        if (i === activeIdx || isEmphasisWord(word)) {
          const pulse = i === activeIdx ? '\\fscx112\\fscy112' : '';
          return `{\\c${EMPHASIS_COLOR}${pulse}}${safe}{\\c${DEFAULT_COLOR}\\fscx100\\fscy100}`;
        }
        return safe;
      })
      .join(' ');
    return `Dialogue: 0,${start},${end},Caption,,0,0,0,,${pop}${text}`;
  });
}
