import { describe, expect, it } from 'vitest';
import { EST, EST_HIGH, clipsOf, estFor, planEstimate } from './render-estimate.js';

describe('planEstimate', () => {
  it('keeps the Standard figures unchanged', () => {
    expect(estFor('standard')).toBe(EST);
    expect(estFor(undefined)).toBe(EST);
    expect(planEstimate(2).mid).toBe(10 + 2 * 274 + 70);
  });
  it('covers the measured High timing and keeps the midpoint within 20% of the samples', () => {
    expect(estFor('high')).toBe(EST_HIGH);
    for (const seconds of [854.6, 866, 923.9, 1090.1, 1179.6]) {
      expect(seconds).toBeGreaterThanOrEqual(EST_HIGH.cycleLow);
      expect(seconds).toBeLessThanOrEqual(EST_HIGH.cycleHigh);
      expect(Math.abs(EST_HIGH.cycle - seconds) / seconds).toBeLessThan(0.2);
    }
    const two = planEstimate(clipsOf([{ seconds: 5 }, { seconds: 5 }]), 'high');
    expect(two.mid).toBeGreaterThan(1700);
    expect(two.low).toBeLessThan(two.mid);
    expect(two.high).toBeGreaterThan(two.mid);
  });
});
