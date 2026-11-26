import { ConfigError } from '../../shared/errors.js';

export type SchedulerLane = 'interactive' | 'batch';

export interface QueuedClipTask<TPayload = unknown> {
  clipId: string;
  tenantId: string;
  lane: SchedulerLane;
  estimatedGpuSeconds: number;
  enqueuedAtMs?: number;
  payload: TPayload;
}

export interface ClipFairSchedulerOptions {
  maxGlobalInFlight: number;
  maxTenantInFlight: number;
  tenantWeights?: Readonly<Record<string, number>>;
}

export interface SchedulerSnapshot {
  globalInFlight: number;
  queuedCount: number;
  interactiveQueued: number;
  batchQueued: number;
  tenantInFlight: Record<string, number>;
  tenantGpuSecondsUsed: Record<string, number>;
}

interface InternalTask<TPayload> {
  clipId: string;
  tenantId: string;
  lane: SchedulerLane;
  estimatedGpuSeconds: number;
  enqueuedAtMs: number;
  sequence: number;
  payload: TPayload;
}

/**
 * Multi-tenant clip-level Deficit Round Robin (DRF) scheduler with Interactive vs Batch priority lanes.
 *
 * Guarantees that:
 * 1. Interactive Studio previews/retakes are prioritized over unattended background batches.
 * 2. Within each lane, the eligible tenant with the lowest weighted GPU-second usage
 *    (`gpuSecondsUsed / weight`) is scheduled next — preventing bulk-batch starvation.
 * 3. Hard global and per-tenant in-flight GPU concurrency caps are always respected.
 */
export class ClipFairScheduler<TPayload = unknown> {
  private readonly maxGlobalInFlight: number;
  private readonly maxTenantInFlight: number;
  private readonly tenantWeights: Map<string, number>;
  private readonly queues = new Map<string, InternalTask<TPayload>[]>();
  private readonly inFlight = new Map<string, { tenantId: string; estimatedGpuSeconds: number }>();
  private readonly tenantInFlight = new Map<string, number>();
  private readonly tenantGpuSeconds = new Map<string, number>();
  private sequence = 0;

  constructor(options: ClipFairSchedulerOptions) {
    if (!Number.isSafeInteger(options.maxGlobalInFlight) || options.maxGlobalInFlight <= 0) {
      throw new ConfigError('maxGlobalInFlight must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(options.maxTenantInFlight) || options.maxTenantInFlight <= 0) {
      throw new ConfigError('maxTenantInFlight must be a positive safe integer.');
    }
    this.maxGlobalInFlight = options.maxGlobalInFlight;
    this.maxTenantInFlight = options.maxTenantInFlight;
    this.tenantWeights = new Map<string, number>();
    for (const [tenant, weight] of Object.entries(options.tenantWeights ?? {})) {
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new ConfigError(`Invalid weight for tenant "${tenant}".`);
      }
      this.tenantWeights.set(tenant, weight);
    }
  }

  setTenantWeight(tenantId: string, weight: number): void {
    if (!tenantId.trim()) throw new ConfigError('tenantId must not be empty.');
    if (!Number.isFinite(weight) || weight <= 0) throw new ConfigError('weight must be positive.');
    this.tenantWeights.set(tenantId, weight);
  }

  enqueue(task: QueuedClipTask<TPayload>): void {
    if (!task.clipId.trim() || !task.tenantId.trim()) {
      throw new ConfigError('Queued clip requires non-empty clipId and tenantId.');
    }
    if (!Number.isFinite(task.estimatedGpuSeconds) || task.estimatedGpuSeconds <= 0) {
      throw new ConfigError('estimatedGpuSeconds must be a positive finite number.');
    }
    const queue = this.queues.get(task.tenantId) ?? [];
    queue.push({
      clipId: task.clipId,
      tenantId: task.tenantId,
      lane: task.lane,
      estimatedGpuSeconds: task.estimatedGpuSeconds,
      enqueuedAtMs: task.enqueuedAtMs ?? Date.now(),
      sequence: this.sequence++,
      payload: task.payload,
    });
    this.queues.set(task.tenantId, queue);
    if (!this.tenantGpuSeconds.has(task.tenantId)) {
      this.tenantGpuSeconds.set(task.tenantId, 0);
    }
  }

