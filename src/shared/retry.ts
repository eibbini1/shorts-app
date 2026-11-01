/**
 * retry.ts — simple exponential-backoff retry helper
 */

import { logger } from './logger.js';

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  factor?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, delayMs = 500, factor = 2, label = 'operation' } = opts;
  let lastErr: unknown;
  let delay = delayMs;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
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
  if (!(err instanceof Error)) return false;
  return /rate.?limit|429|503|ECONNRESET|ETIMEDOUT|socket hang up/i.test(err.message);
}
