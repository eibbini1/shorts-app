import { randomUUID, createHash } from 'node:crypto';
import type { SQLInputValue, StatementResultingChanges } from 'node:sqlite';
import { ConfigError } from '../shared/errors.js';
import type { MotionRequest } from '../media/video/MotionEngine.js';
import type { LocalDatabase } from './connection.js';

export type HostedJobStatus =
  | 'queued'
  | 'submitting'
  | 'submitted'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'uncertain';

export interface HostedJob {
  jobId: string;
  idempotencyKey: string;
  runId: string;
  provider: string;
  engineId: string;
  request: MotionRequest;
  requestSha256: string;
  status: HostedJobStatus;
  providerJobId: string | null;
  submitAttempts: number;
  maxSubmitAttempts: number;
  dispatchTimeoutMs: number;
  queueTimeoutMs: number;
  workerTimeoutMs: number;
  dispatchDeadlineAt: string;
  queueDeadlineAt: string | null;
  nextAttemptAt: string;
  workerDeadlineAt: string | null;
  artifactRef: string | null;
  artifactPath: string | null;
  artifactSha256: string | null;
  actualCostUsd: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface EnqueueHostedJobInput {
  idempotencyKey: string;
  runId: string;
  provider: string;
  engineId: string;
  request: MotionRequest;
  dispatchTimeoutMs?: number;
  queueTimeoutMs: number;
  workerTimeoutMs: number;
  maxSubmitAttempts?: number;
}

export interface HostedJobConcurrencyLimits {
  controller: number;
  provider: number;
}

export interface ExpiredHostedJob {
  job: HostedJob;
  timeout: 'dispatch' | 'queue' | 'worker';
}

type SqliteRow = Record<string, SQLInputValue | StatementResultingChanges>;
type Clock = () => Date;
const ACTIVE_STATUSES = ['submitting', 'submitted', 'running', 'cancelling', 'uncertain'] as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MICROS_PER_USD = 1_000_000;

function rowString(row: SqliteRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function rowNumber(row: SqliteRow, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function rowNullableString(row: SqliteRow, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function rowNullableNumber(row: SqliteRow, field: string): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'number') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return item;
  };
  const json = JSON.stringify(normalize(value));
  if (json === undefined) throw new ConfigError('Hosted job request must be JSON serializable.');
  return json;
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigError(`${label} must be a positive safe integer.`);
  }
}

function costMicros(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ConfigError('actualCostUsd must be a finite non-negative USD amount.');
  }
  const micros = Math.round(value * MICROS_PER_USD);
  if (!Number.isSafeInteger(micros)) throw new ConfigError('actualCostUsd is outside the supported range.');
  return micros;
}

