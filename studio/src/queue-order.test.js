import { describe, expect, it } from 'vitest';
import { moveQueueItem } from './queue-order.js';

describe('moveQueueItem', () => {
  it('moves an idea one place in either direction', () => {
    const queue = ['first', 'second', 'third'];

    expect(moveQueueItem(queue, 1, -1)).toEqual(['second', 'first', 'third']);
    expect(moveQueueItem(queue, 1, 1)).toEqual(['first', 'third', 'second']);
  });

  it('keeps the queue unchanged at either boundary', () => {
    const queue = ['first', 'second'];

    expect(moveQueueItem(queue, 0, -1)).toBe(queue);
    expect(moveQueueItem(queue, 1, 1)).toBe(queue);
  });
});
