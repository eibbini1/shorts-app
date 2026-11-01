import type { AudioAsset, Beat, Script, ScriptSection, WordTiming } from '../../shared/types.js';

export const MIN_BEAT_SEC = 1.6;
export const MAX_BEAT_SEC = 3.4;

const STRONG_END = /[.!?]["')\]]*$/;
const WEAK_END = /[,;:\u2014\u2013-]["')\]]*$/;
/** A beat must never END on one of these: the visual would change mid-phrase ("...on a | hot flat top"). */
const DANGLING = new Set(['a', 'an', 'the', 'on', 'of', 'to', 'in', 'at', 'for', 'with', 'by', 'from', 'and', 'or', 'but', 'then', 'is', 'are', 'was', 'his', 'her', 'their', 'this', 'that', 'your', 'my', 'our', 'into', 'than', 'as']);
const SPLIT_BEFORE = new Set(['then', 'and', 'but', 'while', 'until', 'after', 'before', 'so', 'because']);

/**
 * Cuts the narration into visual beats from REAL speech timing: each beat is a phrase
 * (sentence / clause) 1.6-3.4s long, and beats tile 0..audio.durationSec with no gaps.
 * One beat = one visual, so the picture changes exactly when the spoken idea changes —
 * not on a fixed 2s grid that ignores what is being said.
 */
export function buildBeats(script: Script, audio: AudioAsset): Beat[] {
  const words = audio.wordTimings && audio.wordTimings.length > 0
    ? audio.wordTimings
    : estimateWordTimings(script, audio.durationSec);
  if (words.length === 0) return [];

  // 1. Phrase-level split points (after strong/weak punctuation).
  let groups: WordTiming[][] = [];
  let current: WordTiming[] = [];
  for (const w of words) {
    current.push(w);
    if (STRONG_END.test(w.word) || WEAK_END.test(w.word)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  // 2. Split anything too long, preferring a clause boundary word near the middle.
  groups = groups.flatMap((g) => splitLong(g));

  // 3. Merge anything too short into its neighbour.
  groups = mergeShort(groups);

  // 4. Tile the timeline contiguously.
  const total = audio.durationSec;
  const beats: Beat[] = groups.map((g, i) => {
    const start = i === 0 ? 0 : groups[i - 1]![groups[i - 1]!.length - 1]!.endSec;
    const end = i === groups.length - 1 ? total : g[g.length - 1]!.endSec;
    return {
      index: i,
      text: g.map((w) => w.word).join(' '),
      startSec: Number(start.toFixed(3)),
      endSec: Number(Math.max(end, start + 0.2).toFixed(3)),
      sectionLabel: 'body' as ScriptSection['label'],
    };
  });
  for (const b of beats) b.sectionLabel = sectionAt((b.startSec + b.endSec) / 2, script);
  return beats;
}

function dur(g: WordTiming[]): number {
  return g[g.length - 1]!.endSec - g[0]!.startSec;
}

function splitLong(g: WordTiming[]): WordTiming[][] {
  if (dur(g) <= MAX_BEAT_SEC || g.length < 4) return [g];
  const mid = (g[0]!.startSec + g[g.length - 1]!.endSec) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 1; i < g.length - 1; i++) {
    const clauseBonus = SPLIT_BEFORE.has(g[i]!.word.toLowerCase().replace(/[^a-z]/g, '')) ? 1.5 : 0;
    const prevWord = g[i - 1]!.word.toLowerCase().replace(/[^a-z']/g, '');
    const danglePenalty = DANGLING.has(prevWord) ? 2.5 : 0;
    const dist = Math.abs(g[i]!.startSec - mid) - clauseBonus + danglePenalty;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  if (best < 1) return [g];
  return [...splitLong(g.slice(0, best)), ...splitLong(g.slice(best))];
}

function mergeShort(groups: WordTiming[][]): WordTiming[][] {
  const out: WordTiming[][] = [];
  for (const g of groups) {
    const prev = out[out.length - 1];
    if (prev && (dur(prev) < MIN_BEAT_SEC || dur(g) < MIN_BEAT_SEC) && dur(prev) + dur(g) <= MAX_BEAT_SEC + 0.8) {
      out[out.length - 1] = [...prev, ...g];
    } else {
      out.push(g);
    }
  }
  // A short trailing beat that could not merge forward is folded back.
  if (out.length > 1 && dur(out[out.length - 1]!) < MIN_BEAT_SEC) {
    const last = out.pop()!;
    out[out.length - 1] = [...out[out.length - 1]!, ...last];
  }
  return out;
}

function sectionAt(t: number, script: Script): ScriptSection['label'] {
  const hit = script.sections.find((s) => t >= s.startSec && t < s.endSec);
  if (hit) return hit.label;
  return t < (script.sections[0]?.endSec ?? 0) ? 'hook' : 'body';
}

function estimateWordTimings(script: Script, durationSec: number): WordTiming[] {
  const words = script.fullText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const per = durationSec / words.length;
  return words.map((word, i) => ({ word, startSec: i * per, endSec: (i + 1) * per }));
}
