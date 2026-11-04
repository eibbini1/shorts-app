import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import { SubtitleBuilder } from '../SubtitleBuilder.js';
import type { AudioAsset, Script } from '../../../shared/types.js';

const script: Script = {
  idea: { title: 'T', angle: 'A', niche: 'luxury-food', visualKeywords: [] },
  sections: [
    { label: 'hook', text: 'You wont believe this one trick', startSec: 0, endSec: 3 },
    { label: 'body', text: 'word '.repeat(12).trim(), startSec: 3, endSec: 11 },
    { label: 'cta', text: 'Follow for more', startSec: 11, endSec: 15 },
  ],
  fullText: '',
  estimatedDurationSec: 15,
  visualKeywords: [],
};

const TEST_OUT = path.join(os.tmpdir(), 'subtitle-builder-test.srt-' + randomUUID());

describe('SubtitleBuilder', () => {
  afterEach(async () => {
    await rm(TEST_OUT, { force: true });
  });

  it('builds cues that stay within each section time window', () => {
    const builder = new SubtitleBuilder();
    const track = builder.build(script);

    expect(track.cues.length).toBeGreaterThan(0);
    for (const cue of track.cues) {
      expect(cue.startSec).toBeGreaterThanOrEqual(0);
      expect(cue.endSec).toBeLessThanOrEqual(15);
      expect(cue.endSec).toBeGreaterThan(cue.startSec);
    }
  });

  it('chunks long sections into multiple cues of ~6 words each', () => {
    const builder = new SubtitleBuilder();
    const track = builder.build(script);

    // The body section has 12 words -> should split into 2 cues of 6 words.
    const bodyCues = track.cues.filter((c) => c.startSec >= 3 && c.endSec <= 11);
    expect(bodyCues.length).toBe(2);
  });

  it('assigns sequential 1-based indices across all cues', () => {
    const builder = new SubtitleBuilder();
    const track = builder.build(script);

    const indices = track.cues.map((c) => c.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(indices[0]).toBe(1);
  });

  it('writes a valid .srt file with HH:MM:SS,mmm timestamps', async () => {
    const builder = new SubtitleBuilder();
    const track = builder.build(script);
    const written = await builder.writeSrt(track, TEST_OUT);

    expect(written.srtPath).toBe(TEST_OUT);

    const contents = await readFile(TEST_OUT, 'utf-8');

    expect(contents).toMatch(/^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/m);
    expect(contents).toContain('You wont believe');
  });
});

const TEST_ASS_OUT = path.join(os.tmpdir(), 'subtitle-builder-test.ass-' + randomUUID());

const audioWithWordTimings: AudioAsset = {
  path: '/tmp/fake-narration.mp3',
  durationSec: 3,
  wordTimings: [
    { word: 'Sure,', startSec: 0, endSec: 0.4 },
    { word: 'this', startSec: 0.4, endSec: 0.7 },
    { word: 'sounds', startSec: 0.7, endSec: 1.1 },
    { word: 'fake.', startSec: 1.1, endSec: 1.5 },
    { word: 'It', startSec: 1.5, endSec: 1.7 },
    { word: 'costs', startSec: 1.7, endSec: 2.0 },
    { word: '$1,000.', startSec: 2.0, endSec: 2.6 },
  ],
};

describe('SubtitleBuilder word-level (.ass) captions', () => {
  afterEach(async () => {
    await rm(TEST_ASS_OUT, { force: true });
  });

  it('groups word timings into bursts of at most 3 words', () => {
    const builder = new SubtitleBuilder();
    const cues = builder.buildWordCues(audioWithWordTimings, script);

    for (const cue of cues) {
      expect(cue.words.length).toBeLessThanOrEqual(3);
      expect(cue.words.length).toBeGreaterThan(0);
    }
    // 7 words at <=3/cue -> at least 3 cues.
    expect(cues.length).toBeGreaterThanOrEqual(3);
  });

  it('derives each cue start/end from its first/last word timing', () => {
    const builder = new SubtitleBuilder();
    const cues = builder.buildWordCues(audioWithWordTimings, script);

    expect(cues[0]!.startSec).toBe(0);
    expect(cues[0]!.words[0]).toBe('Sure,');
  });

  it('trusts real TTS word timings even when they differ from script section timestamps', () => {
    const builder = new SubtitleBuilder();
    const measuredAudio: AudioAsset = {
      ...audioWithWordTimings,
      durationSec: 1.5,
      wordTimings: [
        { word: 'Only', startSec: 0, endSec: 0.5 },
        { word: 'the', startSec: 0.5, endSec: 1 },
        { word: 'audio', startSec: 1, endSec: 1.5 },
      ],
    };

    const cues = builder.buildWordCues(measuredAudio, script);

    expect(cues[0]).toEqual({ index: 1, startSec: 0, endSec: 1.5, words: ['Only', 'the', 'audio'] });
  });

  it('falls back to section-based cues when no word timings are present', () => {
    const builder = new SubtitleBuilder();
    const noTimings: AudioAsset = { path: '/tmp/x.wav', durationSec: 15 };
    const cues = builder.buildWordCues(noTimings, script);

    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.words.length > 0)).toBe(true);
  });

  it('writes a valid .ass file with embedded styles and emphasized keywords', async () => {
    const builder = new SubtitleBuilder();
    const cues = builder.buildWordCues(audioWithWordTimings, script);
    const outPath = await builder.writeAss(cues, TEST_ASS_OUT);

    expect(outPath).toBe(TEST_ASS_OUT);
    const contents = await readFile(TEST_ASS_OUT, 'utf-8');

    expect(contents).toContain('[V4+ Styles]');
    expect(contents).toContain('[Events]');
    expect(contents).toContain(
      'Style: Caption,Poppins,100,&H00FFFFFF,&H0000D7FF,&H00101010,&H99000000,-1,0,0,0,100,100,1,0,1,7,4,2,90,90,520,1',
    );
    expect(contents).toMatch(/Dialogue: 0,\d:\d{2}:\d{2}\.\d{2},\d:\d{2}:\d{2}\.\d{2},Caption,/);
    // "fake." and the dollar amount should get the emphasis color override.
    expect(contents).toMatch(/\{\\c&H0000D7FF&(\\fscx112\\fscy112)?\}fake\./);
    expect(contents).toMatch(/\{\\c&H0000D7FF&(\\fscx112\\fscy112)?\}\$1,000\./);
    // Pop-in scale animation should be present on each line.
    expect(contents).toContain('\\t(90,170,\\fscx100\\fscy100)');
  });
});
