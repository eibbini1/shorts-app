import { ConfigError } from '../../shared/errors.js';
import type { HostedJob, HostedJobConcurrencyLimits, HostedJobsRepository } from '../../database/HostedJobsRepository.js';
import type { HostedArtifactTransferOptions } from './HostedArtifactTransfer.js';
import type { HostedMotionDispatcher } from './HostedMotionDispatcher.js';

export interface HostedMotionWorkerOptions {
  pollIntervalMs: number;
  batchSize: number;
  limitsForProvider(provider: string): HostedJobConcurrencyLimits;
  artifactOptionsForProvider(provider: string): HostedArtifactTransferOptions;
}

export class HostedMotionWorker {
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
  }

  async runOnce(): Promise<HostedJob[]> {
    const states = new Map<string, HostedJob>();
    for (const job of [...await this.dispatcher.expire(), ...await this.dispatcher.recover()]) {
      states.set(job.jobId, job);
    }
    for (const job of states.values()) {
      if (job.status === 'succeeded' && (!job.artifactPath || !job.artifactSha256)) {
        await this.dispatcher.transferArtifact(job.jobId, this.options.artifactOptionsForProvider(job.provider));
        states.set(job.jobId, this.jobs.getById(job.jobId));
      }
    }

    for (const job of this.jobs.queuedJobs().slice(0, this.options.batchSize)) {
      states.set(job.jobId, await this.dispatcher.dispatch(job.jobId, this.options.limitsForProvider(job.provider)));
    }
    return [...states.values()];
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.runOnce();
      await delay(this.options.pollIntervalMs, signal);
    }
  }
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