  /**
   * Claim the next fair-share clip task if global and per-tenant concurrency limits allow.
   */
  claimNext(): QueuedClipTask<TPayload> | null {
    if (this.inFlight.size >= this.maxGlobalInFlight) {
      return null;
    }

    for (const lane of ['interactive', 'batch'] as const) {
      let bestTenant: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestSeq = Number.POSITIVE_INFINITY;

      for (const [tenantId, queue] of this.queues.entries()) {
        const active = this.tenantInFlight.get(tenantId) ?? 0;
        if (active >= this.maxTenantInFlight) continue;
        const nextForLane = queue.find((item) => item.lane === lane);
        if (!nextForLane) continue;
        const weight = this.tenantWeights.get(tenantId) ?? 1;
        const virtualUsage = (this.tenantGpuSeconds.get(tenantId) ?? 0) / weight;
        if (
          virtualUsage < bestScore ||
          (virtualUsage === bestScore && nextForLane.sequence < bestSeq)
        ) {
          bestTenant = tenantId;
          bestScore = virtualUsage;
          bestSeq = nextForLane.sequence;
        }
      }

      if (bestTenant !== null) {
        const queue = this.queues.get(bestTenant)!;
        const idx = queue.findIndex((item) => item.lane === lane);
        const [picked] = queue.splice(idx, 1);
        if (queue.length === 0) {
          this.queues.delete(bestTenant);
        }
        const task = picked!;
        this.inFlight.set(task.clipId, {
          tenantId: task.tenantId,
          estimatedGpuSeconds: task.estimatedGpuSeconds,
        });
        this.tenantInFlight.set(task.tenantId, (this.tenantInFlight.get(task.tenantId) ?? 0) + 1);
        // Optimistically charge estimated GPU seconds at claim time so concurrent claims stay fair.
        this.tenantGpuSeconds.set(
          task.tenantId,
          (this.tenantGpuSeconds.get(task.tenantId) ?? 0) + task.estimatedGpuSeconds,
        );
        return {
          clipId: task.clipId,
          tenantId: task.tenantId,
          lane: task.lane,
          estimatedGpuSeconds: task.estimatedGpuSeconds,
          enqueuedAtMs: task.enqueuedAtMs,
          payload: task.payload,
        };
      }
    }
    return null;
  }

  /**
   * Release an in-flight slot and reconcile actual GPU seconds against the claim-time estimate.
   */
  complete(clipId: string, actualGpuSeconds?: number): void {
    const active = this.inFlight.get(clipId);
    if (!active) return;
    this.inFlight.delete(clipId);
    const nextCount = Math.max(0, (this.tenantInFlight.get(active.tenantId) ?? 1) - 1);
    if (nextCount === 0) {
      this.tenantInFlight.delete(active.tenantId);
    } else {
      this.tenantInFlight.set(active.tenantId, nextCount);
    }
    if (actualGpuSeconds !== undefined && Number.isFinite(actualGpuSeconds) && actualGpuSeconds >= 0) {
      const current = this.tenantGpuSeconds.get(active.tenantId) ?? 0;
      const adjusted = Math.max(0, current - active.estimatedGpuSeconds + actualGpuSeconds);
      this.tenantGpuSeconds.set(active.tenantId, adjusted);
    }
  }

  snapshot(): SchedulerSnapshot {
    let queuedCount = 0;
    let interactiveQueued = 0;
    let batchQueued = 0;
    for (const queue of this.queues.values()) {
      queuedCount += queue.length;
      for (const item of queue) {
        if (item.lane === 'interactive') interactiveQueued += 1;
        else batchQueued += 1;
      }
    }
    return {
      globalInFlight: this.inFlight.size,
      queuedCount,
      interactiveQueued,
      batchQueued,
      tenantInFlight: Object.fromEntries(this.tenantInFlight.entries()),
      tenantGpuSecondsUsed: Object.fromEntries(this.tenantGpuSeconds.entries()),
    };
  }
}
