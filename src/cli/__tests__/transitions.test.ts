import { describe, it, expect } from 'vitest';
import { transitionIn, transitionOut } from '../../media/assemble/stillsEpisode.js';

describe('scene transitions', () => {
  it('defaults to a dip-to-black fade', () => {
    expect(transitionIn()).toContain('fade=t=in');
    expect(transitionOut(undefined, 5)).toContain('fade=t=out:st=4.72');
  });
  it('flash uses white and is shorter than a fade', () => {
    expect(transitionIn('flash')).toContain('color=white');
    expect(transitionOut('flash', 5)).toContain('st=4.86');
  });
  it('gold uses the gold colour on both sides', () => {
    expect(transitionIn('gold')).toContain('0xC9A24B');
    expect(transitionOut('gold', 5)).toContain('0xC9A24B');
  });
  it('whip blurs horizontally on both sides of a hard cut', () => {
    expect(transitionIn('whip')).toContain('gblur');
    expect(transitionOut('whip', 5)).toContain("gte(t,4.90)");
  });
  it('cut has no fades; punch pops brightness on entry only', () => {
    expect(transitionIn('cut')).toBe('');
    expect(transitionOut('cut', 5)).toBe('');
    expect(transitionOut('punch', 5)).toBe('');
    expect(transitionIn('punch')).toContain('eq=brightness');
  });
});
