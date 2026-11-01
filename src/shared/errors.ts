/**
 * errors.ts
 * =========
 * Shared error classes for the Abdul Across America pipeline.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RenderError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RENDER_ERROR', context);
  }
}

export class ProviderError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PROVIDER_ERROR', context);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
