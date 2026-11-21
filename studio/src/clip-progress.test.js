import { describe, expect, it } from 'vitest';
import { clipProgress } from './clip-progress.js';

const base = { total: 4, startedAt: 1_000_000, now: 1_000_000 + 400_000, cycleSec: 200 };

describe('clipProgress', () => {
  it('marks finished clips done, the first missing clip active, the rest queued', () => {
    const clips = clipProgress({ ...base, doneShots: [1, 2], lastDoneAt: 1_000_000 + 350_000 });
    expect(clips.map((c) => c.state)).toEqual(['done', 'done', 'active', 'queued']);
    expect(clips[2].elapsedSec).toBe(50);
  });

  it('times the first clip from the render start plus the setup allowance', () => {
    const clips = clipProgress({ ...base, doneShots: [] });
    expect(clips[0]).toMatchObject({ state: 'active', elapsedSec: 390 });
  });

  it('flags a clip running well past the measured pace as slow, and only then', () => {
    expect(clipProgress({ ...base, doneShots: [1], lastDoneAt: base.now - 301_000 })[1].slow).toBe(true);
    expect(clipProgress({ ...base, doneShots: [1], lastDoneAt: base.now - 299_000 })[1].slow).toBe(false);
  });

  it('has no active clip once every clip exists, and handles empty or odd input', () => {
    expect(clipProgress({ ...base, doneShots: [1, 2, 3, 4] }).every((c) => c.state === 'done')).toBe(true);
    expect(clipProgress({ ...base, total: 0 })).toEqual([]);
    expect(clipProgress({ ...base, total: undefined })).toEqual([]);
  });

  it('never reports a negative elapsed time', () => {
    expect(clipProgress({ ...base, doneShots: [1], lastDoneAt: base.now + 5000 })[1].elapsedSec).toBe(0);
  });
});
