import { describe, expect, it } from 'vitest';
import { scoreHook, spokenToDigits } from '../viralUtils.js';

describe('spokenToDigits', () => {
  it('converts currency amounts', () => {
    expect(spokenToDigits('This steak costs one hundred fifty nine pounds')).toBe('This steak costs £159');
    expect(spokenToDigits('Would you pay a thousand dollars for a burger?')).toBe('Would you pay $1,000 for a burger?');
    expect(spokenToDigits('This burger costs two thousand dollars.')).toBe('This burger costs $2,000.');
    expect(spokenToDigits('served for twenty five thousand dollars,')).toBe('served for $25,000,');
    expect(spokenToDigits('over three hundred thousand dollars')).toBe('over $300,000');
  });
  it('converts plain numbers and keeps other words', () => {
    expect(spokenToDigits('Five courses, one night')).toBe('5 courses, 1 night');
    expect(spokenToDigits('a thousand dirhams')).toBe('1,000 dirhams');
    expect(spokenToDigits('hand-picked saffron')).toBe('hand-picked saffron');
    expect(spokenToDigits('twenty-four karat gold')).toBe('24 karat gold');
  });
});

describe('scoreHook', () => {
  it('rewards a price-first, short, question-ending script and discriminates weak ones', () => {
    const good = scoreHook(['This steak costs 159 pounds. Here is why.', 'It is gold.', 'a', 'b', 'c', 'Would you pay extra? Follow for more.']);
    const weak = scoreHook(['Welcome to our channel where today we are going to talk about many different kinds of food around the world', 'x', 'y']);
    expect(good.score).toBeGreaterThan(weak.score + 30);
    expect(weak.fixes.length).toBeGreaterThan(2);
  });
});
