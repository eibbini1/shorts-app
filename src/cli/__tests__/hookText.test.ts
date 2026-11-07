import { describe, expect, it } from 'vitest';
import { scoreHook } from '../viralUtils.js';

describe('scoreHook hookText', () => {
  const longFirst = 'Guess why this one thousand dollar banned truffle is a secret that changes everything you know about dinner.';
  const rest = ['Only three chefs know it.', 'It is gold.', 'Bidders pay fortunes.', 'People say it is mad.', 'Genius or scam? Drop your take below.'];

  it('earns the short-hook bonus from a short hookText even when scene 1 is long', () => {
    const withoutHook = scoreHook([longFirst, ...rest]);
    const withHook = scoreHook([longFirst, ...rest], 'Guess why this $1,000 truffle is banned');
    expect(withoutHook.breakdown.shortHook).toBe(0);
    expect(withHook.breakdown.shortHook).toBe(15);
  });

  it('falls back to scene 1 when hookText is blank', () => {
    expect(scoreHook([longFirst, ...rest], '  ').breakdown.shortHook).toBe(0);
  });
});
