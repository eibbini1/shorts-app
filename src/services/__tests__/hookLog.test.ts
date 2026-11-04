import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tagHook, buildHookRow, appendHookRow } from '../hookLog.js';

describe('tagHook', () => {
  it('tags a price-and-choice opener', () => {
    const tags = tagHook('This one fish sold for three point two million dollars.');
    expect(tags).toContain('PRICE');
  });

  it('tags a pick-one question with CHOICE and QUESTION', () => {
    const tags = tagHook('Would you pay it? Pick one.');
    expect(tags).toEqual(expect.arrayContaining(['CHOICE', 'QUESTION']));
  });

  it('tags gold and tension words', () => {
    expect(tagHook('The banned 24 karat gold dessert')).toEqual(expect.arrayContaining(['GOLD', 'TENSION']));
  });

  it('returns no tags for a plain line', () => {
    expect(tagHook('Here is a plate of food.')).toEqual([]);
  });

  it('is deterministic for the same line', () => {
    const line = 'Two melons. Five point eight million yen.';
    expect(tagHook(line)).toEqual(tagHook(line));
  });
});

describe('buildHookRow', () => {
  it('uses the first scene as the hook and leaves results empty', () => {
    const row = buildHookRow('tuna-ep1-final.mp4', { scenes: [{ text: 'Two melons. Five point eight million yen.' }, { text: 'Next.' }] }, new Date('2026-11-02T10:00:00Z'));
    expect(row?.first_line).toBe('Two melons. Five point eight million yen.');
    expect(row?.views_24h).toBeNull();
    expect(row?.logged_at).toBe('2026-11-02T10:00:00.000Z');
  });

  it('returns null when there is no opening line', () => {
    expect(buildHookRow('x.mp4', { scenes: [{ text: '   ' }] })).toBeNull();
    expect(buildHookRow('x.mp4', {})).toBeNull();
  });
});

describe('appendHookRow', () => {
  it('serializes simultaneous writes and handles a missing final newline', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hooklog-race-'));
    try {
      const file = path.join(dir, 'hooks.jsonl');
      const first = buildHookRow('first.mp4', { scenes: [{ text: 'First.' }] })!;
      const second = buildHookRow('second.mp4', { scenes: [{ text: 'Second.' }] })!;
      await writeFile(file, JSON.stringify(first));
      const results = await Promise.all(Array.from({ length: 8 }, () => appendHookRow(file, second)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line).short)).toEqual(['first.mp4', 'second.mp4']);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('appends once and skips a Short already logged', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hooklog-'));
    try {
      const file = path.join(dir, 'hook-log.jsonl');
      const row = buildHookRow('melon.mp4', { scenes: [{ text: 'Two melons.' }] })!;
      expect(await appendHookRow(file, row)).toBe(true);
      expect(await appendHookRow(file, row)).toBe(false);
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).short).toBe('melon.mp4');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
