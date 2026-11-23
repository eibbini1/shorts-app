import { ConfigError } from '../../shared/errors.js';
import type { EnqueueHostedJobInput, HostedJob, HostedJobConcurrencyLimits, HostedJobsRepository } from '../../database/HostedJobsRepository.js';
import type { HostedSpendLedgerRepository, ReserveSpendInput } from '../../database/HostedSpendLedgerRepository.js';
import type { MotionRequest } from './MotionEngine.js';
import {
  transferHostedArtifact,
  type HostedArtifactTransferOptions,
  type HostedArtifactUrlResolver,
  type TransferredHostedArtifact,
} from './HostedArtifactTransfer.js';

export type HostedProviderSnapshot =
  | { status: 'queued' | 'running' }
  | { status: 'succeeded'; artifactRef: string; actualCostUsd?: number }
  | { status: 'failed'; error: string; actualCostUsd?: number }
  | { status: 'cancelled'; actualCostUsd?: number };

export interface HostedMotionAdapter extends HostedArtifactUrlResolver {
  provider: string;
  supportsIdempotency: boolean;
  /** Stage stable private asset references to temporary provider-readable URLs in memory only. */
  prepareRequest(request: MotionRequest, signal: AbortSignal): Promise<MotionRequest>;
  submit(
    request: MotionRequest,
    input: { jobId: string; idempotencyKey: string; signal: AbortSignal },
  ): Promise<{ providerJobId: string }>;
  getStatus(providerJobId: string, signal: AbortSignal): Promise<HostedProviderSnapshot>;
  cancel(providerJobId: string, signal: AbortSignal): Promise<{ confirmed: boolean; actualCostUsd?: number }>;
}

export class HostedSubmissionError extends Error {
  constructor(
    message: string,
    readonly definitelyNotAccepted: boolean,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = 'HostedSubmissionError';
  }
}

export interface EnqueueHostedMotionInput extends EnqueueHostedJobInput {
  maximumChargeUsd: number;
  capUsd: number;
}

export class HostedMotionDispatcher {
  private readonly adapters: Map<string, HostedMotionAdapter>;

