import { describe, expect, it } from 'vitest';
import { buildPayload, emptyDraft, labelOf, listQuery, newClientKey, validateDraft, CATEGORIES } from './feedback.js';

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft({ ...emptyDraft(), title: 'Export stuck', comment: 'It never finishes.' })).toEqual({});
  });
  it('explains what is missing in plain language', () => {
    const errors = validateDraft(emptyDraft());
    expect(errors.title).toMatch(/short title/);
    expect(errors.comment).toMatch(/what happened/);
  });
  it('rejects text that is too long and unknown types', () => {
    expect(validateDraft({ category: 'other', title: 'x'.repeat(121), comment: 'y'.repeat(4001) })).toEqual({
      category: expect.any(String), title: expect.any(String), comment: expect.any(String),
    });
  });
  it('counts trimmed length', () => {
    expect(validateDraft({ ...emptyDraft(), title: '   a   ', comment: 'abc' }).title).toBeTruthy();
  });
});

describe('buildPayload', () => {
  it('trims, keeps the key, and omits empty rating and video', () => {
    expect(buildPayload({ ...emptyDraft(), title: ' T1x ', comment: ' body ' }, 'key12345')).toEqual({
      category: 'general', title: 'T1x', comment: 'body', clientKey: 'key12345',
    });
  });
  it('includes rating and the video reference when chosen', () => {
    const payload = buildPayload({ ...emptyDraft('1700000000000'), rating: 4, category: 'video', title: 'abc', comment: 'abc' }, 'key12345');
    expect(payload).toMatchObject({ rating: 4, sessionId: '1700000000000', category: 'video' });
  });
});

describe('listQuery and keys', () => {
  it('builds only the filters that are set', () => {
    expect(listQuery()).toBe('');
    expect(listQuery({ scope: 'all', status: 'new', q: ' dark ' })).toBe('?scope=all&status=new&q=dark');
  });
  it('makes keys the server accepts (8-64 URL-safe characters)', () => {
    expect(newClientKey()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
  it('labels categories', () => {
    expect(labelOf(CATEGORIES, 'feature')).toBe('Feature request');
  });
});
