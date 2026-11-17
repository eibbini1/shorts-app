import { describe, expect, it } from 'vitest';
import { ideaHint } from './idea-hint.js';

describe('Studio idea hints', () => {
  it('recognizes gerund actions and asks for an ending instead of falsely saying no action', () => {
    const result = ideaHint('A chef chopping fresh tomatoes and making Italian pasta', 'food');
    expect(result.level).toBe('tip');
    expect(result.msg).toContain('I can see the action');
  });

  it('treats an explicitly filled Ending field as the payoff', () => {
    const result = ideaHint('A chef chopping fresh tomatoes and making Italian pasta', 'food', 'glossy sauce coats the pasta');
    expect(result.level).toBe('ok');
  });

  it('keeps a useful action hint for ideas without a physical action', () => {
    const result = ideaHint('A beautiful cozy kitchen with warm light', 'food');
    expect(result.level).toBe('warn');
    expect(result.msg).toContain('visible action');
  });

  it('recognizes common past tense and plural forms', () => {
    expect(ideaHint('A chef chopped tomatoes, then stirred them into sauce', 'food').level).toBe('ok');
  });
});
