import { describe, it, expect } from 'vitest';
import { buildAudioMixFilter, buildCrossfadeChain } from '../VideoRenderer.js';

describe('buildCrossfadeChain', () => {
  it('returns a passthrough for a single scene (no crossfade possible)', () => {
    const { filter, outputLabel } = buildCrossfadeChain([5], 0.35);
    expect(outputLabel).toBe('vjoined');
    expect(filter).toContain('[v0]');
    expect(filter).not.toContain('xfade');
  });

  describe('buildAudioMixFilter', () => {
    it('ducks music from narration without changing the no-music path', () => {
      const result = buildAudioMixFilter({
        audioInputIndex: 2,
        musicInputIndex: 3,
        sfxInputBaseIndex: 4,
        hasMusic: true,
        sfxCues: [],
      });

      expect(result.mapArgs).toEqual(['-map', '[aout]']);
      expect(result.filter).toContain('asplit=2[narration][narrationSidechain]');
      expect(result.filter).toContain('sidechaincompress');
      expect(result.filter).toContain('amix=inputs=2');
    });

    it('keeps narration plus SFX robust when music is absent', () => {
      const result = buildAudioMixFilter({
        audioInputIndex: 2,
        musicInputIndex: 3,
        sfxInputBaseIndex: 4,
        hasMusic: false,
        sfxCues: [{ path: 'whoosh.wav', atSec: 1.2 }],
      });

      expect(result.filter).not.toContain('sidechaincompress');
      expect(result.filter).toContain('adelay=delays=1200:all=1');
      expect(result.filter).toContain('amix=inputs=2');
    });

    it('maps narration directly when no music or SFX are present', () => {
      const result = buildAudioMixFilter({
        audioInputIndex: 2,
        musicInputIndex: 3,
        sfxInputBaseIndex: 4,
        hasMusic: false,
        sfxCues: [],
      });

      expect(result.filter).toBe('');
      expect(result.mapArgs).toEqual(['-map', '2:a']);
    });
  });

  it('chains N-1 xfade transitions for N scenes, ending on [vjoined]', () => {
    const { filter, outputLabel } = buildCrossfadeChain([3, 3, 3, 3], 0.35);
    expect(outputLabel).toBe('vjoined');
    const xfadeCount = (filter.match(/xfade=/g) ?? []).length;
    expect(xfadeCount).toBe(3);
    expect(filter).toContain('[v0][v1]xfade');
    expect(filter).toContain('[v3]xfade'); // last scene feeds into the final transition
    expect(filter.endsWith('[vjoined]')).toBe(true);
  });

  it('computes offsets that increase by (sceneDur - xfadeDur) per transition for equal-length scenes', () => {
    const sceneDur = 3;
    const xfadeDur = 0.35;
    const { filter } = buildCrossfadeChain([sceneDur, sceneDur, sceneDur], xfadeDur);

    const offsets = [...filter.matchAll(/offset=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toBeCloseTo(1 * (sceneDur - xfadeDur), 3);
    expect(offsets[1]).toBeCloseTo(2 * (sceneDur - xfadeDur), 3);
  });

  it('computes cumulative-duration offsets for variable-length scenes (hook/body/cta)', () => {
    // A 3s hook, an 8s body, a 4s CTA — exactly the shape ScriptGenerator produces.
    const xfadeDur = 0.35;
    const { filter } = buildCrossfadeChain([3, 8, 4], xfadeDur);

    const offsets = [...filter.matchAll(/offset=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(2);
    // Transition 1: combines scene0(3s) + scene1 -> offset = 3 - 1*0.35
    expect(offsets[0]).toBeCloseTo(3 - xfadeDur, 3);
    // Transition 2: combines (scene0+scene1=11s) + scene2 -> offset = 11 - 2*0.35
    expect(offsets[1]).toBeCloseTo(11 - 2 * xfadeDur, 3);
  });

  it('never emits a negative offset even for a very short first scene', () => {
    const { filter } = buildCrossfadeChain([0.1, 5], 0.35);
    const offsets = [...filter.matchAll(/offset=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(offsets.every((o) => o >= 0)).toBe(true);
  });

  it('uses the requested crossfade duration in every transition', () => {
    const { filter } = buildCrossfadeChain([3, 3, 3], 0.5);
    const durations = [...filter.matchAll(/duration=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(durations.every((d) => d === 0.5)).toBe(true);
  });

  it('supports the proposed 2s visual pacing for a typical 30s video', () => {
    const sceneDurations = Array.from({ length: 16 }, () => 2);
    const { filter } = buildCrossfadeChain(sceneDurations, 0.35);

    expect((filter.match(/xfade=/g) ?? []).length).toBe(15);
  });
});