function jobFromRow(row: SqliteRow): HostedJob {
  const cost = rowNullableNumber(row, 'actualMicros');
  let request: MotionRequest;
  try {
    request = JSON.parse(rowString(row, 'requestJson')) as MotionRequest;
  } catch (error) {
    throw new Error(`Hosted job request JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    jobId: rowString(row, 'jobId'),
    idempotencyKey: rowString(row, 'idempotencyKey'),
    runId: rowString(row, 'runId'),
    provider: rowString(row, 'provider'),
    engineId: rowString(row, 'engineId'),
    request,
    requestSha256: rowString(row, 'requestSha256'),
    status: rowString(row, 'status') as HostedJobStatus,
    providerJobId: rowNullableString(row, 'providerJobId'),
    submitAttempts: rowNumber(row, 'submitAttempts'),
    maxSubmitAttempts: rowNumber(row, 'maxSubmitAttempts'),
    dispatchTimeoutMs: rowNumber(row, 'dispatchTimeoutMs'),
    queueTimeoutMs: rowNumber(row, 'queueTimeoutMs'),
    workerTimeoutMs: rowNumber(row, 'workerTimeoutMs'),
    dispatchDeadlineAt: rowString(row, 'dispatchDeadlineAt'),
    queueDeadlineAt: rowNullableString(row, 'queueDeadlineAt'),
    nextAttemptAt: rowString(row, 'nextAttemptAt'),
    workerDeadlineAt: rowNullableString(row, 'workerDeadlineAt'),
    artifactRef: rowNullableString(row, 'artifactRef'),
    artifactPath: rowNullableString(row, 'artifactPath'),
    artifactSha256: rowNullableString(row, 'artifactSha256'),
    actualCostUsd: cost === null ? null : cost / MICROS_PER_USD,
    error: rowNullableString(row, 'error'),
    createdAt: rowString(row, 'createdAt'),
    updatedAt: rowString(row, 'updatedAt'),
    finishedAt: rowNullableString(row, 'finishedAt'),
  };
}

export class HostedJobsRepository {
  constructor(
    private readonly db: LocalDatabase,
    private readonly clock: Clock = () => new Date(),
  ) {}

  enqueue(input: EnqueueHostedJobInput): HostedJob {
    for (const [label, value] of Object.entries({
      idempotencyKey: input.idempotencyKey,
      runId: input.runId,
      provider: input.provider,
      engineId: input.engineId,
    })) {
      if (!value.trim()) throw new ConfigError(`${label} must not be empty.`);
    }
    positiveInteger(input.queueTimeoutMs, 'queueTimeoutMs');
    positiveInteger(input.workerTimeoutMs, 'workerTimeoutMs');
    const dispatchTimeoutMs = input.dispatchTimeoutMs ?? input.queueTimeoutMs;
    positiveInteger(dispatchTimeoutMs, 'dispatchTimeoutMs');
    const maxSubmitAttempts = input.maxSubmitAttempts ?? 1;
    positiveInteger(maxSubmitAttempts, 'maxSubmitAttempts');
    if (maxSubmitAttempts > 5) throw new ConfigError('maxSubmitAttempts must not exceed 5.');
    for (const asset of input.request.conditioning) {
      if (/^data:/i.test(asset.uri)) {
        throw new ConfigError('Hosted conditioning assets must use private asset references, not embedded data URLs.');
      }
      if (/^https?:\/\//i.test(asset.uri)) {
        try {
          const url = new URL(asset.uri);
          if (url.search || url.hash || url.username || url.password) {
            throw new ConfigError('Do not persist signed conditioning URLs; store a stable private asset reference instead.');
          }
        } catch (error) {
          if (error instanceof ConfigError) throw error;
          throw new ConfigError('Hosted conditioning asset URL is invalid.');
        }
      }
    }

    const requestJson = canonicalJson(input.request);
    const requestSha256 = createHash('sha256').update(requestJson).digest('hex');
    return this.inTransaction(() => {
      const existing = this.findRowByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        const job = jobFromRow(existing);
        const matches = job.runId === input.runId &&
          job.provider === input.provider &&
          job.engineId === input.engineId &&
          job.requestSha256 === requestSha256 &&
          job.dispatchTimeoutMs === dispatchTimeoutMs &&
          job.queueTimeoutMs === input.queueTimeoutMs &&
          job.workerTimeoutMs === input.workerTimeoutMs &&
          job.maxSubmitAttempts === maxSubmitAttempts;
        if (!matches) {
          throw new ConfigError(`Idempotency key "${input.idempotencyKey}" was already used with different job parameters.`);
        }
        return job;
      }

      const reservation = this.db.prepare(`
        SELECT runId, provider, status
        FROM hosted_spend_reservations
        WHERE idempotencyKey = ?
      `).get(input.idempotencyKey) as SqliteRow | undefined;
      if (!reservation) throw new ConfigError(`Hosted job "${input.idempotencyKey}" has no spend reservation.`);
      if (rowString(reservation, 'runId') !== input.runId || rowString(reservation, 'provider') !== input.provider) {
        throw new ConfigError(`Hosted job "${input.idempotencyKey}" does not match its spend reservation.`);
      }
      if (rowString(reservation, 'status') !== 'reserved') {
        throw new ConfigError(`Hosted job "${input.idempotencyKey}" requires an unresolved reserved spend record.`);
      }

      const now = this.clock();
      const nowIso = now.toISOString();
      const dispatchDeadlineAt = new Date(now.getTime() + dispatchTimeoutMs).toISOString();
      const jobId = randomUUID();
      this.db.prepare(`
        INSERT INTO hosted_motion_jobs (
          jobId, idempotencyKey, runId, provider, engineId, requestJson, requestSha256,
          status, maxSubmitAttempts, dispatchTimeoutMs, queueTimeoutMs, workerTimeoutMs,
          dispatchDeadlineAt, nextAttemptAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        jobId, input.idempotencyKey, input.runId, input.provider, input.engineId,
        requestJson, requestSha256, maxSubmitAttempts, dispatchTimeoutMs, input.queueTimeoutMs,
        input.workerTimeoutMs, dispatchDeadlineAt, nowIso, nowIso, nowIso,
      );
      return this.getById(jobId);
    });
  }

  getById(jobId: string): HostedJob {
    const row = this.db.prepare('SELECT * FROM hosted_motion_jobs WHERE jobId = ?').get(jobId) as SqliteRow | undefined;
    if (!row) throw new ConfigError(`Hosted job "${jobId}" does not exist.`);
    return jobFromRow(row);
  }

  getByIdempotencyKey(idempotencyKey: string): HostedJob {
    const row = this.findRowByIdempotencyKey(idempotencyKey);
    if (!row) throw new ConfigError(`Hosted job "${idempotencyKey}" does not exist.`);
    return jobFromRow(row);
  }

  findByIdempotencyKey(idempotencyKey: string): HostedJob | null {
    const row = this.findRowByIdempotencyKey(idempotencyKey);
    return row ? jobFromRow(row) : null;
  }

  claimForSubmission(jobId: string, limits: HostedJobConcurrencyLimits): HostedJob | null {
    positiveInteger(limits.controller, 'controller concurrency limit');
    positiveInteger(limits.provider, 'provider concurrency limit');
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status !== 'queued') return null;
      const now = this.clock();
      const nowIso = now.toISOString();
      if (Date.parse(job.dispatchDeadlineAt) <= now.getTime()) {
        this.db.prepare(`
          UPDATE hosted_motion_jobs
          SET status = 'timed_out', error = 'Queue timeout expired before submission.',
              finishedAt = ?, updatedAt = ?
          WHERE jobId = ?
        `).run(nowIso, nowIso, jobId);
        return this.getById(jobId);
      }
      if (Date.parse(job.nextAttemptAt) > now.getTime()) return null;

      const activeStatuses = ACTIVE_STATUSES.map(() => '?').join(', ');
      const activeForController = this.db.prepare(`
        SELECT COUNT(*) AS count FROM hosted_motion_jobs
        WHERE status IN (${activeStatuses})
      `).get(...ACTIVE_STATUSES) as SqliteRow;
      const activeForProvider = this.db.prepare(`
        SELECT COUNT(*) AS count FROM hosted_motion_jobs
        WHERE provider = ? AND status IN (${activeStatuses})
      `).get(job.provider, ...ACTIVE_STATUSES) as SqliteRow;
      if (rowNumber(activeForController, 'count') >= limits.controller ||
          rowNumber(activeForProvider, 'count') >= limits.provider) return null;

      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'submitting', submitAttempts = submitAttempts + 1, updatedAt = ?, error = NULL
        WHERE jobId = ?
      `).run(nowIso, jobId);
      return this.getById(jobId);
    });
  }

  markSubmitted(jobId: string, providerJobId: string): HostedJob {
    if (!providerJobId.trim()) throw new ConfigError('providerJobId must not be empty.');
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status !== 'submitting') {
        throw new ConfigError(`Cannot mark hosted job "${jobId}" submitted from status "${job.status}".`);
      }
      const now = this.clock();
      const nowIso = now.toISOString();
      const queueDeadlineAt = new Date(now.getTime() + job.queueTimeoutMs).toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'submitted', providerJobId = ?, queueDeadlineAt = ?, updatedAt = ?, error = NULL
        WHERE jobId = ?
      `).run(providerJobId, queueDeadlineAt, nowIso, jobId);
      return this.getById(jobId);
    });
  }

  markRunning(jobId: string): HostedJob {
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status === 'running') return job;
      if (job.status !== 'submitted' && !(job.status === 'uncertain' && job.providerJobId)) {
        throw new ConfigError(`Cannot mark hosted job "${jobId}" running from status "${job.status}".`);
      }
      const now = this.clock();
      const nowIso = now.toISOString();
      const workerDeadlineAt = job.workerDeadlineAt ?? new Date(now.getTime() + job.workerTimeoutMs).toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'running', workerDeadlineAt = ?, updatedAt = ?
        WHERE jobId = ?
      `).run(workerDeadlineAt, nowIso, jobId);
      return this.getById(jobId);
    });
  }

  retrySubmission(
    jobId: string,
    definitelyNotAccepted: boolean,
    delayMs = 0,
    ambiguousError = 'Submission outcome is ambiguous; reconcile before retrying.',
  ): HostedJob {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new ConfigError('retry delay must be a non-negative safe integer.');
    if (!ambiguousError.trim()) throw new ConfigError('Ambiguous submission requires an explanatory error.');
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status !== 'submitting' || job.providerJobId !== null) {
        throw new ConfigError(`Hosted job "${jobId}" is not eligible for a submission retry.`);
      }
      const now = this.clock();
      const nowIso = now.toISOString();
      if (!definitelyNotAccepted) {
        this.db.prepare(`
          UPDATE hosted_motion_jobs
          SET status = 'uncertain', error = ?, updatedAt = ?
          WHERE jobId = ?
        `).run(ambiguousError, nowIso, jobId);
      } else if (job.submitAttempts >= job.maxSubmitAttempts) {
        this.db.prepare(`
          UPDATE hosted_motion_jobs
          SET status = 'failed', error = 'Submission retry limit reached.',
              finishedAt = ?, updatedAt = ?
          WHERE jobId = ?
        `).run(nowIso, nowIso, jobId);
      } else {
        this.db.prepare(`
          UPDATE hosted_motion_jobs
          SET status = 'queued', nextAttemptAt = ?, error = NULL, updatedAt = ?
          WHERE jobId = ?
        `).run(new Date(now.getTime() + delayMs).toISOString(), nowIso, jobId);
      }
      return this.getById(jobId);
    });
  }

  markUncertain(jobId: string, error: string): HostedJob {
    if (!error.trim()) throw new ConfigError('Uncertain hosted jobs require an explanatory error.');
    return this.updateFrom(jobId, ['submitting', 'submitted', 'running', 'cancelling'], `
      status = 'uncertain', error = ?, updatedAt = ?
    `, [error, this.clock().toISOString()]);
  }

  markSucceeded(jobId: string, artifactRef: string, actualCostUsd?: number): HostedJob {
    if (!artifactRef.trim()) throw new ConfigError('A successful hosted job must include an opaque artifact reference.');
    if (/^(?:https?:|data:)/i.test(artifactRef)) {
      throw new ConfigError('Store an opaque artifact reference, not a URL or embedded artifact data.');
    }
    const actualMicros = actualCostUsd === undefined ? null : costMicros(actualCostUsd);
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status === 'succeeded') {
        if (job.artifactRef !== artifactRef ||
            (actualCostUsd !== undefined && job.actualCostUsd !== actualMicros! / MICROS_PER_USD)) {
          throw new ConfigError(`Hosted job "${jobId}" was already completed with different result data.`);
        }
        return job;
      }
      if (!['submitted', 'running', 'cancelling', 'uncertain'].includes(job.status) ||
          (job.status !== 'submitted' && !job.providerJobId)) {
        throw new ConfigError(`Cannot complete hosted job "${jobId}" from status "${job.status}".`);
      }
      const now = this.clock().toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'succeeded', artifactRef = ?, actualMicros = ?, finishedAt = ?, updatedAt = ?, error = NULL
        WHERE jobId = ?
      `).run(artifactRef, actualMicros, now, now, jobId);
      return this.getById(jobId);
    });
  }

  recordArtifact(jobId: string, artifactPath: string, artifactSha256: string): HostedJob {
    if (!artifactPath.trim()) throw new ConfigError('artifactPath must not be empty.');
    if (!SHA256_PATTERN.test(artifactSha256)) throw new ConfigError('artifactSha256 must be a SHA-256 digest.');
    return this.updateFrom(jobId, ['succeeded'], `
      artifactPath = ?, artifactSha256 = ?, updatedAt = ?
    `, [artifactPath, artifactSha256.toLowerCase(), this.clock().toISOString()]);
  }

  failDefinitiveSubmission(jobId: string, error: string): HostedJob {
    if (!error.trim()) throw new ConfigError('Failed hosted jobs require an explanatory error.');
    return this.updateFrom(jobId, ['submitting'], `
      status = 'failed', error = ?, finishedAt = ?, updatedAt = ?
    `, [error, this.clock().toISOString(), this.clock().toISOString()]);
  }

  failProviderJob(jobId: string, error: string, actualCostUsd?: number): HostedJob {
    if (!error.trim()) throw new ConfigError('Failed hosted jobs require an explanatory error.');
    const actualMicros = actualCostUsd === undefined ? null : costMicros(actualCostUsd);
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (!['submitted', 'running', 'cancelling', 'uncertain'].includes(job.status) || !job.providerJobId) {
        throw new ConfigError(`Hosted job "${jobId}" has no confirmed provider job to fail.`);
      }
      const now = this.clock().toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'failed', error = ?, actualMicros = ?, finishedAt = ?, updatedAt = ?
        WHERE jobId = ?
      `).run(error, actualMicros, now, now, jobId);
      return this.getById(jobId);
    });
  }

  requestCancellation(jobId: string): HostedJob {
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      const now = this.clock().toISOString();
      if (job.status === 'cancelled' || job.status === 'timed_out' || job.status === 'failed' || job.status === 'succeeded') {
        return job;
      } else if (job.status === 'queued') {
        this.db.prepare(`
          UPDATE hosted_motion_jobs SET status = 'cancelled', finishedAt = ?, updatedAt = ?
          WHERE jobId = ?
        `).run(now, now, jobId);
      } else if (job.status === 'submitting') {
        this.db.prepare(`
          UPDATE hosted_motion_jobs
          SET status = 'uncertain', error = 'Cancellation requested during submission; reconcile provider state.',
              updatedAt = ?
          WHERE jobId = ?
        `).run(now, jobId);
      } else if (job.status === 'submitted' || job.status === 'running' ||
          (job.status === 'uncertain' && job.providerJobId !== null)) {
        this.db.prepare(`
          UPDATE hosted_motion_jobs SET status = 'cancelling', updatedAt = ?
          WHERE jobId = ?
        `).run(now, jobId);
      } else if (job.status === 'uncertain') {
        return job;
      } else if (job.status !== 'cancelling') {
        throw new ConfigError(`Cannot cancel hosted job "${jobId}" from status "${job.status}".`);
      }
      return this.getById(jobId);
    });
  }

  expireQueued(jobId: string): HostedJob {
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (job.status !== 'queued' || Date.parse(job.dispatchDeadlineAt) > this.clock().getTime()) {
        throw new ConfigError(`Hosted job "${jobId}" has not exceeded its queue timeout.`);
      }
      const now = this.clock().toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = 'timed_out', error = 'Queue timeout expired before submission.',
            finishedAt = ?, updatedAt = ?
        WHERE jobId = ?
      `).run(now, now, jobId);
      return this.getById(jobId);
    });
  }

  confirmCancellation(jobId: string, outcome: 'cancelled' | 'timed_out', actualCostUsd?: number): HostedJob {
    const actualMicros = actualCostUsd === undefined ? null : costMicros(actualCostUsd);
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (!['cancelling', 'uncertain'].includes(job.status) || !job.providerJobId) {
        throw new ConfigError(`Hosted job "${jobId}" has no provider cancellation to confirm.`);
      }
      const now = this.clock().toISOString();
      this.db.prepare(`
        UPDATE hosted_motion_jobs
        SET status = ?, actualMicros = ?, finishedAt = ?, updatedAt = ?
        WHERE jobId = ?
      `).run(outcome, actualMicros, now, now, jobId);
      return this.getById(jobId);
    });
  }

  expiredJobs(): ExpiredHostedJob[] {
    const now = this.clock().toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM hosted_motion_jobs
      WHERE (status = 'queued' AND dispatchDeadlineAt <= ?)
         OR (status IN ('submitted', 'uncertain') AND workerDeadlineAt IS NULL AND queueDeadlineAt <= ?)
         OR (status IN ('running', 'uncertain') AND workerDeadlineAt <= ?)
      ORDER BY createdAt
    `).all(now, now, now) as SqliteRow[];
    return rows.map((row) => {
      const job = jobFromRow(row);
      return {
        job,
        timeout: job.status === 'queued'
          ? 'dispatch'
          : job.workerDeadlineAt === null ? 'queue' : 'worker',
      };
    });
  }

  recoverableJobs(): HostedJob[] {
    const terminal = ['succeeded', 'failed', 'cancelled', 'timed_out'];
    const placeholders = terminal.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT * FROM hosted_motion_jobs
      WHERE status NOT IN (${placeholders})
         OR (status = 'succeeded' AND (artifactPath IS NULL OR artifactSha256 IS NULL))
      ORDER BY createdAt
    `).all(...terminal) as SqliteRow[];
    return rows.map(jobFromRow);
  }

  queuedJobs(): HostedJob[] {
    const now = this.clock().toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM hosted_motion_jobs
      WHERE status = 'queued' AND nextAttemptAt <= ?
      ORDER BY createdAt
    `).all(now) as SqliteRow[];
    return rows.map(jobFromRow);
  }

  private updateFrom(jobId: string, allowed: readonly HostedJobStatus[], assignments: string, values: SQLInputValue[]): HostedJob {
    return this.inTransaction(() => {
      const job = this.getById(jobId);
      if (!allowed.includes(job.status)) {
        throw new ConfigError(`Cannot update hosted job "${jobId}" from status "${job.status}".`);
      }
      this.db.prepare(`UPDATE hosted_motion_jobs SET ${assignments} WHERE jobId = ?`).run(...values, jobId);
      return this.getById(jobId);
    });
  }

  private findRowByIdempotencyKey(idempotencyKey: string): SqliteRow | undefined {
    return this.db.prepare('SELECT * FROM hosted_motion_jobs WHERE idempotencyKey = ?')
      .get(idempotencyKey) as SqliteRow | undefined;
  }

  private inTransaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
