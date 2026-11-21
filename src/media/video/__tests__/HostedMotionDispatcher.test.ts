import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDbForTests, getDb } from '../../../database/connection.js';
import { HostedJobsRepository } from '../../../database/HostedJobsRepository.js';
import { HostedSpendLedgerRepository } from '../../../database/HostedSpendLedgerRepository.js';
import type { LocalDatabase } from '../../../database/connection.js';
import type { MotionRequest } from '../MotionEngine.js';
import {
  HostedMotionDispatcher,
  HostedSubmissionError,
  type HostedMotionAdapter,
  type HostedProviderSnapshot,
} from '../HostedMotionDispatcher.js';

const request: MotionRequest = {
  caseId: 'mixed-01',
  prompt: 'A cyclist rides beside a lake.',
  mode: 't2v',
  width: 1280,
  height: 720,
  fps: 24,
  frameCount: 120,
  seed: 1,
  audio: 'silent',
  conditioning: [],
};

function adapter(): HostedMotionAdapter {
  return {
    provider: 'provider-a',
    supportsIdempotency: true,
    prepareRequest: vi.fn(async (value) => value),
    submit: vi.fn(async () => ({ providerJobId: 'remote-1' })),
    getStatus: vi.fn(async () => ({ status: 'queued' as const })),
    cancel: vi.fn(async () => ({ confirmed: true, actualCostUsd: 0 })),
    getArtifactUrl: vi.fn(async () => 'https://storage.example/clip'),
  };
}

describe('HostedMotionDispatcher', () => {
  let db: LocalDatabase;
  let jobs: HostedJobsRepository;
  let spend: HostedSpendLedgerRepository;
  let now: Date;
  let provider: HostedMotionAdapter;
  let dispatcher: HostedMotionDispatcher;

  beforeEach(() => {
    __resetDbForTests();
    db = getDb(':memory:');
    now = new Date('2026-11-20T12:00:00.000Z');
    jobs = new HostedJobsRepository(db, () => new Date(now));
    spend = new HostedSpendLedgerRepository(db);
    provider = adapter();
    dispatcher = new HostedMotionDispatcher(jobs, spend, [provider], 1_000);
  });

  afterEach(() => __resetDbForTests());

  function enqueue(
    idempotencyKey: string,
    overrides: Partial<Parameters<HostedMotionDispatcher['enqueue']>[0]> = {},
  ) {
    return dispatcher.enqueue({
      idempotencyKey,
      runId: 'pilot',
      provider: 'provider-a',
      engineId: 'engine-a',
      request,
      maximumChargeUsd: 0.5,
      capUsd: 2,
      queueTimeoutMs: 60_000,
      workerTimeoutMs: 120_000,
      ...overrides,
    });
  }

  it('reserves spend before dispatch and settles actual cost after provider success', async () => {
    const key = 'success-job';
    const job = enqueue(key);
    expect(spend.getReservation(key).status).toBe('reserved');

    const submitted = await dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 });
    expect(submitted).toMatchObject({ status: 'submitted', providerJobId: 'remote-1', submitAttempts: 1 });

    vi.mocked(provider.getStatus)
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'succeeded', artifactRef: 'object-1', actualCostUsd: 0.3 });
    expect((await dispatcher.poll(job.jobId)).status).toBe('running');
    expect(await dispatcher.poll(job.jobId)).toMatchObject({ status: 'succeeded', artifactRef: 'object-1' });
    expect(spend.getReservation(key)).toMatchObject({ status: 'settled', actualUsd: 0.3 });
  });

  it('keeps ambiguous submissions uncertain and does not retry them', async () => {
    const key = 'ambiguous-job';
    const job = enqueue(key);
    vi.mocked(provider.submit).mockRejectedValueOnce(new Error(
      'POST https://provider.example/jobs?api_key=secret failed after connection reset',
    ));

    const uncertain = await dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 });
    expect(uncertain).toMatchObject({
      status: 'uncertain',
      error: expect.not.stringContaining('secret'),
    });
    expect(spend.getReservation(key).status).toBe('uncertain');
    expect((await dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 })).status).toBe('uncertain');
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });

  it('retries only explicit, definite transient rejections and enforces the retry ceiling', async () => {
    const job = enqueue('retry-job', { maxSubmitAttempts: 2 });
    vi.mocked(provider.submit)
      .mockRejectedValueOnce(new HostedSubmissionError('Provider returned a transient 429.', true, true))
      .mockResolvedValueOnce({ providerJobId: 'remote-2' });

    expect((await dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 })).status).toBe('queued');
    expect(spend.getReservation(job.idempotencyKey).status).toBe('reserved');
    expect((await dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 })).status).toBe('submitted');
    expect(provider.submit).toHaveBeenCalledTimes(2);
    expect(provider.submit.mock.calls[0]?.[1].idempotencyKey).toBe(job.idempotencyKey);
    expect(provider.submit.mock.calls[1]?.[1].idempotencyKey).toBe(job.idempotencyKey);
    expect((await dispatcher.cancel(job.jobId)).status).toBe('cancelled');

    const noRetry = enqueue('no-retry-job');
    vi.mocked(provider.submit).mockRejectedValueOnce(
      new HostedSubmissionError('Provider rejected the request.', true, true),
    );
    expect((await dispatcher.dispatch(noRetry.jobId, { controller: 1, provider: 1 })).status).toBe('failed');
    expect(spend.getReservation(noRetry.idempotencyKey).status).toBe('released');
  });

  it('releases queued timeouts and confirms worker cancellation before closing spend', async () => {
    const queued = enqueue('queued-timeout', { queueTimeoutMs: 10 });
    now = new Date(now.getTime() + 10);
    expect(await dispatcher.expire()).toMatchObject([{ status: 'timed_out' }]);
    expect(jobs.getById(queued.jobId).status).toBe('timed_out');
    expect(spend.getReservation(queued.idempotencyKey).status).toBe('released');

    const running = enqueue('worker-timeout', { workerTimeoutMs: 20 });
    await dispatcher.dispatch(running.jobId, { controller: 1, provider: 1 });
    vi.mocked(provider.getStatus).mockResolvedValueOnce({ status: 'running' } satisfies HostedProviderSnapshot);
    await dispatcher.poll(running.jobId);
    now = new Date(now.getTime() + 20);
    expect(await dispatcher.expire()).toMatchObject([{ status: 'timed_out' }]);
    expect(spend.getReservation(running.idempotencyKey)).toMatchObject({ status: 'settled', actualUsd: 0 });
  });

  it('refuses retries when the provider cannot guarantee idempotent submission', () => {
    provider = { ...provider, supportsIdempotency: false };
    dispatcher = new HostedMotionDispatcher(jobs, spend, [provider], 1_000);
    expect(() => enqueue('unsafe-retry', { maxSubmitAttempts: 2 }))
      .toThrow('does not support idempotent submission retries');
  });

  it('releases a reservation when signed input URLs are rejected before dispatch', () => {
    const key = 'signed-input';
    expect(() => enqueue(key, {
      request: {
        ...request,
        conditioning: [{
          kind: 'image',
          role: 'first-frame',
          uri: 'https://storage.example/frame.png?signature=secret',
          sha256: 'a'.repeat(64),
        }],
      },
    })).toThrow('Do not persist signed conditioning URLs');
    expect(spend.getReservation(key).status).toBe('released');
  });
});
