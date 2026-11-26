import { ConfigError } from '../../shared/errors.js';
import type { HostedJob, HostedJobConcurrencyLimits, HostedJobsRepository } from '../../database/HostedJobsRepository.js';
import type { HostedArtifactTransferOptions } from './HostedArtifactTransfer.js';
import type { HostedMotionDispatcher } from './HostedMotionDispatcher.js';

export interface HostedMotionWorkerOptions {
  pollIntervalMs: number;
  batchSize: number;
  maxConcurrency?: number;
  limitsForProvider(provider: string): HostedJobConcurrencyLimits;
  artifactOptionsForProvider(provider: string): HostedArtifactTransferOptions;
}

export class HostedMotionWorker {
  private readonly maxConcurrency: number;

  constructor(
    private readonly dispatcher: HostedMotionDispatcher,
    private readonly jobs: HostedJobsRepository,
    private readonly options: HostedMotionWorkerOptions,
  ) {
    if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs <= 0) {
      throw new ConfigError('Hosted worker pollIntervalMs must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(options.batchSize) || options.batchSize <= 0) {
      throw new ConfigError('Hosted worker batchSize must be a positive safe integer.');
    }
    const maxConcurrency = options.maxConcurrency ?? options.batchSize;
    if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency <= 0) {
      throw new ConfigError('Hosted worker maxConcurrency must be a positive safe integer.');
    }
    this.maxConcurrency = maxConcurrency;
  }

  async runOnce(): Promise<HostedJob[]> {
    const states = new Map<string, HostedJob>();
    const [expired, recovered] = [
      await this.dispatcher.expire(this.maxConcurrency),
      await this.dispatcher.recover(this.maxConcurrency),
    ];
    for (const job of [...expired, ...recovered]) {
      states.set(job.jobId, job);
    }

    const pendingTransfers = [...states.values()].filter(
      (job) => job.status === 'succeeded' && (!job.artifactPath || !job.artifactSha256),
    );
    await runBounded(pendingTransfers, this.maxConcurrency, async (job) => {
      await this.dispatcher.transferArtifact(job.jobId, this.options.artifactOptionsForProvider(job.provider));
      states.set(job.jobId, this.jobs.getById(job.jobId));
    });

    const queued = this.jobs.queuedJobs().slice(0, this.options.batchSize);
    await runBounded(queued, this.maxConcurrency, async (job) => {
      const updated = await this.dispatcher.dispatch(job.jobId, this.options.limitsForProvider(job.provider));
      states.set(job.jobId, updated);
    });
    return [...states.values()];
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.runOnce();
      await delay(this.options.pollIntervalMs, signal);
    }
  }
}

async function runBounded<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const slots = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: slots }, async () => {
      while (nextIndex < items.length) {
        const current = items[nextIndex++]!;
        await worker(current);
      }
    }),
  );
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}
