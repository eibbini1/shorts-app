import { existsSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';

let ready = false;
export function ensureLuxuryFont(repoRoot: string): void {
  if (ready) return;
  const p = path.join(repoRoot, 'assets', 'fonts', 'Lora-Variable.ttf');
  if (!existsSync(p)) throw new Error(`Lora font missing at ${p}`);
  GlobalFonts.registerFromPath(p, 'Lora');
  ready = true;
}
const GOLD = 'rgb(236,196,112)';

/** One caption group (a few words) with the currently spoken word highlighted in gold. */
export function makeCaption(words: string[], active: number, size = 62, maxW = 640): Canvas {
  const probe = createCanvas(10, 10).getContext('2d');
  let s = size;
  let lines: string[][] = [];
  for (;;) {
    probe.font = `700 ${s}px Lora`;
    lines = [[]];
    for (let i = 0; i < words.length; i++) {
      const cur = lines[lines.length - 1]!;
      const test = [...cur, words[i]!].join(' ');
      if (cur.length && probe.measureText(test).width > maxW) lines.push([words[i]!]); else cur.push(words[i]!);
    }
    const widest = Math.max(...lines.map((l) => probe.measureText(l.join(' ')).width));
    if (widest <= maxW || s <= 36) break;
    s -= 4;
  }
  const lh = s * 1.25;
  const w = maxW + 60;
  const h = Math.ceil(lines.length * lh + 40);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.font = `700 ${s}px Lora`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let idx = 0;
  lines.forEach((ln, li) => {
    const full = ln.join(' ');
    let x = (w - ctx.measureText(full).width) / 2;
    const y = 20 + lh * li + lh / 2;
    ln.forEach((word, wi) => {
      const txt = word + (wi < ln.length - 1 ? ' ' : '');
      const col = idx === active ? GOLD : 'white';
      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(txt, x + 2, y + 3);
      ctx.fillStyle = col;
      ctx.fillText(txt, x, y);
      x += ctx.measureText(txt).width;
      idx++;
    });
  });
  return c;
}

/** Elegant spaced gold wordmark with hairline rules, e.g. the end lockup or opening kicker. */
export function makeWordmark(txt: string, size: number, sub?: string, w = 700): Canvas {
  const h = Math.ceil(size * 2.6 + (sub ? size * 0.9 : 0));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const c2 = ctx as unknown as { letterSpacing?: string };
  c2.letterSpacing = `${Math.round(size * 0.22)}px`;
  ctx.font = `600 ${size}px Lora`;
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14;
  ctx.fillStyle = GOLD;
  ctx.fillText(txt, w / 2 + size * 0.11, h / 2 - (sub ? size * 0.3 : 0), w - size * 0.55);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
  const y1 = h / 2 - size * 0.95 - (sub ? size * 0.3 : 0);
  const y2 = h / 2 + size * 0.95 - (sub ? size * 0.3 : 0);
  ctx.beginPath(); ctx.moveTo(w / 2 - 150, y1); ctx.lineTo(w / 2 + 150, y1); ctx.moveTo(w / 2 - 150, y2); ctx.lineTo(w / 2 + 150, y2); ctx.stroke();
  if (sub) {
    c2.letterSpacing = `${Math.round(size * 0.1)}px`;
    ctx.font = `500 ${Math.round(size * 0.42)}px Lora`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(sub, w / 2, y2 + size * 0.55, w - size * 0.55);
  }
  return c;
}
