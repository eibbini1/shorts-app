import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { __resetDbForTests, getDb } from '../../../database/connection.js';
import { HostedJobsRepository } from '../../../database/HostedJobsRepository.js';
import { HostedSpendLedgerRepository } from '../../../database/HostedSpendLedgerRepository.js';
import type { LocalDatabase } from '../../../database/connection.js';
import type { MotionRequest } from '../MotionEngine.js';
import type { HostedMotionAdapter } from '../HostedMotionDispatcher.js';
import { HostedMotionDispatcher } from '../HostedMotionDispatcher.js';
import { HostedMotionWorker } from '../HostedMotionWorker.js';

const request: MotionRequest = {
  prompt: 'A cyclist rides beside a lake.',
  mode: 't2v',
  width: 1280,
  height: 720,
  fps: 24,
  frameCount: 120,
  audio: 'silent',
  conditioning: [],
};

describe('HostedMotionWorker', () => {
  let db: LocalDatabase;
  let jobs: HostedJobsRepository;
  let spend: HostedSpendLedgerRepository;
  let storageRoot: string;
  let adapter: HostedMotionAdapter;
  let dispatcher: HostedMotionDispatcher;
  let worker: HostedMotionWorker;

  beforeEach(async () => {
    __resetDbForTests();
    db = getDb(':memory:');
    jobs = new HostedJobsRepository(db);
    spend = new HostedSpendLedgerRepository(db);
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'hosted-worker-'));
    adapter = {
      provider: 'provider-a',
      supportsIdempotency: true,
      prepareRequest: vi.fn(async (value) => value),
      submit: vi.fn(async () => ({ providerJobId: 'remote-1' })),
      getStatus: vi.fn(async () => ({ status: 'queued' as const })),
      cancel: vi.fn(async () => ({ confirmed: true, actualCostUsd: 0 })),
      getArtifactUrl: vi.fn(async () => 'https://storage.example/clip'),
    };
    dispatcher = new HostedMotionDispatcher(jobs, spend, [adapter], 1_000);
    worker = new HostedMotionWorker(dispatcher, jobs, {
      pollIntervalMs: 100,
      batchSize: 2,
      limitsForProvider: () => ({ controller: 1, provider: 1 }),
      artifactOptionsForProvider: () => ({
        storageRoot,
        allowedHosts: ['storage.example'],
        maxBytes: 16,
        timeoutMs: 1_000,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0, 1, 2]), {
          status: 200,
          headers: { 'content-length': '3' },
        })),
      }),
    });
  });

  afterEach(async () => {
    __resetDbForTests();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('dispatches queued work and recovers/transfers completed artifacts on later passes', async () => {
    const job = dispatcher.enqueue({
      idempotencyKey: 'worker-job',
      runId: 'pilot',
      provider: 'provider-a',
      engineId: 'engine-a',
      request,
      maximumChargeUsd: 0.5,
      capUsd: 1,
      dispatchTimeoutMs: 5_000,
      queueTimeoutMs: 5_000,
      workerTimeoutMs: 10_000,
    });

    expect(await worker.runOnce()).toMatchObject([{ jobId: job.jobId, status: 'submitted' }]);
    vi.mocked(adapter.getStatus).mockResolvedValueOnce({
      status: 'succeeded',
      artifactRef: 'object-1',
      actualCostUsd: 0.2,
    });

    const recovered = await worker.runOnce();
    expect(recovered).toMatchObject([{
      jobId: job.jobId,
      status: 'succeeded',
      artifactRef: 'object-1',
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }]);
    expect(jobs.getById(job.jobId).artifactPath).toContain(job.jobId);
    expect(spend.getReservation(job.idempotencyKey)).toMatchObject({ status: 'settled', actualUsd: 0.2 });
  });

  it('dispatches and polls multiple jobs concurrently up to maxConcurrency', async () => {
    let activeSubmissions = 0;
    let peakSubmissions = 0;
    let seq = 0;
    vi.mocked(adapter.submit).mockImplementation(async () => {
      activeSubmissions += 1;
      peakSubmissions = Math.max(peakSubmissions, activeSubmissions);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeSubmissions -= 1;
      return { providerJobId: `remote-${++seq}` };
    });

    const parallelWorker = new HostedMotionWorker(dispatcher, jobs, {
      pollIntervalMs: 100,
      batchSize: 4,
      maxConcurrency: 4,
      limitsForProvider: () => ({ controller: 4, provider: 4 }),
      artifactOptionsForProvider: () => ({
        storageRoot,
        allowedHosts: ['storage.example'],
        maxBytes: 16,
        timeoutMs: 1_000,
        fetcher: vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        })),
      }),
    });

    for (let i = 0; i < 4; i += 1) {
      dispatcher.enqueue({
        idempotencyKey: `parallel-job-${i}`,
        runId: 'parallel-run',
        provider: 'provider-a',
        engineId: 'engine-a',
        request: { ...request, seed: i + 1 },
        maximumChargeUsd: 0.25,
        capUsd: 2,
        dispatchTimeoutMs: 5_000,
        queueTimeoutMs: 5_000,
        workerTimeoutMs: 10_000,
      });
    }

    const dispatched = await parallelWorker.runOnce();
    expect(dispatched.filter((j) => j.status === 'submitted')).toHaveLength(4);
    expect(peakSubmissions).toBeGreaterThanOrEqual(2);

    vi.mocked(adapter.getStatus).mockImplementation(async (providerJobId) => ({
      status: 'succeeded',
      artifactRef: `object-${providerJobId}`,
      actualCostUsd: 0.1,
    }));

    const completed = await parallelWorker.runOnce();
    expect(completed.filter((j) => j.status === 'succeeded' && j.artifactSha256)).toHaveLength(4);
  });
});
