import { describe, expect, it } from 'vitest';
import { displayPipelineLine, notesOf } from './pipeline-lines.js';

describe('notesOf', () => {
  it('hides internal learning tags from Studio warning copy', () => {
    expect(displayPipelineLine('WARNING: [gate:story] title needs the subject sooner'))
      .toBe('WARNING: title needs the subject sooner');
    expect(notesOf(['WARNING: [gate:story] title needs the subject sooner']))
      .toEqual(['WARNING: title needs the subject sooner']);
  });

  it('leaves legacy warnings and non-warning notes unchanged', () => {
    expect(notesOf(['WARNING: old note', 'REVIEW: watch the ending']))
      .toEqual(['WARNING: old note', 'REVIEW: watch the ending']);
  });
});
