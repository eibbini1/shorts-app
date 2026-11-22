import { describe, it, expect } from 'vitest';
import { prerenderChecklist } from './prerender-checklist.js';

const shots = [{ seconds: 5 }, { seconds: 5 }];
const base = { shots, hasStill: () => true, clips: 2 };
const get = (c, id) => c.items.find((i) => i.id === id);

describe('prerenderChecklist', () => {
  it('is ready when every item is ok', () => {
    const c = prerenderChecklist(base);
    expect(c.ready).toBe(true);
    expect(c.items.every((i) => i.state === 'ok')).toBe(true);
    expect(get(c, 'quota')).toBeUndefined();
  });
  it('lists which shots miss a first frame', () => {
    const c = prerenderChecklist({ ...base, hasStill: (n) => n === 1 });
    expect(get(c, 'frames')).toMatchObject({ state: 'todo', detail: 'Missing for shot 2' });
    expect(c.ready).toBe(false);
  });
  it('flags human review, blocks, a busy Mac and an empty quota', () => {
    expect(get(prerenderChecklist({ ...base, needsHumanReview: true }), 'review').state).toBe('todo');
    expect(get(prerenderChecklist({ ...base, blocked: true }), 'blocks').state).toBe('blocked');
    expect(get(prerenderChecklist({ ...base, otherJobRunning: true }), 'mac').state).toBe('blocked');
    const q = prerenderChecklist({ ...base, rendersLeft: 0 });
    expect(get(q, 'quota').state).toBe('blocked');
    expect(q.ready).toBe(false);
    expect(get(prerenderChecklist({ ...base, rendersLeft: 3 }), 'quota').detail).toBe('3 left');
  });
  it('blocks when there is no plan', () => {
    const c = prerenderChecklist({ shots: [] });
    expect(get(c, 'plan').state).toBe('blocked');
    expect(get(c, 'frames').state).toBe('blocked');
  });
});
