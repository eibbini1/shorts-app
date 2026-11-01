import { writeFile } from 'node:fs/promises';

const SR = 48000;

export interface SfxCue {
  t: number;
  kind: 'pop' | 'ding' | 'whoosh' | 'sparkle';
  freq?: number;
  gain?: number;
}

function env(n: number, attack: number, release: number): Float64Array {
  const e = new Float64Array(n).fill(1);
  const na = Math.max(1, Math.floor(attack * SR));
  for (let i = 0; i < na && i < n; i++) e[i] = i / na;
  const nr = Math.max(1, Math.floor(release * SR));
  for (let i = 0; i < nr && i < n; i++) e[n - 1 - i] = (e[n - 1 - i] ?? 1) * (i / nr);
  return e;
}

function pop(freq = 700, dur = 0.12): Float64Array {
  const n = Math.floor(dur * SR);
  const e = env(n, 0.002, dur * 0.8);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * freq * (1 + 1.2 * Math.exp(-t * 40))) / SR;
    out[i] = Math.sin(phase) * (e[i] ?? 0);
  }
  return out;
}

function ding(): Float64Array {
  const n = Math.floor(0.5 * SR);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * 1047 * t) + 0.5 * Math.sin(2 * Math.PI * 2094 * t)) * Math.exp(-t * 8) * 0.6;
  }
  return out;
}

function sparkle(): Float64Array {
  const out = new Float64Array(Math.floor(0.9 * SR));
  [1319, 1568, 1976, 2349, 2637, 3136].forEach((f, k) => {
    const start = Math.floor(k * 0.07 * SR);
    const n = Math.floor(0.35 * SR);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / SR;
      out[start + i] = (out[start + i] ?? 0) + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) * 0.5;
    }
  });
  return out;
}

function whoosh(dur = 0.45): Float64Array {
  const n = Math.floor(dur * SR);
  const y = new Float64Array(n);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff - 0.5;
  };
  let last = 0;
  for (let i = 0; i < n; i++) {
    const a = 0.02 + 0.5 * (i / n);
    last += a * (rnd() * 2 - last);
    y[i] = last;
  }
  // remove low rumble, shape with a swell
  const w = 200;
  let acc = 0;
  const hp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    acc += y[i] ?? 0;
    if (i >= w) acc -= y[i - w] ?? 0;
    hp[i] = (y[i] ?? 0) - acc / w;
  }
  let peak = 1e-9;
  for (const v of hp) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) hp[i] = ((hp[i] ?? 0) / peak) * Math.pow(Math.sin(Math.PI * (i / n)), 1.5);
  return hp;
}

/** Synthesizes original SFX (no samples, no copyright) and writes a stereo 48k WAV. */
export async function writeSfxWav(file: string, cues: SfxCue[], totalSec: number): Promise<void> {
  const N = Math.floor((totalSec + 1) * SR);
  const mix = new Float64Array(N);
  for (const c of cues) {
    const g = c.gain ?? 0.4;
    const x =
      c.kind === 'pop' ? pop(c.freq ?? 700)
      : c.kind === 'ding' ? ding()
      : c.kind === 'whoosh' ? whoosh()
      : sparkle();
    const start = Math.max(0, Math.floor(c.t * SR));
    for (let i = 0; i < x.length && start + i < N; i++) mix[start + i] = (mix[start + i] ?? 0) + (x[i] ?? 0) * g;
  }
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, mix[i] ?? 0));
    const s = Math.round(v * 32000);
    buf.writeInt16LE(s, 44 + i * 4);
    buf.writeInt16LE(s, 46 + i * 4);
  }
  await writeFile(file, buf);
}

/**
 * Original cinematic ambient bed (no samples): slow detuned sine pads over a
 * Am(add9) -> Fmaj7 -> C -> G progression, a soft sub swell and a shimmer, with a long fade-out.
 */
export async function writeAmbientBed(file: string, totalSec: number): Promise<void> {
  const N = Math.floor(totalSec * SR);
  const chords: number[][] = [
    [110.0, 164.81, 220.0, 329.63, 246.94], // Am(add9)
    [87.31, 130.81, 174.61, 261.63, 329.63], // Fmaj7
    [130.81, 196.0, 261.63, 329.63, 392.0], // C
    [98.0, 146.83, 196.0, 246.94, 293.66], // G
  ];
  const chordLen = 6.5;
  const L = new Float64Array(N);
  const R = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const ci = Math.floor(t / chordLen) % chords.length;
    const within = (t % chordLen) / chordLen;
    const swell = Math.pow(Math.sin(Math.PI * within), 0.8);
    let l = 0;
    let r = 0;
    chords[ci]!.forEach((f, k) => {
      const det = 1 + (k % 2 ? 0.0012 : -0.0012);
      const lfo = 0.7 + 0.3 * Math.sin(2 * Math.PI * (0.11 + k * 0.017) * t);
      const a = Math.sin(2 * Math.PI * f * det * t) * lfo;
      const b = Math.sin(2 * Math.PI * f / det * t + 0.9) * lfo;
      l += a * 0.6 + b * 0.4;
      r += b * 0.6 + a * 0.4;
    });
    const sub = Math.sin(2 * Math.PI * 55 * t) * 0.35 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.07 * t));
    const shimmer = Math.sin(2 * Math.PI * 1760 * t) * 0.02 * Math.max(0, Math.sin(2 * Math.PI * 0.09 * t));
    L[i] = (l * swell * 0.16 + sub + shimmer) * 0.55;
    R[i] = (r * swell * 0.16 + sub + shimmer) * 0.55;
  }
  const fadeIn = Math.floor(1.5 * SR);
  const fadeOut = Math.floor(2.5 * SR);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const g = Math.min(1, i / fadeIn, (N - i) / fadeOut);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (L[i] ?? 0) * g)) * 30000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (R[i] ?? 0) * g)) * 30000), 46 + i * 4);
  }
  await writeFile(file, buf);
}
