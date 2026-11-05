import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadSpec, inputDigest, atomicJson } from '../spec.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shorts-spec-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'assets/fonts'), { recursive: true });
  await writeFile(path.join(root, 'src/render.ts'), 'renderer version 1');
  await writeFile(path.join(root, 'assets/fonts/Lora-Variable.ttf'), 'font-fixture');
  await writeFile(path.join(root, 'scene.jpg'), 'image-fixture');
  const spec = { kind: 'stills', output: 'out/episode.mp4', brand: { name: 'Billionaire Bites' }, voice: { provider: 'mock' }, scenes: [{ image: 'scene.jpg', text: 'A new hook.' }] };
  const file = path.join(root, 'episode.assemble.json');
  await writeFile(file, JSON.stringify(spec));
  return { root, file, spec };
}

describe('automation preflight and resumption', () => {
  it('rejects missing scene media and invalid transitions before rendering', async () => {
    const f = await fixture();
    try {
      expect((await loadSpec(f.file, f.root)).scenes).toHaveLength(1);
      await rm(path.join(f.root, 'scene.jpg'));
      await expect(loadSpec(f.file, f.root)).rejects.toThrow();
      await writeFile(path.join(f.root, 'scene.jpg'), 'image');
      await writeFile(f.file, JSON.stringify({ ...f.spec, scenes: [{ image: 'scene.jpg', text: 'Hook.', transition: 'unknown' }] }));
      await expect(loadSpec(f.file, f.root)).rejects.toThrow('Invalid scene transition');
      const graded = { ...f.spec, scenes: [{ ...f.spec.scenes[0], colorGrade: 'food' }] };
      await writeFile(f.file, JSON.stringify(graded));
      expect((await loadSpec(f.file, f.root)).scenes[0]?.colorGrade).toBe('food');
      await writeFile(f.file, JSON.stringify({ ...graded, width: 1920, height: 1080 }));
      await expect(loadSpec(f.file, f.root)).rejects.toThrow('supported for portrait only');
      await writeFile(f.file, JSON.stringify({ ...graded, scenes: [{ ...graded.scenes[0], colorGrade: 'foood' }] }));
      await expect(loadSpec(f.file, f.root)).rejects.toThrow('colorGrade must be');

    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('invalidates packs for changed inputs or renderer code', async () => {
    const f = await fixture();
    try {
      const spec = await loadSpec(f.file, f.root);
      const a = await inputDigest(f.file, spec, f.root);
      expect(await inputDigest(f.file, spec, f.root)).toBe(a);
      await writeFile(path.join(f.root, 'scene.jpg'), 'replaced-image');
      const b = await inputDigest(f.file, spec, f.root);
      expect(b).not.toBe(a);
      await writeFile(path.join(f.root, 'src/render.ts'), 'renderer version 2');
      expect(await inputDigest(f.file, spec, f.root)).not.toBe(b);
      const report = path.join(f.root, 'nested/report.json');
      await atomicJson(report, { ok: true });
      expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({ ok: true });
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
});
