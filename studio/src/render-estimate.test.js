import { describe, expect, it } from 'vitest';
import { EST, EST_HIGH, clipsOf, estFor, planEstimate } from './render-estimate.js';

describe('planEstimate', () => {
  it('keeps the Standard figures unchanged', () => {
    expect(estFor('standard')).toBe(EST);
    expect(estFor(undefined)).toBe(EST);
    expect(planEstimate(2).mid).toBe(10 + 2 * 274 + 70);
  });
  it('uses measured High timing (about 14-15 minutes per clip)', () => {
    expect(estFor('high')).toBe(EST_HIGH);
    const two = planEstimate(clipsOf([{ seconds: 5 }, { seconds: 5 }]), 'high');
    expect(two.mid).toBeGreaterThan(1700);
    expect(two.low).toBeLessThan(two.mid);
    expect(two.high).toBeGreaterThan(two.mid);
  });
});
