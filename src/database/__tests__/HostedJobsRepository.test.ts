import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests, getDb } from '../connection.js';
import { HostedJobsRepository } from '../HostedJobsRepository.js';
import { HostedSpendLedgerRepository } from '../HostedSpendLedgerRepository.js';
import type { MotionRequest } from '../../media/video/MotionEngine.js';
import type { LocalDatabase } from '../connection.js';

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

describe('HostedJobsRepository', () => {
  let db: LocalDatabase;
  let jobs: HostedJobsRepository;
  let now: Date;

  beforeEach(() => {
    __resetDbForTests();
    db = getDb(':memory:');
    now = new Date('2026-11-20T12:00:00.000Z');
    jobs = new HostedJobsRepository(db, () => new Date(now));
  });

  afterEach(() => __resetDbForTests());

  function enqueue(
    idempotencyKey: string,
    overrides: Partial<Parameters<HostedJobsRepository['enqueue']>[0]> = {},
  ) {
    const runId = 'pilot-1';
    const provider = overrides.provider ?? 'provider-a';
    new HostedSpendLedgerRepository(db).reserve({
      runId,
      idempotencyKey,
      provider,
      maximumChargeUsd: 0.5,
      capUsd: 5,
    });
    return jobs.enqueue({
      idempotencyKey,
      runId,
      provider,
      engineId: 'engine-a',
      request,
      queueTimeoutMs: 60_000,
      workerTimeoutMs: 120_000,
      ...overrides,
    });
  }

  it('creates an idempotent job bound to its spend reservation and canonical request hash', () => {
    const first = enqueue('job-key-1');
    const repeated = jobs.enqueue({
      idempotencyKey: 'job-key-1',
      runId: 'pilot-1',
      provider: 'provider-a',
      engineId: 'engine-a',
      request: { ...request, conditioning: [], audio: 'silent' },
      queueTimeoutMs: 60_000,
      workerTimeoutMs: 120_000,
    });

    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      status: 'queued',
      submitAttempts: 0,
      requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(() => jobs.enqueue({
      idempotencyKey: 'job-key-1',
      runId: 'pilot-1',
      provider: 'provider-a',
      engineId: 'engine-a',
      request: { ...request, prompt: 'Different request.' },
      queueTimeoutMs: 60_000,
      workerTimeoutMs: 120_000,
    })).toThrow('different job parameters');
  });

  it('refuses to persist signed or embedded conditioning media', () => {
    expect(() => enqueue('private-input', {
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
    expect(() => enqueue('embedded-input', {
      request: {
        ...request,
        conditioning: [{
          kind: 'image',
          role: 'first-frame',
          uri: 'data:image/png;base64,abc',
          sha256: 'a'.repeat(64),
        }],
      },
    })).toThrow('private asset references');
  });

  it('claims jobs atomically within controller and provider concurrency limits', () => {
    const first = enqueue('job-key-1');
    const second = enqueue('job-key-2');
    const otherProvider = enqueue('job-key-3', { provider: 'provider-b' });
    const limits = { controller: 2, provider: 1 };

    expect(jobs.claimForSubmission(first.jobId, limits)?.status).toBe('submitting');
    expect(jobs.claimForSubmission(second.jobId, limits)).toBeNull();
    expect(jobs.claimForSubmission(otherProvider.jobId, limits)?.status).toBe('submitting');

    jobs.markSubmitted(first.jobId, 'remote-1');
    jobs.requestCancellation(first.jobId);
    jobs.confirmCancellation(first.jobId, 'cancelled', 0);
    expect(jobs.claimForSubmission(second.jobId, limits)?.status).toBe('submitting');
  });

  it('bounds only definite submission retries and keeps ambiguous submissions reserved', () => {
    const job = enqueue('job-key-1', { maxSubmitAttempts: 2 });
    const limits = { controller: 1, provider: 1 };

    expect(jobs.claimForSubmission(job.jobId, limits)?.submitAttempts).toBe(1);
    expect(jobs.retrySubmission(job.jobId, true, 1_000).status).toBe('queued');
    expect(jobs.claimForSubmission(job.jobId, limits)).toBeNull();

    now = new Date(now.getTime() + 1_000);
    expect(jobs.claimForSubmission(job.jobId, limits)?.submitAttempts).toBe(2);
    expect(jobs.retrySubmission(job.jobId, true).status).toBe('failed');

    const ambiguous = enqueue('job-key-2');
    expect(jobs.claimForSubmission(ambiguous.jobId, limits)?.status).toBe('submitting');
    expect(jobs.retrySubmission(ambiguous.jobId, false).status).toBe('uncertain');
    expect(jobs.claimForSubmission(ambiguous.jobId, limits)).toBeNull();
    expect(jobs.recoverableJobs().map((item) => item.jobId)).toContain(ambiguous.jobId);
  });

  it('tracks separate dispatch, provider-queue, and worker deadlines', () => {
    const job = enqueue('job-key-1', { queueTimeoutMs: 500 });
    now = new Date(now.getTime() + 500);
    expect(jobs.expiredJobs()).toMatchObject([{ job: { jobId: job.jobId }, timeout: 'dispatch' }]);
    expect(jobs.claimForSubmission(job.jobId, { controller: 1, provider: 1 })?.status).toBe('timed_out');

    const providerQueued = enqueue('provider-queue', { dispatchTimeoutMs: 5_000, queueTimeoutMs: 500 });
    jobs.claimForSubmission(providerQueued.jobId, { controller: 1, provider: 1 });
    jobs.markSubmitted(providerQueued.jobId, 'remote-queue');
    now = new Date(now.getTime() + 500);
    expect(jobs.expiredJobs()).toMatchObject([{ job: { jobId: providerQueued.jobId }, timeout: 'queue' }]);
    jobs.requestCancellation(providerQueued.jobId);
    jobs.confirmCancellation(providerQueued.jobId, 'timed_out', 0);

    const recovered = enqueue('job-key-2');
    jobs.claimForSubmission(recovered.jobId, { controller: 1, provider: 1 });
    jobs.markSubmitted(recovered.jobId, 'remote-2');
    const running = jobs.markRunning(recovered.jobId);
    expect(running.workerDeadlineAt).toBe(new Date(now.getTime() + running.workerTimeoutMs).toISOString());
    now = new Date(now.getTime() + running.workerTimeoutMs);
    expect(jobs.expiredJobs()).toMatchObject([{ job: { jobId: recovered.jobId }, timeout: 'worker' }]);

    jobs.markSucceeded(recovered.jobId, 'bucket/object-key-123', 0.2);
    expect(jobs.getById(recovered.jobId).artifactRef).toBe('bucket/object-key-123');
    expect(jobs.recoverableJobs().map((item) => item.jobId)).toContain(recovered.jobId);
    const stored = jobs.recordArtifact(recovered.jobId, '/private/artifacts/job.mp4', 'A'.repeat(64));
    expect(stored).toMatchObject({ status: 'succeeded', artifactSha256: 'a'.repeat(64) });
    expect(jobs.recoverableJobs().map((item) => item.jobId)).not.toContain(recovered.jobId);
  });

  it('does not silently treat an in-flight cancellation as confirmed', () => {
    const job = enqueue('job-key-1');
    jobs.claimForSubmission(job.jobId, { controller: 1, provider: 1 });
    expect(jobs.requestCancellation(job.jobId).status).toBe('uncertain');
    expect(() => jobs.confirmCancellation(job.jobId, 'cancelled')).toThrow('no provider cancellation to confirm');
  });
});
