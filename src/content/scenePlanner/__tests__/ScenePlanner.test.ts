import { describe, it, expect, vi } from 'vitest';
import { buildBeats, MAX_BEAT_SEC, MIN_BEAT_SEC } from '../beats.js';
import { ScenePlanner, parsePlan, ScenePlanError } from '../ScenePlanner.js';
import type { AudioAsset, Script } from '../../../shared/types.js';
import type { LLMProvider } from '../../providers/LLMProvider.js';

const TEXT = 'This burger took three hours to build. First the chef grinds fresh beef and shapes thick patties. Then he sears them on a screaming hot flat top until a dark crust forms. Melted cheddar goes on, then a toasted brioche bun. Save this recipe.';

function fixture(): { script: Script; audio: AudioAsset } {
  const words = TEXT.split(' ');
  const script = {
    idea: { title: 'The three hour burger', angle: 'a', niche: 'food-cooking', visualKeywords: ['burger'] },
    sections: [
      { label: 'hook', text: words.slice(0, 7).join(' '), startSec: 0, endSec: 3 },
      { label: 'body', text: words.slice(7, -2).join(' '), startSec: 3, endSec: 14 },
      { label: 'cta', text: 'Save this recipe.', startSec: 14, endSec: 16 },
    ],
    fullText: TEXT, estimatedDurationSec: 16, visualKeywords: ['burger'],
  } as Script;
  const audio: AudioAsset = {
    path: 'x.wav', durationSec: words.length * 0.45,
    wordTimings: words.map((word, i) => ({ word, startSec: i * 0.45, endSec: (i + 1) * 0.45 })),
  };
  return { script, audio };
}

describe('buildBeats', () => {
  it('tiles the whole narration with phrase-aligned beats of 1.6-3.4s', () => {
    const { script, audio } = fixture();
    const beats = buildBeats(script, audio);
    expect(beats[0]!.startSec).toBe(0);
    expect(beats[beats.length - 1]!.endSec).toBeCloseTo(audio.durationSec, 2);
    beats.slice(1).forEach((b, i) => expect(b.startSec).toBeCloseTo(beats[i]!.endSec, 2));
    for (const b of beats.slice(0, -1)) {
      expect(b.endSec - b.startSec).toBeGreaterThanOrEqual(MIN_BEAT_SEC - 0.01);
      expect(b.endSec - b.startSec).toBeLessThanOrEqual(MAX_BEAT_SEC + 0.9);
    }
    expect(beats.map((b) => b.text).join(' ')).toBe(TEXT);
  });

  it('keeps the words that are spoken together in the same beat', () => {
    const { script, audio } = fixture();
    const beats = buildBeats(script, audio);
    const cheddar = beats.find((b) => b.text.includes('cheddar'))!;
    expect(cheddar.text).toMatch(/Melted cheddar/);
    expect(beats.find((b) => b.text.includes('crust'))!.text).toMatch(/until a dark crust forms\.$/);
    // no beat starts or ends mid-noun-phrase around the clause word
    expect(beats.some((b) => /\buntil$/.test(b.text))).toBe(false);
  });
});

describe('ScenePlanner', () => {
  const scene = (index: number) => ({ index, objective: `Chef action number ${index} on the grill`, queries: ['chef searing burger patty', 'burger patty flat top grill', 'sizzling beef patty close'], mustShow: ['patty'], avoid: ['restaurant exterior'] });

  it('parses a valid plan and rejects short or malformed ones', () => {
    const { script, audio } = fixture();
    const beats = buildBeats(script, audio);
    const ok = parsePlan(JSON.stringify({ scenes: beats.map((b) => scene(b.index)) }), beats);
    expect(ok).toHaveLength(beats.length);
    expect(ok[0]!.source).toBe('llm');
    expect(() => parsePlan('nope', beats)).toThrow(ScenePlanError);
    expect(() => parsePlan(JSON.stringify({ scenes: [scene(0)] }), beats)).toThrow(/expected/);
    expect(() => parsePlan(JSON.stringify({ scenes: beats.map((b) => ({ ...scene(b.index), queries: ['burger'] })) }), beats)).toThrow(/concrete queries/);
  });

  it('retries once with feedback, then fails instead of inventing a plan', async () => {
    const { script, audio } = fixture();
    const beats = buildBeats(script, audio);
    const generateText = vi.fn().mockResolvedValueOnce('garbage').mockResolvedValueOnce(JSON.stringify({ scenes: beats.map((b) => scene(b.index)) }));
    const planner = new ScenePlanner({ generateText } as unknown as LLMProvider);
    expect(await planner.plan(script, beats)).toHaveLength(beats.length);
    expect(generateText.mock.calls[1]![0]).toContain('previous answer was rejected');

    const bad = new ScenePlanner({ generateText: vi.fn().mockResolvedValue('garbage') } as unknown as LLMProvider);
    await expect(bad.plan(script, beats)).rejects.toThrow(/valid scene plan/);
  });
});
