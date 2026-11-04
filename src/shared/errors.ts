/**
 * errors.ts
 * =========
 * Shared error classes for the Abdul Across America pipeline.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RenderError extends AppError {
  constructor(message: string, context?: unknown) {
    super(message, 'RENDER_ERROR', context);
  }
}

export class ProviderError extends AppError {
  public readonly provider?: string;
  public readonly retryable: boolean;
  public readonly status?: number;
  constructor(providerOrMessage: string, messageOrRetry?: string | boolean | Record<string, unknown>, cause?: unknown, status?: number) {
    const message = typeof messageOrRetry === 'string' ? providerOrMessage + ': ' + messageOrRetry : providerOrMessage;
    super(message, 'PROVIDER_ERROR', typeof messageOrRetry === 'object' ? messageOrRetry : cause);
    this.provider = typeof messageOrRetry === 'string' ? providerOrMessage : undefined;
    this.status = status;
    this.retryable = typeof messageOrRetry === 'boolean' ? messageOrRetry : status !== undefined ? status === 408 || status === 429 || status >= 500 : cause instanceof Error && /timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(cause.message);
    if (cause !== undefined) this.cause = cause;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: unknown) {
    super(message, 'CONFIG_ERROR', context);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
