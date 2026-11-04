/**
 * retry.ts — simple exponential-backoff retry helper
 */

import { ProviderError } from './errors.js';
import { logger } from './logger.js';

export interface RetryOptions {
  attempts?: number;
  maxAttempts?: number;
  shouldRetry?: (error: unknown) => boolean;
  isRetryable?: (error: unknown) => boolean;
  delayMs?: number;
  factor?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { delayMs = 500, factor = 2, label = 'operation' } = opts;
  const attempts = opts.attempts ?? opts.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || !Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(factor) || factor < 1) throw new Error('Invalid retry options');
  const shouldRetry = opts.shouldRetry ?? opts.isRetryable;
  let lastErr: unknown;
  let delay = delayMs;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (shouldRetry && !shouldRetry(err)) throw err;
      if (i < attempts) {
        logger.warn(`${label} failed (attempt ${i}/${attempts}), retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= factor;
      }
    }
  }
  throw lastErr;
}

export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof ProviderError) return err.retryable;
  if (!(err instanceof Error)) return false;
  return /rate.?limit|429|503|ECONNRESET|ETIMEDOUT|socket hang up/i.test(err.message);
}