  constructor(
    private readonly jobs: HostedJobsRepository,
    private readonly spend: HostedSpendLedgerRepository,
    adapters: readonly HostedMotionAdapter[],
    private readonly requestTimeoutMs: number,
  ) {
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new ConfigError('requestTimeoutMs must be a positive safe integer.');
    }
    this.adapters = new Map();
    for (const adapter of adapters) {
      if (!adapter.provider.trim()) throw new ConfigError('Hosted adapters must declare a provider.');
      if (this.adapters.has(adapter.provider)) throw new ConfigError(`Duplicate hosted adapter "${adapter.provider}".`);
      this.adapters.set(adapter.provider, adapter);
    }
  }

  enqueue(input: EnqueueHostedMotionInput, options: { singleUse?: boolean } = {}): HostedJob {
    const adapter = this.adapterFor(input.provider);
    if ((input.maxSubmitAttempts ?? 1) > 1 && !adapter.supportsIdempotency) {
      throw new ConfigError(`Provider "${input.provider}" does not support idempotent submission retries.`);
    }
    const reservation: ReserveSpendInput = {
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider,
      maximumChargeUsd: input.maximumChargeUsd,
      capUsd: input.capUsd,
    };
    this.spend.reserve(reservation, options);
    try {
      return this.jobs.enqueue(input);
    } catch (error) {
      const persistedJob = this.jobs.findByIdempotencyKey(input.idempotencyKey);
      const spendReservation = this.spend.getReservation(input.idempotencyKey);
      if (!persistedJob && spendReservation.status === 'reserved') {
        try {
          this.spend.release(input.idempotencyKey);
        } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'Hosted job enqueue failed and its spend reservation could not be released.');
        }
      }
      throw error;
    }
  }

  async dispatch(jobId: string, limits: HostedJobConcurrencyLimits): Promise<HostedJob> {
    const job = this.jobs.getById(jobId);
    const adapter = this.adapterFor(job.provider);
    if (job.maxSubmitAttempts > 1 && !adapter.supportsIdempotency) {
      throw new ConfigError(`Provider "${job.provider}" does not support idempotent submission retries.`);
    }
    const claimed = this.jobs.claimForSubmission(jobId, limits);
    if (!claimed) return this.jobs.getById(jobId);
    if (claimed.status === 'timed_out') {
      this.releaseUndispatchedSpend(claimed);
      return claimed;
    }

    let prepared: MotionRequest;
    try {
      prepared = await adapter.prepareRequest(claimed.request, AbortSignal.timeout(this.requestTimeoutMs));
    } catch (error) {
      const failed = this.jobs.failDefinitiveSubmission(jobId, messageOf(error));
      this.releaseUndispatchedSpend(failed);
      return failed;
    }

    let submitted: { providerJobId: string };
    try {
      submitted = await adapter.submit(prepared, {
        jobId,
        idempotencyKey: claimed.idempotencyKey,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof HostedSubmissionError && error.definitelyNotAccepted) {
        if (error.retryable) {
          const retried = this.jobs.retrySubmission(jobId, true, error.retryAfterMs);
          if (retried.status === 'failed') this.releaseUndispatchedSpend(retried);
          return retried;
        }
        const failed = this.jobs.failDefinitiveSubmission(jobId, error.message);
        this.releaseUndispatchedSpend(failed);
        return failed;
      }
      const uncertain = this.jobs.retrySubmission(jobId, false, 0, messageOf(error));
      this.holdUncertainSpend(uncertain);
      return uncertain;
    }
    if (!submitted || !submitted.providerJobId?.trim()) {
      const uncertain = this.jobs.markUncertain(jobId, 'Provider accepted submission without returning a job id.');
      this.holdUncertainSpend(uncertain);
      return uncertain;
    }
    return this.jobs.markSubmitted(jobId, submitted.providerJobId);
  }

  async poll(jobId: string): Promise<HostedJob> {
    const job = this.jobs.getById(jobId);
    if (!job.providerJobId) return job;
    const adapter = this.adapterFor(job.provider);
    let snapshot: HostedProviderSnapshot;
    try {
      snapshot = await adapter.getStatus(job.providerJobId, AbortSignal.timeout(this.requestTimeoutMs));
    } catch (error) {
      if (job.status !== 'uncertain') {
        const uncertain = this.jobs.markUncertain(jobId, messageOf(error));
        this.holdUncertainSpend(uncertain);
        return uncertain;
      }
      this.holdUncertainSpend(job);
      return job;
    }

    switch (snapshot.status) {
      case 'queued':
        return job;
      case 'running':
        return job.status === 'running' || job.status === 'cancelling'
          ? job
          : this.jobs.markRunning(jobId);
      case 'succeeded': {
        const completed = this.jobs.markSucceeded(jobId, snapshot.artifactRef, snapshot.actualCostUsd);
        this.reconcileSpend(completed, snapshot.actualCostUsd);
        return completed;
      }
      case 'failed': {
        const failed = this.jobs.failProviderJob(jobId, snapshot.error, snapshot.actualCostUsd);
        this.reconcileSpend(failed, snapshot.actualCostUsd);
        return failed;
      }
      case 'cancelled': {
        const cancelling = this.jobs.requestCancellation(jobId);
        if (cancelling.status !== 'cancelling') {
          this.holdUncertainSpend(cancelling);
          return cancelling;
        }
        const cancelled = this.jobs.confirmCancellation(jobId, 'cancelled', snapshot.actualCostUsd);
        this.reconcileSpend(cancelled, snapshot.actualCostUsd);
        return cancelled;
      }
    }
  }

  async cancel(jobId: string): Promise<HostedJob> {
    return this.cancelWithOutcome(jobId, 'cancelled');
  }

  async expire(): Promise<HostedJob[]> {
    const expired = this.jobs.expiredJobs();
    const results: HostedJob[] = [];
    for (const item of expired) {
      if (item.timeout === 'dispatch') {
        const timedOut = this.jobs.expireQueued(item.job.jobId);
        this.releaseUndispatchedSpend(timedOut);
        results.push(timedOut);
      } else {
        results.push(await this.cancelWithOutcome(item.job.jobId, 'timed_out'));
      }
    }
    return results;
  }

  async recover(): Promise<HostedJob[]> {
    const recovered: HostedJob[] = [];
    for (const job of this.jobs.recoverableJobs()) {
      if (job.status === 'queued') {
        recovered.push(job);
      } else if (job.status === 'succeeded') {
        recovered.push(job);
      } else if (job.status === 'submitting') {
        const uncertain = this.jobs.markUncertain(job.jobId, 'Controller stopped during submission; reconcile before retrying.');
        this.holdUncertainSpend(uncertain);
        recovered.push(uncertain);
      } else if (job.status === 'cancelling') {
        recovered.push(await this.cancelWithOutcome(job.jobId, 'cancelled'));
      } else if (job.providerJobId) {
        recovered.push(await this.poll(job.jobId));
      } else {
        this.holdUncertainSpend(job);
        recovered.push(job);
      }
    }
    return recovered;
  }

  async transferArtifact(jobId: string, options: HostedArtifactTransferOptions): Promise<TransferredHostedArtifact> {
    const job = this.jobs.getById(jobId);
    const adapter = this.adapterFor(job.provider);
    return transferHostedArtifact(jobId, this.jobs, adapter, options);
  }

  private async cancelWithOutcome(jobId: string, outcome: 'cancelled' | 'timed_out'): Promise<HostedJob> {
    const job = this.jobs.requestCancellation(jobId);
    if (job.status === 'cancelled') {
      this.releaseUndispatchedSpend(job);
      return job;
    }
    if (job.status !== 'cancelling' || !job.providerJobId) {
      this.holdUncertainSpend(job);
      return job;
    }

    const adapter = this.adapterFor(job.provider);
    try {
      const result = await adapter.cancel(job.providerJobId, AbortSignal.timeout(this.requestTimeoutMs));
      if (!result.confirmed) {
        const uncertain = this.jobs.markUncertain(jobId, 'Provider did not confirm cancellation.');
        this.reconcileSpend(uncertain, result.actualCostUsd);
        return uncertain;
      }
      const cancelled = this.jobs.confirmCancellation(jobId, outcome, result.actualCostUsd);
      this.reconcileSpend(cancelled, result.actualCostUsd);
      return cancelled;
    } catch (error) {
      const uncertain = this.jobs.markUncertain(jobId, messageOf(error));
      this.holdUncertainSpend(uncertain);
      return uncertain;
    }
  }

  private reconcileSpend(job: HostedJob, actualCostUsd?: number): void {
    const reservation = this.spend.getReservation(job.idempotencyKey);
    if (actualCostUsd !== undefined) {
      this.spend.settle(job.idempotencyKey, actualCostUsd);
    } else if (reservation.status === 'reserved') {
      this.spend.markUncertain(job.idempotencyKey);
    }
  }

  private holdUncertainSpend(job: HostedJob): void {
    const reservation = this.spend.getReservation(job.idempotencyKey);
    if (reservation.status === 'reserved') this.spend.markUncertain(job.idempotencyKey);
  }

  private releaseUndispatchedSpend(job: HostedJob): void {
    const reservation = this.spend.getReservation(job.idempotencyKey);
    if (reservation.status === 'reserved') this.spend.release(job.idempotencyKey);
  }

  private adapterFor(provider: string): HostedMotionAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new ConfigError(`No hosted motion adapter is registered for provider "${provider}".`);
    return adapter;
  }
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch {
        return '[redacted URL]';
      }
    })
    .replace(/((?:token|signature|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
