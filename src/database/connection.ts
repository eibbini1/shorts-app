import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export type LocalDatabase = DatabaseSync;
let connection: DatabaseSync | undefined;
let currentPath: string | undefined;
export function getDb(file = process.env.DATABASE_PATH ?? 'storage/shorts.sqlite'): DatabaseSync {
  if (connection && currentPath === file) return connection;
  connection?.close();
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  connection = new DatabaseSync(file);
  currentPath = file;
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, script TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', videoPath TEXT, metadataJson TEXT, readinessJson TEXT, manifestJson TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, type TEXT NOT NULL, videoId INTEGER REFERENCES videos(id), status TEXT NOT NULL DEFAULT 'running', error TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finishedAt TEXT);
    CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY, videoId INTEGER REFERENCES videos(id), observedAt TEXT NOT NULL, metricsJson TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hosted_spend_runs (runId TEXT PRIMARY KEY, capMicros INTEGER NOT NULL CHECK(capMicros > 0), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')), createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS hosted_spend_reservations (idempotencyKey TEXT PRIMARY KEY, runId TEXT NOT NULL REFERENCES hosted_spend_runs(runId), provider TEXT NOT NULL, maximumChargeMicros INTEGER NOT NULL CHECK(maximumChargeMicros > 0), actualMicros INTEGER, status TEXT NOT NULL CHECK(status IN ('reserved', 'uncertain', 'settled', 'overrun', 'released')), createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_hosted_spend_reservations_run ON hosted_spend_reservations(runId, status);
    CREATE TABLE IF NOT EXISTS hosted_motion_jobs (
      jobId TEXT PRIMARY KEY,
      idempotencyKey TEXT NOT NULL UNIQUE REFERENCES hosted_spend_reservations(idempotencyKey),
      runId TEXT NOT NULL REFERENCES hosted_spend_runs(runId),
      provider TEXT NOT NULL,
      engineId TEXT NOT NULL,
      requestJson TEXT NOT NULL,
      requestSha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'submitting', 'submitted', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled', 'timed_out', 'uncertain')),
      providerJobId TEXT,
      submitAttempts INTEGER NOT NULL DEFAULT 0 CHECK(submitAttempts >= 0),
      maxSubmitAttempts INTEGER NOT NULL CHECK(maxSubmitAttempts > 0),
      dispatchTimeoutMs INTEGER NOT NULL CHECK(dispatchTimeoutMs > 0),
      queueTimeoutMs INTEGER NOT NULL CHECK(queueTimeoutMs > 0),
      workerTimeoutMs INTEGER NOT NULL CHECK(workerTimeoutMs > 0),
      dispatchDeadlineAt TEXT NOT NULL,
      queueDeadlineAt TEXT,
      nextAttemptAt TEXT NOT NULL,
      workerDeadlineAt TEXT,
      artifactRef TEXT,
      artifactPath TEXT,
      artifactSha256 TEXT,
      actualMicros INTEGER,
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      finishedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hosted_motion_jobs_provider_status ON hosted_motion_jobs(provider, status);
    CREATE INDEX IF NOT EXISTS idx_hosted_motion_jobs_run_status ON hosted_motion_jobs(runId, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hosted_motion_jobs_provider_id ON hosted_motion_jobs(provider, providerJobId) WHERE providerJobId IS NOT NULL;
  `);
  return connection;
}
export function __resetDbForTests(): void { connection?.close(); connection = undefined; currentPath = undefined; }
