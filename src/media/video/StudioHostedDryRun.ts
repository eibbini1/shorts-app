import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb, type LocalDatabase } from '../../database/connection.js';
import { canonicalJson, HostedJobsRepository } from '../../database/HostedJobsRepository.js';
import { HostedSpendLedgerRepository } from '../../database/HostedSpendLedgerRepository.js';
import { HostedMotionDispatcher, type HostedMotionAdapter } from './HostedMotionDispatcher.js';
import type { MotionRequest } from './MotionEngine.js';

export interface StudioHostedShot {
  sessionId: string;
  shot: number;
  scenarioSha256: string;
  model: 'ltx-2.5' | 'wan-2.2';
  capUsd: number;
  request: MotionRequest;
}

// These values exercise budget arithmetic. They are not provider price quotes.
const estimateUsd = 0.25;
const adapter: HostedMotionAdapter = {
  provider: 'local-simulation',
  supportsIdempotency: true,
  prepareRequest: async (request) => request,
  submit: async (_request, { jobId }) => ({ providerJobId: jobId }),
  getStatus: async (id) => ({ status: 'succeeded', artifactRef: 'simulation:' + id, actualCostUsd: 0 }),
  cancel: async () => ({ confirmed: true, actualCostUsd: 0 }),
  getArtifactUrl: async () => { throw new Error('A simulation produces no video artifact.'); },
};

export class StudioHostedDryRun {
  // Restart invalidates outstanding quotes. Consumed nonces stay consumed in the ledger.
  private readonly signingKey = randomBytes(32);
  private readonly dispatcher: HostedMotionDispatcher;
  constructor(db: LocalDatabase) {
    this.dispatcher = new HostedMotionDispatcher(
      new HostedJobsRepository(db), new HostedSpendLedgerRepository(db), [adapter], 5_000);
  }

  private signature(shot: StudioHostedShot, nonce: string, expires: number) {
    return createHmac('sha256', this.signingKey)
      .update(canonicalJson({ provider: adapter.provider, estimateUsd, shot, nonce, expires }))
      .digest();
  }

  quote(shot: StudioHostedShot) {
    if (!Number.isFinite(shot.capUsd) || shot.capUsd < estimateUsd || shot.capUsd > 100) {
      throw new Error('Choose a simulation cap of $0.25 to $100.');
    }
    const nonce = randomUUID();
    const expires = Date.now() + 10 * 60_000;
    const signature = this.signature(shot, nonce, expires).toString('hex');
    return { simulation: true, provider: adapter.provider, model: shot.model, shot: shot.shot,
      referenceSha256: shot.request.conditioning[0]?.sha256, settings: shot.request, estimateUsd,
      capUsd: shot.capUsd, expires, approval: [nonce, expires, signature].join('.') };
  }

  async confirm(shot: StudioHostedShot, approval: unknown) {
    const match = typeof approval === 'string' && /^([a-f0-9-]{36})\.(\d{13})\.([a-f0-9]{64})$/.exec(approval);
    if (!match || Number(match[2]) <= Date.now() ||
        !timingSafeEqual(Buffer.from(match[3]!, 'hex'), this.signature(shot, match[1]!, Number(match[2])))) {
      throw new Error('Quote expired or shot settings changed. Request a new simulation quote.');
    }
    const job = this.dispatcher.enqueue({ runId: 'simulation-' + shot.sessionId, idempotencyKey: match[1]!,
      provider: adapter.provider, engineId: shot.model, request: shot.request, maximumChargeUsd: estimateUsd,
      capUsd: shot.capUsd, queueTimeoutMs: 30_000, workerTimeoutMs: 30_000 }, { singleUse: true });
    const submitted = await this.dispatcher.dispatch(job.jobId, { controller: 1, provider: 1 });
    if (submitted.status !== 'submitted') {
      await this.dispatcher.cancel(job.jobId);
      throw new Error('Simulation could not start. Request a new quote and try again.');
    }
    const completed = await this.dispatcher.poll(job.jobId);
    return { simulation: true, status: completed.status, jobId: completed.jobId,
      actualUsd: completed.actualCostUsd, provider: adapter.provider };
  }
}

export function openStudioHostedDryRun(file: string) {
  return new StudioHostedDryRun(getDb(file));
}
