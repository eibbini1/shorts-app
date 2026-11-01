/**
 * logger.ts — lightweight console logger
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) =>
    process.env.LOG_LEVEL === 'debug' && console.debug(`[${ts()}] DEBUG ${msg}`, ctx ?? ''),
  info: (msg: string, ctx?: Record<string, unknown>) =>
    console.info(`[${ts()}] INFO  ${msg}`, ctx ? JSON.stringify(ctx) : ''),
  warn: (msg: string, ctx?: Record<string, unknown>) =>
    console.warn(`[${ts()}] WARN  ${msg}`, ctx ? JSON.stringify(ctx) : ''),
  error: (msg: string, ctx?: Record<string, unknown>) =>
    console.error(`[${ts()}] ERROR ${msg}`, ctx ? JSON.stringify(ctx) : ''),
};
