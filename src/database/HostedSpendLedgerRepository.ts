import type { SQLInputValue, StatementResultingChanges } from 'node:sqlite';
import { ConfigError } from '../shared/errors.js';
import type { LocalDatabase } from './connection.js';

const MICROS_PER_USD = 1_000_000;

export type SpendReservationStatus = 'reserved' | 'uncertain' | 'settled' | 'overrun' | 'released';
export type SpendRunStatus = 'active' | 'closed';

export interface SpendReservation {
  idempotencyKey: string;
  runId: string;
  provider: string;
  maximumChargeUsd: number;
  actualUsd: number | null;
  status: SpendReservationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SpendRun {
  runId: string;
  capUsd: number;
  reservedUsd: number;
  settledUsd: number;
  availableUsd: number;
  status: SpendRunStatus;
  createdAt: string;
}

export interface ReserveSpendInput {
  runId: string;
  idempotencyKey: string;
  provider: string;
  maximumChargeUsd: number;
  capUsd: number;
}

type SqliteRow = Record<string, SQLInputValue | StatementResultingChanges>;

function toMicros(value: number, label: string, allowZero = false): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new ConfigError(`${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} USD amount.`);
  }
  const micros = Math.round(value * MICROS_PER_USD);
  if (!Number.isSafeInteger(micros) || (!allowZero && micros === 0)) {
    throw new ConfigError(`${label} is outside the supported USD precision or range.`);
  }
  return micros;
}

function requiredString(row: SqliteRow, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function requiredNumber(row: SqliteRow, field: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function nullableNumber(row: SqliteRow, field: string): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'number') throw new Error(`Invalid SQLite value for ${field}.`);
  return value;
}

function reservationFromRow(row: SqliteRow): SpendReservation {
  const actualMicros = nullableNumber(row, 'actualMicros');
  return {
    idempotencyKey: requiredString(row, 'idempotencyKey'),
    runId: requiredString(row, 'runId'),
    provider: requiredString(row, 'provider'),
    maximumChargeUsd: requiredNumber(row, 'maximumChargeMicros') / MICROS_PER_USD,
    actualUsd: actualMicros === null ? null : actualMicros / MICROS_PER_USD,
    status: requiredString(row, 'status') as SpendReservationStatus,
    createdAt: requiredString(row, 'createdAt'),
    updatedAt: requiredString(row, 'updatedAt'),
  };
}

export class HostedSpendLedgerRepository {
  constructor(private readonly db: LocalDatabase) {}

  reserve(input: ReserveSpendInput, options: { singleUse?: boolean } = {}): SpendReservation {
    this.validateIdentity(input.runId, 'runId');
    this.validateIdentity(input.idempotencyKey, 'idempotencyKey');
    this.validateIdentity(input.provider, 'provider');
    const capMicros = toMicros(input.capUsd, 'capUsd');
    const maximumChargeMicros = toMicros(input.maximumChargeUsd, 'maximumChargeUsd');

    return this.inTransaction(() => {
      const existing = this.getReservationRow(input.idempotencyKey);
      if (existing) {
        if (options.singleUse) throw new ConfigError('This shot approval has already been used.');
        const reservation = reservationFromRow(existing);
        if (
          reservation.runId !== input.runId ||
          reservation.provider !== input.provider ||
          toMicros(reservation.maximumChargeUsd, 'maximumChargeUsd') !== maximumChargeMicros
        ) {
          throw new ConfigError(`Idempotency key "${input.idempotencyKey}" was already used with different spend parameters.`);
        }
        if (this.getRun(input.runId).capUsd !== capMicros / MICROS_PER_USD) {
          throw new ConfigError(`Idempotency key "${input.idempotencyKey}" was already used with a different run cap.`);
        }
        return reservation;
      }

      const runRow = this.getRunRow(input.runId);
      if (!runRow) {
        this.db.prepare('INSERT INTO hosted_spend_runs(runId, capMicros) VALUES (?, ?)').run(input.runId, capMicros);
      } else {
        const runCapMicros = requiredNumber(runRow, 'capMicros');
        if (runCapMicros !== capMicros) {
          throw new ConfigError(`Run "${input.runId}" already has a different spend cap.`);
        }
        if (requiredString(runRow, 'status') !== 'active') {
          throw new ConfigError(`Run "${input.runId}" is closed and cannot reserve more spend.`);
        }
      }

      const totals = this.getTotals(input.runId);
      if (totals.reservedMicros + totals.settledMicros + maximumChargeMicros > capMicros) {
        throw new ConfigError(`Reservation exceeds the remaining spend cap for run "${input.runId}".`, {
          runId: input.runId,
          capUsd: input.capUsd,
          reservedUsd: totals.reservedMicros / MICROS_PER_USD,
          settledUsd: totals.settledMicros / MICROS_PER_USD,
          requestedMaximumChargeUsd: input.maximumChargeUsd,
        });
      }

      this.db.prepare(`
        INSERT INTO hosted_spend_reservations(idempotencyKey, runId, provider, maximumChargeMicros, status)
        VALUES (?, ?, ?, ?, 'reserved')
      `).run(input.idempotencyKey, input.runId, input.provider, maximumChargeMicros);
      const row = this.getReservationRow(input.idempotencyKey);
      if (!row) throw new Error(`Spend reservation "${input.idempotencyKey}" was not persisted.`);
      return reservationFromRow(row);
    });
  }

