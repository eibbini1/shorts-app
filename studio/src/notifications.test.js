import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS, DEDUPE_MS, addEvent, eventFromTransition, flushNow, loadItems, loadPrefs, markAllRead, markRead,
  relativeTime, saveItems, savePrefs, sessionEvents, titleFor, unreadCount,
} from './notifications.js';

const memory = (initial = {}) => { const data = { ...initial }; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data }; };
const ev = (over = {}) => ({ sessionId: '1', kind: 'render', status: 'done', type: 'ready', severity: 'success', title: 'Video ready', project: 'p', detail: '', ...over });

describe('eventFromTransition', () => {
  it('creates a ready event when a running job finishes', () => {
    const e = eventFromTransition({ id: '1', status: 'running', kind: 'render' }, { id: '1', status: 'done', kind: 'render', name: 'Red dress' });
    expect(e).toMatchObject({ type: 'ready', severity: 'success', title: 'Video ready', project: 'Red dress', sessionId: '1' });
  });
  it('covers failed, stopped and interrupted with distinct severities', () => {
    const run = { id: '1', status: 'running' };
    expect(eventFromTransition(run, { id: '1', status: 'failed', kind: 'render' }, { detail: 'Out of memory' })).toMatchObject({ type: 'failed', severity: 'error', detail: 'Out of memory' });
    expect(eventFromTransition(run, { id: '1', status: 'cancelled', kind: 'stills' }).type).toBe('stopped');
    expect(eventFromTransition(run, { id: '1', status: 'interrupted', kind: 'render' }).severity).toBe('warning');
  });
  it('treats stopping as active and ignores non-transitions', () => {
    expect(eventFromTransition({ id: '1', status: 'stopping' }, { id: '1', status: 'cancelled' })).not.toBeNull();
    expect(eventFromTransition({ id: '1', status: 'done' }, { id: '1', status: 'done' })).toBeNull();
    expect(eventFromTransition({ id: '1', status: 'done' }, { id: '1', status: 'failed' })).toBeNull();
    expect(eventFromTransition({ id: '1', status: 'running' }, { id: '1', status: 'running' })).toBeNull();
    expect(eventFromTransition({ id: '1', status: 'running' }, { id: '2', status: 'done' })).toBeNull();
    expect(eventFromTransition(null, { id: '1', status: 'done' })).toBeNull();
  });
  it('words review-ready jobs as a request to look', () => {
    expect(titleFor('stills', 'done')).toBe('First frames ready to review');
    expect(titleFor('draft', 'done')).toBe('Plan ready to review');
    expect(titleFor('mystery', 'failed')).toBe('Job failed');
  });
});

describe('sessionEvents', () => {
  it('uses the first list as a baseline and reports only later transitions', () => {
    const first = sessionEvents(null, [{ id: 7, status: 'running', kind: 'render' }, { id: 8, status: 'done', kind: 'render' }]);
    expect(first.events).toEqual([]);
    const second = sessionEvents(first.map, [{ id: 7, status: 'done', kind: 'render', name: 'Other project' }, { id: 8, status: 'done', kind: 'render' }]);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ sessionId: '7', title: 'Video ready', project: 'Other project' });
  });
  it('survives junk input', () => {
    expect(sessionEvents(null, null).events).toEqual([]);
    expect(sessionEvents(new Map(), [null, {}, { id: null }]).map.size).toBe(0);
  });
});

describe('addEvent and read state', () => {
  it('dedupes the same session, kind and status within the window but allows a later retry', () => {
    let items = addEvent([], ev(), 1000, () => 'a');
    items = addEvent(items, ev(), 1000 + DEDUPE_MS - 1, () => 'b');
    expect(items).toHaveLength(1);
    items = addEvent(items, ev(), 1000 + DEDUPE_MS + 1, () => 'c');
    expect(items.map((i) => i.id)).toEqual(['c', 'a']);
    items = addEvent(items, ev({ status: 'failed', type: 'failed' }), 1000 + DEDUPE_MS + 2, () => 'd');
    expect(items).toHaveLength(3);
  });
  it('keeps the newest MAX_ITEMS and counts unread', () => {
    let items = [];
    for (let i = 0; i < MAX_ITEMS + 5; i += 1) items = addEvent(items, ev({ sessionId: String(i) }), i * 100000, () => `id${i}`);
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items[0].id).toBe(`id${MAX_ITEMS + 4}`);
    expect(unreadCount(items)).toBe(MAX_ITEMS);
    expect(unreadCount(markAllRead(items))).toBe(0);
    expect(unreadCount(markRead(items, 'id10'))).toBe(MAX_ITEMS - 1);
  });
});

describe('storage', () => {
  it('round-trips items and rejects corrupt entries', () => {
    const store = memory();
    const items = addEvent([], ev(), 5, () => 'x');
    expect(saveItems(store, items)).toBe(true);
    expect(loadItems(store)).toEqual(items);
    store.data['ishorts-notifications-v1'] = JSON.stringify([{ id: 1 }, items[0], 'junk']);
    expect(loadItems(store)).toEqual([items[0]]);
    store.data['ishorts-notifications-v1'] = '{not json';
    expect(loadItems(store)).toEqual([]);
  });
  it('never throws when storage is blocked', () => {
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadItems(blocked)).toEqual([]);
    expect(saveItems(blocked, [])).toBe(false);
    expect(loadPrefs(blocked)).toEqual({ sound: true, desktop: false });
    expect(savePrefs(blocked, {})).toBe(false);
  });
  it('defaults sound on and desktop alerts off', () => {
    const store = memory();
    expect(loadPrefs(store)).toEqual({ sound: true, desktop: false });
    savePrefs(store, { sound: false, desktop: true });
    expect(loadPrefs(store)).toEqual({ sound: false, desktop: true });
  });
});

describe('relativeTime and flushNow', () => {
  it('formats recent times', () => {
    expect(relativeTime(0, 10_000)).toBe('just now');
    expect(relativeTime(0, 5 * 60_000)).toBe('5 min ago');
    expect(relativeTime(0, 3 * 3_600_000)).toBe('3 h ago');
  });
  it('flushes at once on a change of job, kind or status and coalesces plain log updates', () => {
    const shown = { id: '1', status: 'running', kind: 'render', lines: ['a'] };
    expect(flushNow(shown, { ...shown, lines: ['a', 'b'] })).toBe(false);
    expect(flushNow(shown, { ...shown, status: 'done' })).toBe(true);
    expect(flushNow(shown, { ...shown, id: '2' })).toBe(true);
    expect(flushNow(shown, { ...shown, kind: 'stills' })).toBe(true);
    expect(flushNow(null, shown)).toBe(true);
  });
});
