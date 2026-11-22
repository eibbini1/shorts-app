import { describe, it, expect } from 'vitest';
import { failureHelp } from './failure-help.js';

describe('failureHelp', () => {
  it('returns nothing unless failed or interrupted', () => {
    for (const status of ['running', 'done', 'cancelled', 'idle', undefined]) expect(failureHelp({ status, kind: 'render' })).toBeNull();
  });
  it('explains each watchdog fault and mentions the automatic retry', () => {
    const oom = failureHelp({ status: 'failed', kind: 'render', hasScenario: true, watchdog: { lastFault: 'oom', retries: 1 } });
    expect(oom.why).toMatch(/ran out of memory/);
    expect(oom.why).toMatch(/retried once automatically/);
    expect(oom.canRetry).toBe(true);
    expect(failureHelp({ status: 'failed', kind: 'render', watchdog: { lastFault: 'stalled', retries: 0 } }).why).not.toMatch(/retried once/);
  });
  it('never offers a low-memory option that does not exist', () => {
    const h = failureHelp({ status: 'failed', kind: 'render', hasScenario: true, watchdog: { lastFault: 'oom', retries: 1 } });
    expect(JSON.stringify(h).toLowerCase()).not.toMatch(/low[- ]memory (mode|setting)/);
  });
  it('treats a technical QA failure and a restart differently from a crash', () => {
    expect(failureHelp({ status: 'failed', kind: 'render', hasScenario: true, technicalQa: { status: 'failed' } }).title).toMatch(/technical check/);
    const r = failureHelp({ status: 'interrupted', kind: 'render', hasScenario: true });
    expect(r.title).toMatch(/restarted/);
    expect(r.why).toMatch(/not failed/);
  });
  it('cannot retry without a scenario or for non-render kinds', () => {
    expect(failureHelp({ status: 'failed', kind: 'render', hasScenario: false }).canRetry).toBe(false);
    expect(failureHelp({ status: 'failed', kind: 'draft', hasScenario: true }).canRetry).toBe(false);
    expect(failureHelp({ status: 'failed', kind: 'stills', hasScenario: true }).canRetry).toBe(false);
  });
  it('falls back to a generic card and keeps the raw error as detail', () => {
    const h = failureHelp({ status: 'failed', kind: 'render', hasScenario: true, error: 'boom' });
    expect(h.why).toMatch(/does not recognise/);
    expect(h.detail).toBe('boom');
  });
});