  markUncertain(idempotencyKey: string): SpendReservation {
    this.validateIdentity(idempotencyKey, 'idempotencyKey');
    return this.inTransaction(() => {
      const reservation = this.getReservation(idempotencyKey);
      if (reservation.status === 'uncertain') return reservation;
      if (reservation.status !== 'reserved') {
        throw new ConfigError(`Cannot mark spend reservation "${idempotencyKey}" uncertain from status "${reservation.status}".`);
      }
      this.db.prepare(`
        UPDATE hosted_spend_reservations
        SET status = 'uncertain', updatedAt = CURRENT_TIMESTAMP
        WHERE idempotencyKey = ?
      `).run(idempotencyKey);
      return this.getReservation(idempotencyKey);
    });
  }

  settle(idempotencyKey: string, actualUsd: number): SpendReservation {
    this.validateIdentity(idempotencyKey, 'idempotencyKey');
    const actualMicros = toMicros(actualUsd, 'actualUsd', true);
    return this.inTransaction(() => {
      const reservation = this.getReservation(idempotencyKey);
      if (reservation.status === 'settled' || reservation.status === 'overrun') {
        if (reservation.actualUsd !== actualMicros / MICROS_PER_USD) {
          throw new ConfigError(`Spend reservation "${idempotencyKey}" was already settled with a different amount.`);
        }
        return reservation;
      }
      if (reservation.status !== 'reserved' && reservation.status !== 'uncertain') {
        throw new ConfigError(`Cannot settle spend reservation "${idempotencyKey}" from status "${reservation.status}".`);
      }

      const status = actualMicros > toMicros(reservation.maximumChargeUsd, 'maximumChargeUsd')
        ? 'overrun'
        : 'settled';
      this.db.prepare(`
        UPDATE hosted_spend_reservations
        SET actualMicros = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE idempotencyKey = ?
      `).run(actualMicros, status, idempotencyKey);
      return this.getReservation(idempotencyKey);
    });
  }

  release(idempotencyKey: string): SpendReservation {
    this.validateIdentity(idempotencyKey, 'idempotencyKey');
    return this.inTransaction(() => {
      const reservation = this.getReservation(idempotencyKey);
      if (reservation.status === 'released') return reservation;
      if (reservation.status !== 'reserved') {
        throw new ConfigError(`Cannot release spend reservation "${idempotencyKey}" from status "${reservation.status}".`);
      }
      this.db.prepare(`
        UPDATE hosted_spend_reservations
        SET status = 'released', updatedAt = CURRENT_TIMESTAMP
        WHERE idempotencyKey = ?
      `).run(idempotencyKey);
      return this.getReservation(idempotencyKey);
    });
  }

  closeRun(runId: string): SpendRun {
    this.validateIdentity(runId, 'runId');
    return this.inTransaction(() => {
      const runRow = this.getRunRow(runId);
      if (!runRow) throw new ConfigError(`Spend run "${runId}" does not exist.`);
      const pending = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM hosted_spend_reservations
        WHERE runId = ? AND status IN ('reserved', 'uncertain')
      `).get(runId);
      if (!pending || requiredNumber(pending, 'count') > 0) {
        throw new ConfigError(`Spend run "${runId}" still has unresolved reservations.`);
      }
      this.db.prepare("UPDATE hosted_spend_runs SET status = 'closed' WHERE runId = ?").run(runId);
      return this.getRun(runId);
    });
  }

  getReservation(idempotencyKey: string): SpendReservation {
    const row = this.getReservationRow(idempotencyKey);
    if (!row) throw new ConfigError(`Spend reservation "${idempotencyKey}" does not exist.`);
    return reservationFromRow(row);
  }

  getRun(runId: string): SpendRun {
    const row = this.getRunRow(runId);
    if (!row) throw new ConfigError(`Spend run "${runId}" does not exist.`);
    const totals = this.getTotals(runId);
    const capMicros = requiredNumber(row, 'capMicros');
    return {
      runId: requiredString(row, 'runId'),
      capUsd: capMicros / MICROS_PER_USD,
      reservedUsd: totals.reservedMicros / MICROS_PER_USD,
      settledUsd: totals.settledMicros / MICROS_PER_USD,
      availableUsd: (capMicros - totals.reservedMicros - totals.settledMicros) / MICROS_PER_USD,
      status: requiredString(row, 'status') as SpendRunStatus,
      createdAt: requiredString(row, 'createdAt'),
    };
  }

  private validateIdentity(value: string, label: string): void {
    if (!value.trim()) throw new ConfigError(`${label} must not be empty.`);
  }

  private getReservationRow(idempotencyKey: string): SqliteRow | undefined {
    return this.db.prepare('SELECT * FROM hosted_spend_reservations WHERE idempotencyKey = ?')
      .get(idempotencyKey) as SqliteRow | undefined;
  }

  private getRunRow(runId: string): SqliteRow | undefined {
    return this.db.prepare('SELECT * FROM hosted_spend_runs WHERE runId = ?').get(runId) as SqliteRow | undefined;
  }

  private getTotals(runId: string): { reservedMicros: number; settledMicros: number } {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('reserved', 'uncertain') THEN maximumChargeMicros ELSE 0 END), 0) AS reservedMicros,
        COALESCE(SUM(CASE WHEN status IN ('settled', 'overrun') THEN actualMicros ELSE 0 END), 0) AS settledMicros
      FROM hosted_spend_reservations
      WHERE runId = ?
    `).get(runId);
    if (!row) throw new Error(`Spend totals for run "${runId}" could not be read.`);
    return {
      reservedMicros: requiredNumber(row, 'reservedMicros'),
      settledMicros: requiredNumber(row, 'settledMicros'),
    };
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
