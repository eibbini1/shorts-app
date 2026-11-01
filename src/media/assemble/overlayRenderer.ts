import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';
import type { ColorName } from './types.js';

const FAMILY = 'Fredoka One';
const INK = 'rgb(58,24,92)';

const COLORS: Record<ColorName, string> = {
  yellow: 'rgb(255,222,64)',
  cyan: 'rgb(90,225,255)',
  pink: 'rgb(255,105,180)',
  white: 'rgb(255,255,255)',
  purple: 'rgb(110,60,190)',
  teal: 'rgb(20,160,150)',
  orange: 'rgb(255,140,30)',
  red: 'rgb(230,60,70)',
  blue: 'rgb(40,120,220)',
  green: 'rgb(60,190,110)',
};

let fontReady = false;
export function ensureFont(repoRoot: string): void {
  if (fontReady) return;
  const candidates = [
    process.env.ABDUL_FONT,
    path.join(repoRoot, 'assets', 'fonts', 'FredokaOne-Regular.ttf'),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Fredoka font not found. Looked in: ${candidates.join(', ')}`);
  GlobalFonts.registerFromPath(found, FAMILY);
  fontReady = true;
}

export interface OverlayItem {
  start: number;
  end: number;
  bmp: Canvas;
  cx: number;
  cy: number;
  shake: boolean;
  /** No pop animation (captions/lockups): plain quick fade-in, full size. */
  static?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

/** Big outlined kid-style word with a soft drop shadow; auto-shrinks to fit the safe width. */
export function makeText(txt: string, size: number, color: ColorName, maxW = 640): Canvas {
  const probe = createCanvas(10, 10).getContext('2d');
  let s = size;
  let width = 0;
  for (;;) {
    probe.font = `${s}px "${FAMILY}"`;
    width = probe.measureText(txt).width;
    if (width + s * 0.5 <= maxW || s <= 40) break;
    s -= 4;
  }
  const sw = Math.max(6, Math.round(s / 9));
  const w = Math.ceil(width + sw * 2 + 40);
  const h = Math.ceil(s * 1.35 + sw * 2 + 24);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.font = `${s}px "${FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = sw * 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.43)';
  ctx.fillStyle = 'rgba(0,0,0,0.43)';
  ctx.strokeText(txt, w / 2 + 5, h / 2 + 7);
  ctx.fillText(txt, w / 2 + 5, h / 2 + 7);
  ctx.strokeStyle = INK;
  ctx.strokeText(txt, w / 2, h / 2);
  ctx.fillStyle = COLORS[color];
  ctx.fillText(txt, w / 2, h / 2);
  return c;
}

/** Rounded "place stamp" pill with an optional red map-pin and a fun-fact sub line. */
export function makePill(txt: string, size: number, bg: string, opts: { pin?: boolean; sub?: string; maxW?: number } = {}): Canvas {
  const maxW = opts.maxW ?? 660;
  const probe = createCanvas(10, 10).getContext('2d');
  let s = size;
  const icon = () => (opts.pin ? s : 0);
  for (;;) {
    probe.font = `${s}px "${FAMILY}"`;
    if (probe.measureText(txt).width + s * 1.4 + icon() <= maxW || s <= 24) break;
    s -= 2;
  }
  probe.font = `${s}px "${FAMILY}"`;
  const tw = probe.measureText(txt).width;
  const subSize = Math.round(s * 0.66);
  const subH = opts.sub ? subSize + Math.round(s * 0.25) : 0;
  const padx = Math.round(s * 0.7);
  const w = Math.ceil(tw + padx * 2 + icon());
  const h = Math.ceil(s * 1.25 + s * 0.45 + subH);
  const c = createCanvas(w + 16, h + 22);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.roundRect(6, 14, w, h, h / 2); ctx.fill();
  ctx.fillStyle = bg;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(6, 6, w, h, h / 2); ctx.fill(); ctx.stroke();
  let x0 = 6 + padx;
  const lineY = 6 + s * 0.85;
  if (opts.pin) {
    const r = s * 0.34;
    const cx = x0 + icon() / 2 - 4;
    const cy = lineY - r * 0.4;
    ctx.fillStyle = 'rgb(235,50,60)';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r + 3, cy + r / 2); ctx.lineTo(cx + r - 3, cy + r / 2); ctx.lineTo(cx, cy + r * 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(cx, cy, r / 3, 0, Math.PI * 2); ctx.fill();
    x0 += icon();
  }
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${s}px "${FAMILY}"`;
  ctx.fillText(txt, x0, lineY);
  if (opts.sub) {
    ctx.font = `${subSize}px "${FAMILY}"`;
    ctx.fillStyle = 'rgb(255,236,150)';
    ctx.fillText(opts.sub, x0, lineY + s * 0.62 + 2);
  }
  return c;
}

export function makeChip(txt: string, size = 31): Canvas {
  return makePill(txt, size, 'rgba(30,20,60,0.85)', { maxW: 700 });
}

const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

export async function renderOverlay(opts: {
  items: OverlayItem[];
  chip?: Canvas;
  chipFrom: number;
  width: number;
  height: number;
  fps: number;
  totalSec: number;
  outFile: string;
}): Promise<void> {
  const { items, chip, chipFrom, width: W, height: H, fps, totalSec, outFile } = opts;
  const child = spawn('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-c:v', 'qtrle', outFile,
  ]);
  let err = '';
  child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`overlay ffmpeg failed (${code}): ${err.slice(-800)}`))));
  });

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const total = Math.floor(totalSec * fps);
  for (let n = 0; n < total; n++) {
    const t = n / fps;
    ctx.clearRect(0, 0, W, H);
    if (chip && t > chipFrom && t < totalSec - 0.2) {
      ctx.globalAlpha = Math.min(1, (t - chipFrom) / 0.4);
      ctx.drawImage(chip, (W - chip.width) / 2, 70);
      ctx.globalAlpha = 1;
    }
    for (const it of items) {
      if (t < it.start || t >= it.end) continue;
      if (it.static) {
        const fi = it.fadeIn ?? 0.08, fo = it.fadeOut ?? 0.08;
        const a = Math.min(1, fi < 0.01 ? 1 : (t - it.start) / fi, (it.end - t) / fo); // fadeIn ~0 = instant (visible on the first frame)
        ctx.globalAlpha = Math.max(0, a);
        ctx.drawImage(it.bmp, it.cx - it.bmp.width / 2, it.cy - it.bmp.height / 2);
        ctx.globalAlpha = 1;
        continue;
      }
      const x = (t - it.start) / 0.28;
      let sc = x < 1 ? easeOutBack(x) : 1;
      if (it.end - t < 0.15) sc *= Math.max(0.01, (it.end - t) / 0.15);
      if (it.shake) sc *= 1 + 0.035 * Math.sin((t - it.start) * 14);
      const dx = it.shake && t - it.start < 1.2 ? 5 * Math.sin((t - it.start) * 38) : 0;
      const w = Math.max(1, it.bmp.width * Math.max(sc, 0.02));
      const h = Math.max(1, it.bmp.height * Math.max(sc, 0.02));
      ctx.drawImage(it.bmp, it.cx - w / 2 + dx, it.cy - h / 2, w, h);
    }
    const px = ctx.getImageData(0, 0, W, H).data;
    const ok = child.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength));
    if (!ok) await new Promise<void>((r) => child.stdin.once('drain', () => r()));
  }
  child.stdin.end();
  await done;
}

export { COLORS };
