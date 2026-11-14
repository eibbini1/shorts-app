import {interpolate, Easing} from 'remotion';
import type {Pose} from '../Crumb';

/**
 * "Crumb on the plate": the tiny chef stands ON the food and works it, in the spirit of table-top projection-mapped dining.
 * Anchors are canvas pixels (720x1280) read off the rendered footage, one keyframe per camera move; scale 0.35-0.55 keeps him tiny next to the dish.
 * Per film: copy this file, re-read the anchors from a gridded contact sheet, rename the actions to the new beats.
 */
type Key = {t: number; x: number; y: number; s: number};
const KEYS: Key[] = [
  {t: 0.6, x: 520, y: 690, s: 0.35}, {t: 3.9, x: 580, y: 800, s: 0.52},   // 1 wide to push-in: bun top beside the truffle
  {t: 4.2, x: 590, y: 800, s: 0.5}, {t: 8.8, x: 570, y: 715, s: 0.42},    // 2 foie close-up while the spoon works
  {t: 9.1, x: 389, y: 734, s: 0.42}, {t: 10.9, x: 389, y: 734, s: 0.42},  // 3 countdown on the bun
  {t: 11.1, x: 490, y: 659, s: 0.4}, {t: 12.9, x: 490, y: 659, s: 0.4},   // 4 reveal on the sausage slices
  {t: 13.1, x: 230, y: 640, s: 0.38}, {t: 16, x: 230, y: 640, s: 0.38},   // 5 closing bow
];
const E = Easing.inOut(Easing.cubic);
const lerpKey = (t: number, f: (k: Key) => number) => interpolate(t, KEYS.map((k) => k.t), KEYS.map(f), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E});
const ramp = (t: number, a: number[], b: number[]) => interpolate(t, a, b, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E});
const hop = (t: number, at: number) => (t > at && t < at + 0.4 ? Math.sin(((t - at) / 0.4) * Math.PI) * 26 : 0);

export function platePose(t: number): Pose {
  const wob = Math.sin(t * 7);
  const p: Pose = {x: lerpKey(t, (k) => k.x), y: lerpKey(t, (k) => k.y), scale: lerpKey(t, (k) => k.s), bob: 0, lean: 0, armL: 8, armR: -8, legL: 0, legR: 0, head: 0, mouth: 'smile', blink: 1, visible: 1};
  if (t < 4.1) {            // pops up out of the bun, waves at the camera
    const pop = ramp(t, [0.4, 1.0], [0, 1]);
    return {...p, visible: pop, scale: p.scale * (0.6 + 0.4 * pop) * (t > 0.9 && t < 1.2 ? 1.12 : 1), armR: -(115 + Math.sin(t * 9) * 25) * ramp(t, [1.2, 1.8, 3.4, 4.0], [0, 1, 1, 0]), mouth: 'grin', head: Math.sin(t * 3) * 5};
  }
  if (t < 9) {              // sprinkles truffle shavings over the foie gras, nods at the spoon
    const k = t - 4.1;
    const swing = Math.sin(k * 8);
    return {...p, armR: -(70 + swing * 35), armL: 20, lean: -4 + swing * 3, head: Math.sin(k * 3) * 6, mouth: swing > 0.2 ? 'open' : 'grin', bob: Math.abs(Math.sin(k * 4)) * 4};
  }
  if (t < 11) {             // counts down with hops, holds up fingers
    return {...p, bob: Math.max(hop(t, 9.2), hop(t, 9.75), hop(t, 10.3)), armR: -150, armL: -20, mouth: 'open', head: wob * 3};
  }
  if (t < 13) {             // reveal: arms up, big grin, little shimmy
    const k = t - 11;
    return {...p, armL: -150 * ramp(k, [0, 0.4], [0, 1]), armR: 150 * ramp(k, [0, 0.4], [0, 1]), bob: Math.abs(Math.sin(k * 6)) * 10, mouth: 'grin', lean: wob * 2, legL: wob * 5, legR: -wob * 5};
  }
  const k = t - 13;         // chef's bow, then a wave goodbye
  const bow = ramp(k, [0.3, 1.0, 1.8, 2.3], [0, 1, 1, 0]);
  return {...p, lean: 24 * bow, head: 10 * bow, armL: -25 * bow, armR: -120 * ramp(k, [2.3, 2.7], [0, 1]) + Math.sin(k * 10) * 14 * ramp(k, [2.7, 3], [0, 1]), mouth: 'grin'};
}
