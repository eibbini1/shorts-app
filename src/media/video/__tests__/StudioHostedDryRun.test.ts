import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostedSpendLedgerRepository } from '../../../database/HostedSpendLedgerRepository.js';
import { __resetDbForTests, getDb } from '../../../database/connection.js';
import { StudioHostedDryRun, type StudioHostedShot } from '../StudioHostedDryRun.js';

const shot: StudioHostedShot = {
  sessionId: '1795300000000', shot: 1, scenarioSha256: 'a'.repeat(64), model: 'wan-2.2', capUsd: 1,
  request: { prompt: 'A lamp gradually brightens.', mode: 'i2v_first_frame', width: 704, height: 1280,
    fps: 24, frameCount: 97, audio: 'silent', conditioning: [
      { kind: 'image', role: 'first-frame', uri: 'asset:sample', sha256: 'b'.repeat(64) }] },
};

describe('Studio local hosted simulation', () => {
  let service: StudioHostedDryRun;
  let ledger: HostedSpendLedgerRepository;
  beforeEach(() => {
    const db = getDb(':memory:');
    service = new StudioHostedDryRun(db);
    ledger = new HostedSpendLedgerRepository(db);
  });
  afterEach(() => __resetDbForTests());

  it('simulates one authenticated approval once, including concurrent confirmations', async () => {
    const quote = service.quote(shot);
    const outcomes = await Promise.allSettled([service.confirm(shot, quote.approval), service.confirm(shot, quote.approval)]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'fulfilled')).toMatchObject({ value: { actualUsd: 0, status: 'succeeded' } });
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining('already been used') }) });
    expect(ledger.getRun('simulation-' + shot.sessionId)).toMatchObject({ settledUsd: 0, reservedUsd: 0 });
  });

  it('binds provider simulation inputs to the nonce and invalidates outstanding quotes after restart', async () => {
    const { approval } = service.quote(shot);
    for (const change of [{ shot: 2 }, { sessionId: 'another' }, { model: 'ltx-2.5' as const }, { capUsd: 2 },
      { scenarioSha256: 'c'.repeat(64) }, { request: { ...shot.request, width: 720 } },
      { request: { ...shot.request, prompt: 'Changed action.' } }, { request: { ...shot.request, conditioning: [] } }]) {
      await expect(service.confirm({ ...shot, ...change }, approval)).rejects.toThrow('changed');
    }
    await expect(new StudioHostedDryRun(getDb(':memory:')).confirm(shot, approval)).rejects.toThrow('expired');
    expect(() => ledger.getRun('simulation-' + shot.sessionId)).toThrow('does not exist');
  });

  it('rejects an expired quote before it can reserve funds', async () => {
    const quote = service.quote(shot);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(quote.expires);
    try {
      await expect(service.confirm(shot, quote.approval)).rejects.toThrow('expired');
      expect(() => ledger.getRun('simulation-' + shot.sessionId)).toThrow('does not exist');
    } finally { clock.mockRestore(); }
  });

  it('a failed cap check consumes no approval and creates no provider job', async () => {
    const runId = 'simulation-' + shot.sessionId;
    const { approval } = service.quote(shot);
    ledger.reserve({ runId, idempotencyKey: 'hold', provider: 'local-simulation', maximumChargeUsd: 0.9, capUsd: 1 });
    await expect(service.confirm(shot, approval)).rejects.toThrow('remaining spend cap');
    expect(getDb(':memory:').prepare('SELECT COUNT(*) AS n FROM hosted_motion_jobs').get()?.n).toBe(0);
    ledger.release('hold');
    await expect(service.confirm(shot, approval)).resolves.toMatchObject({ status: 'succeeded', actualUsd: 0 });
  });
});
