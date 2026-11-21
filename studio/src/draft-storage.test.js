import { describe, expect, it } from 'vitest';
import { readComposerDraft, readPreflightApproval, readRepairGuidance, writeComposerDraft, writePreflightApproval, writeRepairGuidance } from './draft-storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('Studio local drafts', () => {
  it('restores a validated composer draft after refresh', () => {
    const storage = memoryStorage();
    const draft = { prompt: 'A baker shapes dough', look: 'food', seconds: 30, orientation: 'wide', audio: 'voiced', ending: 'A golden loaf', setting: 'A stone kitchen' };
    writeComposerDraft(draft, storage);
    expect(readComposerDraft(storage)).toEqual(draft);
  });

  it('bounds restored fields and falls back from invalid settings', () => {
    const storage = memoryStorage();
    storage.setItem('studio-composer-draft-v1', JSON.stringify({
      prompt: 'x'.repeat(700), look: 'unknown', seconds: 999, orientation: 'square', audio: 'unknown',
      ending: 'y'.repeat(400), setting: 'z'.repeat(300),
    }));
    expect(readComposerDraft(storage)).toEqual({
      prompt: 'x'.repeat(600), look: 'food', seconds: 10, orientation: 'vertical', audio: 'asmr',
      ending: 'y'.repeat(300), setting: 'z'.repeat(200),
    });
  });

  it('saves repair guidance per export and preserves an explicitly cleared value', () => {
    const storage = memoryStorage();
    expect(readRepairGuidance('session-1', 'outputs/video.mp4', storage)).toBeNull();
    writeRepairGuidance('session-1', 'outputs/video.mp4', 'Fix shot 2', storage);
    expect(readRepairGuidance('session-1', 'outputs/video.mp4', storage)).toBe('Fix shot 2');
    writeRepairGuidance('session-1', 'outputs/video.mp4', '', storage);
    expect(readRepairGuidance('session-1', 'outputs/video.mp4', storage)).toBe('');
  });

  it('remembers explicit preflight approval only for the matching plan', () => {
    const storage = memoryStorage();
    writePreflightApproval('session-1', 'drafts/generated/plan.local-scenario.json', true, storage);
    expect(readPreflightApproval('session-1', 'drafts/generated/plan.local-scenario.json', storage)).toBe(true);
    expect(readPreflightApproval('session-1', 'drafts/generated/other.local-scenario.json', storage)).toBe(false);
  });
});
