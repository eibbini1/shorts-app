import { describe, it, expect } from 'vitest';
import { scoreHook, pinnedComment, CTA_BANK } from '../viralUtils.js';
import { compare, fingerprint, jaccard } from '../variation.js';

describe('hook score v2', () => {
  it('rewards tension + opinion-gap close over a plain showcase', () => {
    const good = scoreHook([
      'This cheese is illegal to sell for $50.',
      'Why is it banned?', 'a', 'b', 'c',
      'Should this stay illegal? Drop your take below.',
    ]);
    const plain = scoreHook([
      'This wagyu steak costs 159 pounds.',
      'It is very tender.', 'a', 'b', 'c',
      'Would you eat this?',
    ]);
    expect(good.breakdown.tension).toBe(10);
    expect(good.breakdown.cta).toBe(12);
    expect(plain.breakdown.showcasePenalty).toBe(-15);
    expect(plain.breakdown.cta).toBe(5);
    expect(good.score).toBeGreaterThan(plain.score + 25);
  });
  it('never goes below 0 or above 100', () => {
    expect(scoreHook(['x']).score).toBeGreaterThanOrEqual(0);
    expect(scoreHook(['$1 illegal gold caviar vs truffle', 'why', 'a', 'b', 'c', 'Genius or scam? again']).score).toBeLessThanOrEqual(100);
  });
  it('every CTA in the bank scores as an opinion gap', () => {
    for (const lines of Object.values(CTA_BANK)) for (const l of lines) {
      expect(scoreHook(['x', 'y', 'a', 'b', 'c', l]).breakdown.cta).toBe(12);
    }
  });
  it('pinned comment fits the topic family', () => {
    expect(pinnedComment('taboo', 'casu marzu')).toContain('casu marzu');
    expect(pinnedComment('price', 'a gold burger')).toContain('$1,000');
  });
});

describe('variation guard', () => {
  const a = fingerprint(['This burger is covered in gold.', 'x', 'Would you take a bite? Follow for more.']);
  it('flags same opener and identical close', () => {
    const b = fingerprint(['This burger is dipped in caviar.', 'y', 'Would you take a bite? Follow for more.']);
    const issues = compare(a, b);
    expect(issues.some((s) => s.includes('same opener'))).toBe(true);
    expect(issues).toContain('identical closing line');
  });
  it('passes a genuinely different Short', () => {
    const c = fingerprint(['In Sardinia, one cheese is outlawed.', 'z', 'Should this stay illegal? Drop your take below.']);
    expect(compare(a, c)).toEqual([]);
  });
  it('jaccard is 1 for identical text, 0 for disjoint', () => {
    expect(jaccard('one two three four', 'one two three four')).toBe(1);
    expect(jaccard('one two three four', 'five six seven eight')).toBe(0);
  });
});
