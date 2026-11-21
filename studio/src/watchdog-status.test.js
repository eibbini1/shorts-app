import { describe, expect, it } from 'vitest';
import { watchdogLabel } from './watchdog-status.js';

describe('watchdogLabel', () => {
  it('shows nothing without watchdog data or after a clean run', () => {
    expect(watchdogLabel(null, 'running')).toBeNull();
    expect(watchdogLabel({ retries: 0, maxRetries: 1, lastFault: null }, 'done')).toBeNull();
  });

  it('says when an automatic retry is running', () => {
    expect(watchdogLabel({ retries: 1, maxRetries: 1 }, 'running').text).toBe('Retrying automatically (1 of 1)');
  });

  it('explains the final failure and that nothing was lost', () => {
    const label = watchdogLabel({ retries: 1, maxRetries: 1, lastFault: 'oom' }, 'failed');
    expect(label.text).toContain('ran out of memory again after one automatic retry');
    expect(label.text).toContain('Nothing was lost');
  });

  it('does not label rejected work that was never an infrastructure fault', () => {
    expect(watchdogLabel({ retries: 0, maxRetries: 1, lastFault: null }, 'failed')).toBeNull();
  });
});
