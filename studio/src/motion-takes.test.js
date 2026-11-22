import { describe, expect, it } from 'vitest';
import { MAX_TAKES, takeControls, takeState } from './motion-takes.js';

describe('takeState', () => {
  it('defaults to take 1 when nothing was recorded', () => {
    expect(takeState(undefined, 3)).toEqual({ current: 0, highest: 0 });
    expect(takeState({}, 1)).toEqual({ current: 0, highest: 0 });
  });
  it('reads the 0-based shot key for a 1-based shot number', () => {
    expect(takeState({ 3: { current: 1, highest: 2 } }, 4)).toEqual({ current: 1, highest: 2 });
  });
  it('clamps bad values into range', () => {
    expect(takeState({ 0: { current: 9, highest: -4 } }, 1)).toEqual({ current: 2, highest: 2 });
    expect(takeState({ 0: { current: 'x', highest: 'y' } }, 1)).toEqual({ current: 0, highest: 0 });
  });
});

describe('takeControls', () => {
  it('offers a new take and no switches before any retake', () => {
    expect(takeControls({}, 2)).toMatchObject({ canMakeNew: true, switches: [], label: 'Take 1 of 3' });
  });
  it('lists every made take and marks the current one', () => {
    const c = takeControls({ 1: { current: 0, highest: 1 } }, 2);
    expect(c.switches).toEqual([{ take: 0, label: 'Take 1', active: true }, { take: 1, label: 'Take 2', active: false }]);
    expect(c.canMakeNew).toBe(true);
  });
  it('stops offering new takes once all are used', () => {
    const c = takeControls({ 0: { current: 2, highest: MAX_TAKES - 1 } }, 1);
    expect(c.canMakeNew).toBe(false);
    expect(c.switches).toHaveLength(MAX_TAKES);
    expect(c.label).toBe('Take 3 of 3');
  });
});
