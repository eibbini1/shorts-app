/**
 * Pure helpers that decide *how* a Short should look and move: per-scene camera
 * moves, transition choreography, colour grade and narration mastering. Kept free
 * of I/O so every decision is unit-testable and the renderer stays a thin
 * filter-graph assembler (docs/DECISIONS.md D1).
 */

export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = 1920;
export const FPS = 30;
/** Stills are pre-scaled by this factor before zoompan so slow moves stay sub-pixel smooth (no jitter). */
export const STILL_SUPERSAMPLE = 1.25;

export type SceneRole = 'hook' | 'body' | 'cta';

export interface CameraMove {
  name: string;
  /** zoompan `z` expression (uses `on` = output frame index, `zoom` = previous zoom). */
  zoom: string;
  /** zoompan `x` / `y` expressions. */
  x: string;
  y: string;
}

/** Deterministic 0..1 value from an integer, so the same Short always gets the same camera plan. */
function seeded(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const CENTER_X = 'iw/2-(iw/zoom/2)';
const CENTER_Y = 'ih/2-(ih/zoom/2)';

/**
 * Cinematic camera plan for a still image. The hook punches in hard then
 * settles (pattern interrupt); body scenes alternate push-in / pull-out / lateral
 * drifts with eased (smoothstep) motion so consecutive shots never repeat; the
 * CTA slowly pulls back to leave room for the call to action.
 */
export function pickCameraMove(sceneIndex: number, sceneCount: number, frames: number, role: SceneRole): CameraMove {
  const f = Math.max(2, frames);
  // Smoothstep progress 0..1 across the scene: eased start AND end = "operated camera", not a linear zoom.
  const p = `(on/${f})`;
  const ease = `(${p}*${p}*(3-2*${p}))`;

  if (role === 'hook') {
    return {
      name: 'hook-punch',
      zoom: `if(lte(on,9),1.18-0.018*on,min(1.0+0.0012*(on-9),1.08))`,
      x: CENTER_X,
      y: CENTER_Y,
    };
  }
  if (role === 'cta' || sceneIndex === sceneCount - 1) {
    return { name: 'cta-pull-back', zoom: `1.10-0.08*${ease}`, x: CENTER_X, y: CENTER_Y };
  }

  // Rotating through 4 moves guarantees no two consecutive body shots share a move;
  // the seeded offset just varies which move a given Short opens its body with.
  const variant = (sceneIndex + Math.floor(seeded(sceneCount) * 4)) % 4;
  switch (variant) {
    case 0:
      return { name: 'push-in', zoom: `1.0+0.10*${ease}`, x: CENTER_X, y: CENTER_Y };
    case 1:
      return { name: 'pull-out', zoom: `1.11-0.10*${ease}`, x: CENTER_X, y: CENTER_Y };
    case 2:
      // Lateral drift left->right at constant 1.12 zoom, slight lift.
      return {
        name: 'drift-right',
        zoom: '1.12',
        x: `(iw-iw/zoom)*${ease}`,
        y: `(ih-ih/zoom)*0.45`,
      };
    default:
      return {
        name: 'drift-left',
        zoom: '1.12',
        x: `(iw-iw/zoom)*(1-${ease})`,
        y: `(ih-ih/zoom)*0.55`,
      };
  }
}

/** Slow push applied to real video clips (they already move; this just adds a unifying "dolly"). */
export function videoPushExpr(durationSec: number, strength = 0.05): { w: string; h: string } {
  const d = Math.max(0.5, durationSec).toFixed(3);
  return {
    w: `${OUT_WIDTH}*(1+${strength}*min(t/${d}\\,1))`,
    h: `${OUT_HEIGHT}*(1+${strength}*min(t/${d}\\,1))`,
  };
}

/** xfade transitions available in ffmpeg >= 5. */
export type XfadeTransition =
  | 'fade' | 'fadeblack' | 'smoothleft' | 'smoothright' | 'smoothup' | 'circleopen'
  | 'zoomin' | 'fadewhite' | 'radial' | 'dissolve' | 'wipeleft';

/**
 * Transition choreography. Rules (editors follow the same logic):
 *  - hook -> first body shot: a fast energetic smooth slide (momentum into the story),
 *  - mid-body cuts alternate directions so motion keeps flowing but never feels repetitive,
 *  - one `fadeblack` "breath" before the CTA,
 *  - everything stays short (the renderer caps the duration) so retention is never spent on effects.
 */
export function pickTransition(transitionIndex: number, transitionCount: number): XfadeTransition {
  if (transitionCount <= 0) return 'fade';
  if (transitionIndex === 0) return 'smoothleft';
  if (transitionIndex === transitionCount - 1) return 'fadeblack';
  const rotation: XfadeTransition[] = ['smoothright', 'fade', 'smoothleft', 'zoomin', 'dissolve', 'smoothup'];
  return rotation[(transitionIndex - 1) % rotation.length]!;
}

export interface GradeOptions {
  /** Path to a free .cube 3D LUT (e.g. from github.com/topics/lut). Applied before the built-in grade. */
  lutPath?: string;
  /** 0..1 teal/orange split-toning amount. */
  splitTone?: number;
  /** Film grain strength (ffmpeg `noise alls`), 0 disables. */
  grain?: number;
  /** Soft highlight bloom ("halation"), 0..1. */
  bloom?: number;
}

export const DEFAULT_GRADE: Required<Omit<GradeOptions, 'lutPath'>> = {
  splitTone: 0.6,
  grain: 4,
  bloom: 0.22,
};

/**
 * One uniform "look" over the whole joined timeline. Order matters: LUT/curves first
 * (tonal base), colour balance (split toning), bloom (highlight glow), vignette,
 * then temporal grain LAST so grain also sits over the bloom like real film.
 * Returns a filter chain fragment (input/output labels supplied by the caller).
 */
export function buildCinematicGrade(opts: GradeOptions = {}): { pre: string; bloomSplit: boolean; post: string; bloom: number } {
  const split = clamp(opts.splitTone ?? DEFAULT_GRADE.splitTone, 0, 1);
  const grain = Math.max(0, opts.grain ?? DEFAULT_GRADE.grain);
  const bloom = clamp(opts.bloom ?? DEFAULT_GRADE.bloom, 0, 1);

  const pre: string[] = [];
  if (opts.lutPath) pre.push(`lut3d=file='${escapeFilterPath(opts.lutPath)}'`);
  // Gentle S-curve: lifted blacks (filmic), protected highlights, mid contrast.
  pre.push(`curves=all='0/0.03 0.25/0.21 0.5/0.52 0.75/0.80 1/0.97'`);
  pre.push('eq=saturation=1.12:contrast=1.04');
  // Warm highlights / cool shadows.
  const s = (0.10 * split).toFixed(3);
  const h = (0.08 * split).toFixed(3);
  pre.push(`colorbalance=rs=-${s}:gs=0:bs=${s}:rh=${h}:gh=${(0.02 * split).toFixed(3)}:bh=-${h}`);

  const post: string[] = ['vignette=PI/5'];
  if (grain > 0) post.push(`noise=alls=${grain}:allf=t`);
  post.push('format=yuv420p');

  return { pre: pre.join(','), bloomSplit: bloom > 0, post: post.join(','), bloom };
}

/**
 * Narration chain: rumble cut, gentle de-mud, presence lift, 3:1 compression.
 * Phone speakers need intelligible mids; this is what makes TTS sound "broadcast".
 */
export const NARRATION_CHAIN =
  'highpass=f=80,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1:g=2.5,acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=3';

/**
 * Final master: YouTube normalises to roughly -14 LUFS; delivering there avoids YouTube
 * turning a quiet Short down OR crushing a loud one. Single-pass loudnorm + true-peak limit.
 */
export const MASTER_CHAIN = 'loudnorm=I=-14:TP=-1.5:LRA=9,alimiter=limit=0.84:level=disabled';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
