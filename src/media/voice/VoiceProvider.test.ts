import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCachedVoice, synthesize, voiceCachePaths } from './VoiceProvider.js';

describe('narration cache billing guard', () => {
  it('requires exact text and settings, both files, and valid timing metadata', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-cache-'));
    const opts = { provider: 'elevenlabs' as const, speed: 1 };
    try {
      const files = voiceCachePaths('Hello!', dir, opts);
      await writeFile(files.metaFile, JSON.stringify({ durationSec: 1, words: [{ word: 'Hello!', start: 0, end: 1 }] }));
      expect(await readCachedVoice('Hello!', dir, opts)).toBeNull();
      await writeFile(files.audioFile, 'test-audio');
      expect(await readCachedVoice('Hello!', dir, opts)).not.toBeNull();
      expect(await readCachedVoice('Hello', dir, opts)).toBeNull();
      expect(await readCachedVoice('Hello!', dir, { ...opts, speed: 0.9 })).toBeNull();
      await writeFile(files.metaFile, '{broken');
      expect(await readCachedVoice('Hello!', dir, opts)).toBeNull();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('never calls the paid provider when cache-only narration is missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-cache-'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(synthesize('Uncached', dir, { provider: 'elevenlabs' }, true)).rejects.toThrow('No valid cached narration');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); await rm(dir, { recursive: true, force: true }); }
  });
});
