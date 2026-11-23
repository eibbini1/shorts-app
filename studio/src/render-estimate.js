// Render-time estimates for the Studio. Standard figures were calibrated on this Mac at 576x1024 (see extras.jsx history);
// High (704x1280, 97 frames) was measured on the 16 GB M1 at 866.0 s and 854.6 s per clip (2026-11-22).
export const EST = { cycle: 274, cycleLow: 240, cycleHigh: 315, finish: 70, start: 10 };
export const EST_HIGH = { cycle: 860, cycleLow: 800, cycleHigh: 930, finish: 70, start: 10 };
export const estFor = (quality) => (quality === 'high' ? EST_HIGH : EST);
export const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// the pipeline cuts a shot into ceil(seconds / 5) clips, so time follows clips, not shots
export const clipsOf = (shots) => (shots || []).reduce((n, sh) => n + Math.max(1, Math.ceil((sh.seconds || 5) / 5)), 0);
export const planEstimate = (n, quality) => {
  const e = estFor(quality);
  return { low: e.start + n * e.cycleLow + e.finish - 10, mid: e.start + n * e.cycle + e.finish, high: e.start + n * e.cycleHigh + e.finish + 15 };
};
