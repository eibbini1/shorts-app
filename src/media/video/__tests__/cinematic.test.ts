import { describe, it, expect } from 'vitest';
import { buildCinematicGrade, pickCameraMove, pickTransition } from '../cinematic.js';
import { buildCrossfadeChain } from '../VideoRenderer.js';

describe('cinematic helpers', () => {
  it('gives the hook a punch-in and the CTA a pull-back', () => {
    expect(pickCameraMove(0, 8, 60, 'hook').name).toBe('hook-punch');
    expect(pickCameraMove(7, 8, 60, 'cta').name).toBe('cta-pull-back');
  });

  it('never repeats the same camera move on consecutive body scenes', () => {
    const names = Array.from({ length: 6 }, (_, i) => pickCameraMove(i + 1, 8, 60, 'body').name);
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
  });

  it('is deterministic for the same scene index', () => {
    expect(pickCameraMove(3, 8, 60, 'body')).toEqual(pickCameraMove(3, 8, 60, 'body'));
  });

  it('choreographs transitions: energetic first, fadeblack before CTA', () => {
    const count = 7;
    const all = Array.from({ length: count }, (_, i) => pickTransition(i, count));
    expect(all[0]).toBe('smoothleft');
    expect(all[count - 1]).toBe('fadeblack');
  });

  it('threads the chosen transitions into the xfade chain', () => {
    const { filter } = buildCrossfadeChain([3, 3, 3], 0.4, ['smoothleft', 'fadeblack']);
    expect(filter).toContain('xfade=transition=smoothleft');
    expect(filter).toContain('xfade=transition=fadeblack');
  });

  it('adds LUT only when configured and grain only when > 0', () => {
    expect(buildCinematicGrade({}).pre).not.toContain('lut3d');
    expect(buildCinematicGrade({ lutPath: '/tmp/a.cube' }).pre).toContain("lut3d=file='/tmp/a.cube'");
    expect(buildCinematicGrade({ grain: 0 }).post).not.toContain('noise=');
  });
});
