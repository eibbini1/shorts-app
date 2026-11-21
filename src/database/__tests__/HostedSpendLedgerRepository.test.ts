import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests, getDb } from '../connection.js';
import { HostedSpendLedgerRepository } from '../HostedSpendLedgerRepository.js';

describe('HostedSpendLedgerRepository', () => {
  let ledger: HostedSpendLedgerRepository;

  beforeEach(() => {
    __resetDbForTests();
    ledger = new HostedSpendLedgerRepository(getDb(':memory:'));
  });

  afterEach(() => __resetDbForTests());

  it('reserves within the run cap and makes idempotent retries safe', () => {
    const input = {
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.6,
      capUsd: 1,
    };

    expect(ledger.reserve(input)).toMatchObject({ status: 'reserved', maximumChargeUsd: 0.6 });
    expect(ledger.reserve(input)).toMatchObject({ status: 'reserved', maximumChargeUsd: 0.6 });
    expect(ledger.getRun('pilot-1')).toMatchObject({
      capUsd: 1,
      reservedUsd: 0.6,
      settledUsd: 0,
      availableUsd: 0.4,
    });
    expect(() => ledger.reserve({ ...input, idempotencyKey: 'job-2', maximumChargeUsd: 0.5 }))
      .toThrow('exceeds the remaining spend cap');
  });

  it('rejects reusing an idempotency key with changed reservation parameters', () => {
    const input = {
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.6,
      capUsd: 1,
    };
    ledger.reserve(input);

    expect(() => ledger.reserve({ ...input, maximumChargeUsd: 0.5 })).toThrow('different spend parameters');
  });

  it('settles actual cost, freeing the unused reservation for another job', () => {
    ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.8,
      capUsd: 1,
    });
    ledger.settle('job-1', 0.3);

    expect(ledger.getRun('pilot-1')).toMatchObject({
      reservedUsd: 0,
      settledUsd: 0.3,
      availableUsd: 0.7,
    });
    expect(ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-2',
      provider: 'wan',
      maximumChargeUsd: 0.7,
      capUsd: 1,
    }).status).toBe('reserved');
  });

  it('retains uncertain reservations and only releases confirmed undispatched work', () => {
    ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.5,
      capUsd: 1,
    });
    ledger.markUncertain('job-1');

    expect(ledger.getRun('pilot-1').reservedUsd).toBe(0.5);
    expect(() => ledger.release('job-1')).toThrow('Cannot release');
    expect(() => ledger.closeRun('pilot-1')).toThrow('unresolved reservations');
    expect(ledger.settle('job-1', 0.2).status).toBe('settled');
  });

  it('records provider overruns and refuses further reservations beyond the cap', () => {
    ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.5,
      capUsd: 1,
    });

    expect(ledger.settle('job-1', 1.1)).toMatchObject({ status: 'overrun', actualUsd: 1.1 });
    expect(ledger.getRun('pilot-1').availableUsd).toBeCloseTo(-0.1);
    expect(() => ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-2',
      provider: 'wan',
      maximumChargeUsd: 0.01,
      capUsd: 1,
    })).toThrow('exceeds the remaining spend cap');
  });

  it('closes only resolved runs and rejects later reservations', () => {
    ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-1',
      provider: 'wan',
      maximumChargeUsd: 0.2,
      capUsd: 1,
    });
    ledger.release('job-1');

    expect(ledger.closeRun('pilot-1').status).toBe('closed');
    expect(() => ledger.reserve({
      runId: 'pilot-1',
      idempotencyKey: 'job-2',
      provider: 'wan',
      maximumChargeUsd: 0.2,
      capUsd: 1,
    })).toThrow('is closed');
  });
});
