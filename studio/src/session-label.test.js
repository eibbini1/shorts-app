import { describe, expect, it } from 'vitest';
import { findMatchingSession, sessionDisplayName } from './session-label.js';

describe('session labels and duplicate detection', () => {
  const sessions = [
    { id: '1000000001', name: 'Tomato pasta', prompt: 'A chef chops tomatoes for pasta!', createdAt: 1000000001000, updatedAt: 1000000001000 },
    { id: '1000000002', name: 'Tomato pasta', prompt: 'A chef chops tomatoes for pasta!', createdAt: 1000000002000, updatedAt: 1000000002000 },
    { id: '1000000003', name: 'Robot story', prompt: 'A robot crosses the room.', createdAt: 1000000003000, updatedAt: 1000000003000 },
  ];

  it('adds a time label only when project names collide', () => {
    expect(sessionDisplayName(sessions[0], sessions)).toContain('Tomato pasta ·');
    expect(sessionDisplayName(sessions[2], sessions)).toBe('Robot story');
  });

  it('finds the newest matching project and prefers the currently selected match', () => {
    expect(findMatchingSession('A chef chops tomatoes for pasta.', sessions)?.id).toBe('1000000002');
    expect(findMatchingSession('A chef chops tomatoes for pasta.', sessions, '1000000001')?.id).toBe('1000000001');
    expect(findMatchingSession('A different idea entirely', sessions)).toBeNull();
  });

  it('does not flag short prompts as duplicate projects', () => {
    expect(findMatchingSession('toast', [{ id: '1', prompt: 'toast' }])).toBeNull();
  });
});
