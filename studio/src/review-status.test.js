import { describe, expect, it } from 'vitest';
import { exportReviewStatus } from './review-status.js';

describe('exportReviewStatus', () => {
  it('keeps a technical failure blocked', () => {
    expect(exportReviewStatus({ failed: ['duration'], technicalPassed: false }).tone).toBe('bad');
  });

  it('surfaces automatic visual flags without calling them a verdict', () => {
    const result = exportReviewStatus({
      technicalPassed: true,
      review: { status: 'complete', flags: { realism: ['knife contact unclear'] } },
    });
    expect(result.tone).toBe('bad');
    expect(result.message).toContain('Review the flagged moments');
    expect(result.message).toContain('not an artistic verdict');
  });

  it('does not imply approval when automatic review is missing', () => {
    expect(exportReviewStatus({ technicalPassed: true, review: { status: 'unavailable' } }).tone).toBe('muted');
  });

  it('keeps technical pass distinct from human listening and release approval', () => {
    expect(exportReviewStatus({ technicalPassed: true, review: { status: 'complete', flags: {} } }).message)
      .toContain('Watch and listen');
  });
});
