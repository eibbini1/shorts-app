import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';

/**
 * Crumb: original 2D-rigged tiny chef (Billionaire Bites). SVG joints are rotated groups, so the same
 * pose data can later drive a 3D rig. Transparent background; composited over footage with ffmpeg.
 */
export type Pose = {
  x: number; y: number; scale: number; flip?: boolean;   // canvas position of the feet, uniform scale
  bob: number; lean: number;                              // body bounce (px) and lean (deg)
  armL: number; armR: number;                             // shoulder angles (deg), 0 = hanging down
  legL: number; legR: number;                             // hip swing (deg)
  head: number; mouth: 'smile' | 'open' | 'flat' | 'grin';
  blink: number; visible: number;                         // 1 = open eyes; 0..1 slide-in amount
};

const ease = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number[], b: number[]) => interpolate(t, a, b, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

/** Seconds-based action script for the 30 s film: one beat per 5 s shot, always on the slate edge (lower left/right). */
export function poseAt(t: number): Pose {
  const base: Pose = {x: 150, y: 1210, scale: 0.5, bob: 0, lean: 0, armL: 8, armR: -8, legL: 0, legR: 0, head: 0, mouth: 'smile', blink: 1, visible: 1};
  const wob = Math.sin(t * 7);
  if (t < 5) {         // 1 peek in, wave at the camera
    const v = ramp(t, [0.4, 1.4], [0, 1]);
    return {...base, y: 1210 + (1 - v) * 260, visible: v, armR: -(110 + Math.sin(t * 9) * 25) * ramp(t, [1.5, 2.1, 4.2, 4.8], [0, 1, 1, 0]), mouth: 'grin', head: Math.sin(t * 3) * 4};
  }
  if (t < 10) {        // 2 cheers at the truffle cream
    const k = t - 5;
    return {...base, x: 150 + ramp(k, [0, 1.2], [0, 40]), bob: Math.abs(Math.sin(k * 6)) * 14 * ramp(k, [1, 1.5], [0, 1]), armL: -150 * ramp(k, [1, 1.6], [0, 1]), armR: 150 * ramp(k, [1, 1.6], [0, 1]), mouth: 'open', head: wob * 3};
  }
  if (t < 15) {        // 3 fans away the pan heat
    const k = t - 10;
    const fan = Math.sin(k * 14) * 18 * ramp(k, [0.6, 1.2], [0, 1]);
    return {...base, x: 560, scale: 0.5, flip: true, lean: -6 * ramp(k, [0.4, 1], [0, 1]), armR: -95 + fan, mouth: 'open', head: -4, legL: wob * 6, legR: -wob * 6};
  }
  if (t < 20) {        // 4 nods, thumbs-up as the sausage is nested
    const k = t - 15;
    return {...base, x: 160, armR: -125 * ramp(k, [1.2, 1.9], [0, 1]), head: Math.sin(k * 5) * 6 * ramp(k, [0.8, 1.2], [0, 1]), bob: Math.abs(Math.sin(k * 3)) * 5};
  }
  if (t < 25) {        // 5 tiptoes to watch the caviar spoon
    const k = t - 20;
    const up = ramp(k, [0.5, 1.4], [0, 1]);
    return {...base, x: 565, flip: true, y: 1210 - up * 12, lean: -8 * up, armL: -40 * up, armR: 40 * up, mouth: 'open', legL: 8 * up, legR: -8 * up, head: 6 * up};
  }
  const k = t - 25;    // 6 takes a bow with the toque, grin, wave goodbye
  const bow = ramp(k, [1.0, 1.8, 2.8, 3.5], [0, 1, 1, 0]);
  return {...base, x: 160, lean: 28 * bow, head: 14 * bow, armL: -30 * bow, armR: -120 * ramp(k, [3.6, 4.1], [0, 1]) + Math.sin(k * 10) * 15 * ramp(k, [4.1, 4.4], [0, 1]), mouth: 'grin', visible: ramp(k, [4.6, 5], [1, 0])};
}

const SKIN = '#E7B96A', SKIN_DARK = '#C98F3F', APRON = '#FFFFFF', GOLD = '#D4AF37', INK = '#2A1A0E';

const Arm: React.FC<{angle: number; side: 1 | -1}> = ({angle, side}) => (
  <g transform={`translate(${side * 58} 205) rotate(${angle * side})`}>
    <rect x={-10} y={-8} width={20} height={72} rx={10} fill={SKIN} stroke={SKIN_DARK} strokeWidth={3} />
    <circle cx={0} cy={68} r={14} fill={SKIN} stroke={SKIN_DARK} strokeWidth={3} />
  </g>
);

const Leg: React.FC<{angle: number; side: 1 | -1}> = ({angle, side}) => (
  <g transform={`translate(${side * 26} 300) rotate(${angle})`}>
    <rect x={-11} y={0} width={22} height={52} rx={9} fill={SKIN} stroke={SKIN_DARK} strokeWidth={3} />
    <ellipse cx={side * 5} cy={56} rx={24} ry={12} fill="#1B1B1B" />
  </g>
);

export const CrumbSprite: React.FC<{pose: Pose}> = ({pose}) => {
  const mouth = {
    smile: 'M -22 0 Q 0 22 22 0',
    grin: 'M -28 -2 Q 0 34 28 -2 Z',
    open: 'M -14 0 Q 0 30 14 0 Q 0 -8 -14 0 Z',
    flat: 'M -16 6 L 16 6',
  }[pose.mouth];
  return (
    <g transform={`translate(${pose.x} ${pose.y}) scale(${pose.flip ? -pose.scale : pose.scale} ${pose.scale}) translate(-150 -360)`} opacity={pose.visible}>
      <ellipse cx={150} cy={362} rx={110} ry={16} fill="#000" opacity={0.38} filter="url(#soft)" />
      <g transform={`translate(0 ${-pose.bob}) rotate(${pose.lean} 150 340)`}>
        <g transform="translate(150 0)"><Leg angle={pose.legL} side={-1} /><Leg angle={pose.legR} side={1} /></g>
        <g transform="translate(150 0)"><Arm angle={pose.armL} side={-1} /></g>
        <ellipse cx={150} cy={250} rx={74} ry={86} fill={SKIN} stroke={SKIN_DARK} strokeWidth={3} />
        <path d="M 96 225 L 204 225 L 214 330 Q 150 352 86 330 Z" fill={APRON} stroke="#DDD" strokeWidth={2} />
        <circle cx={150} cy={252} r={6} fill={GOLD} /><circle cx={150} cy={282} r={6} fill={GOLD} />
        <g transform="translate(150 0)"><Arm angle={pose.armR} side={1} /></g>
        <g transform={`rotate(${pose.head} 150 170)`}>
          <circle cx={150} cy={118} r={74} fill={SKIN} stroke={SKIN_DARK} strokeWidth={3} />
          {[[112, 92], [186, 104], [128, 150], [176, 148], [150, 78]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={4} fill={SKIN_DARK} opacity={0.5} />)}
          <g transform="translate(150 122)">
            <ellipse cx={-26} cy={0} rx={13} ry={15 * pose.blink} fill="#fff" /><ellipse cx={26} cy={0} rx={13} ry={15 * pose.blink} fill="#fff" />
            <circle cx={-24} cy={2} r={6 * pose.blink} fill={INK} /><circle cx={28} cy={2} r={6 * pose.blink} fill={INK} />
            <g transform="translate(0 28)"><path d={mouth} fill={pose.mouth === 'grin' || pose.mouth === 'open' ? '#7A2E22' : 'none'} stroke={INK} strokeWidth={4} strokeLinecap="round" /></g>
          </g>
          <path d="M 92 58 Q 90 -6 128 -2 Q 150 -34 172 -2 Q 212 -6 208 58 Z" fill="#fff" stroke="#DDD" strokeWidth={3} />
          <rect x={90} y={52} width={120} height={22} rx={6} fill={GOLD} />
        </g>
      </g>
    </g>
  );
};

export const Crumb: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const pose = poseAt(t);
  const blinkPhase = (t * 1000) % 3200;
  pose.blink = blinkPhase < 140 ? 0.15 : 1;
  return (
    <AbsoluteFill style={{background: 'transparent'}}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs><filter id="soft"><feGaussianBlur stdDeviation="7" /></filter></defs>
        <CrumbSprite pose={pose} />
      </svg>
    </AbsoluteFill>
  );
};
