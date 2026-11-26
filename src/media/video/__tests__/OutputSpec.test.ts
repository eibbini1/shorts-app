import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OUTPUT_SPEC,
  OUTPUT_SPEC,
  buildLoudnormFilter,
  checkOutputSpec,
  isQaLoudnessOk,
  loadOutputSpec,
} from '../OutputSpec.js';

describe('shared OutputSpec', () => {
  it('stays in exact sync with data/output-spec.json and falls back cleanly on ENOENT', () => {
    const onDisk = JSON.parse(
      fs.readFileSync(new URL('../../../../data/output-spec.json', import.meta.url), 'utf8'),
    );
    expect(onDisk).toEqual(DEFAULT_OUTPUT_SPEC);
    expect(OUTPUT_SPEC).toEqual(onDisk);
    expect(loadOutputSpec(new URL('./does-not-exist-output-spec.json', import.meta.url))).toEqual(
      DEFAULT_OUTPUT_SPEC,
    );
  });

  it('builds consistent loudnorm filter and evaluates loudness QA bounds', () => {
    expect(buildLoudnormFilter()).toBe('loudnorm=I=-15:TP=-1.5:LRA=11');
    expect(buildLoudnormFilter({ printJson: true })).toBe('loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json');
    expect(isQaLoudnessOk(-15.0, -1.5)).toBe(true);
    expect(isQaLoudnessOk(-19.5, -1.5)).toBe(false);
    expect(isQaLoudnessOk(-15.0, -0.2)).toBe(false);
  });

  it('accepts conforming vertical and wide streams and rejects non-conforming exports', () => {
    const valid = checkOutputSpec(
      {
        width: 1080,
        height: 1920,
        fps: 30,
        videoCodec: 'h264',
        pixelFormat: 'yuv420p',
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRateHz: 48000,
        durationSeconds: 30.05,
        lufs: -15.2,
        truePeakDb: -1.4,
      },
      { orientation: 'vertical', expectedSeconds: 30 },
    );
    expect(valid).toEqual({ ok: true, issues: [], specVersion: 1 });

    const invalid = checkOutputSpec(
      {
        width: 1920,
        height: 1080,
        fps: 15,
        videoCodec: 'vp9',
        pixelFormat: 'yuv444p',
        hasAudio: false,
        durationSeconds: 20,
        lufs: -22,
        truePeakDb: 0.1,
      },
      { orientation: 'vertical', expectedSeconds: 30 },
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.issues.some((i) => i.includes('vertical orientation'))).toBe(true);
    expect(invalid.issues.some((i) => i.includes('frame rate'))).toBe(true);
    expect(invalid.issues.some((i) => i.includes('video codec'))).toBe(true);
    expect(invalid.issues.some((i) => i.includes('audio stream is missing'))).toBe(true);
    expect(invalid.issues.some((i) => i.includes('loudness'))).toBe(true);
  });
});
