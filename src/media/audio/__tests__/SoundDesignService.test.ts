import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { SoundDesignService } from '../SoundDesignService.js';
import type { Script } from '../../../shared/types.js';

const runFfmpegMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../shared/ffmpegExec.js', () => ({
  runFfmpeg: (...args: unknown[]) => runFfmpegMock(...args),
}));

const TEST_ROOT = path.join(os.tmpdir(), 'sound-design-service-test-' + randomUUID());
const PLACEHOLDER_DIR = `${TEST_ROOT}/placeholders`;
const MUSIC_LIB = `${TEST_ROOT}/music`;

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    idea: { title: 'T', angle: 'A', niche: 'luxury-food', visualKeywords: [] },
    sections: [
      { label: 'hook', text: 'Sure this sounds fake', startSec: 0, endSec: 3 },
      { label: 'body', text: 'Here is the annoying part', startSec: 3, endSec: 11 },
      { label: 'cta', text: 'Follow for more', startSec: 11, endSec: 15 },
    ],
    fullText: 'Sure this sounds fake. Here is the annoying part. Follow for more.',
    estimatedDurationSec: 15,
    visualKeywords: [],
    ...overrides,
  };
}

describe('SoundDesignService', () => {
  afterEach(async () => {
    runFfmpegMock.mockClear();
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  it('falls back to a synthesized placeholder when no music library is configured', async () => {
    const service = new SoundDesignService(undefined, undefined, PLACEHOLDER_DIR);
    const plan = await service.plan(makeScript());

    expect(plan.musicPath).toBe(`${PLACEHOLDER_DIR}/music-pad-v2.wav`);
    expect(runFfmpegMock).toHaveBeenCalled();
  });

  it('caches a synthesized placeholder instead of re-synthesizing on every call', async () => {
    const service = new SoundDesignService(undefined, undefined, PLACEHOLDER_DIR);
    await mkdir(PLACEHOLDER_DIR, { recursive: true });
    await writeFile(`${PLACEHOLDER_DIR}/music-pad-v2.wav`, 'already-there');

    const plan = await service.plan(makeScript());

    expect(plan.musicPath).toBe(`${PLACEHOLDER_DIR}/music-pad-v2.wav`);
    const musicSynthCalls = runFfmpegMock.mock.calls.filter((call) =>
      String(call[0]).includes('sine=frequency=220'),
    );
    expect(musicSynthCalls).toHaveLength(0);
  });

  it('prefers a real track from the music library over the placeholder', async () => {
    await mkdir(`${MUSIC_LIB}/curious`, { recursive: true });
    await writeFile(`${MUSIC_LIB}/curious/track1.mp3`, 'fake-mp3');

    const service = new SoundDesignService(MUSIC_LIB, undefined, PLACEHOLDER_DIR);
    // "guess" + "why" match the curious mood keyword list.
    const plan = await service.plan(
      makeScript({ fullText: 'Guess why this costs so much. It is genuinely weird.' }),
    );

    expect(plan.musicPath).toBe(`${MUSIC_LIB}/curious/track1.mp3`);
  });

  it('builds a whoosh cue at every section transition and a riser before the CTA', async () => {
    const service = new SoundDesignService(undefined, undefined, PLACEHOLDER_DIR);
    const script = makeScript();
    const plan = await service.plan(script);

    // sections: hook(0-3), body(3-11), cta(11-15)
    // -> whoosh @ body.startSec (3), whoosh @ cta.startSec (11), riser @ cta.startSec - 0.35 (10.65)
    expect(plan.sfxCues).toHaveLength(3);
    const atSecs = plan.sfxCues.map((c) => c.atSec).sort((a, b) => a - b);
    expect(atSecs[0]).toBeCloseTo(3, 5);
    expect(atSecs[1]).toBeCloseTo(10.65, 5);
    expect(atSecs[2]).toBeCloseTo(11, 5);
  });

  it('produces no SFX cues for a single-section script (no transitions)', async () => {
    const service = new SoundDesignService(undefined, undefined, PLACEHOLDER_DIR);
    const script = makeScript({
      sections: [{ label: 'hook', text: 'Just one section', startSec: 0, endSec: 5 }],
    });
    const plan = await service.plan(script);

    expect(plan.sfxCues).toHaveLength(0);
  });
});
