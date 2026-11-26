import { describe, expect, it } from 'vitest';
import { ClipFairScheduler } from '../ClipFairScheduler.js';

describe('ClipFairScheduler', () => {
  it('prevents a bulk-batch tenant from starving a concurrent single-video tenant', () => {
    const scheduler = new ClipFairScheduler<string>({
      maxGlobalInFlight: 6,
      maxTenantInFlight: 4,
    });

    // Heavy tenant queues 60 clips (10 videos) in batch lane.
    for (let i = 0; i < 60; i += 1) {
      scheduler.enqueue({
        clipId: `heavy-${i}`,
        tenantId: 'tenant-heavy',
        lane: 'batch',
        estimatedGpuSeconds: 30,
        payload: `heavy-${i}`,
      });
    }

    // Light tenant queues 6 clips (1 video) in batch lane after heavy tenant.
    for (let i = 0; i < 6; i += 1) {
      scheduler.enqueue({
        clipId: `light-${i}`,
        tenantId: 'tenant-light',
        lane: 'batch',
        estimatedGpuSeconds: 30,
        payload: `light-${i}`,
      });
    }

    const claimedTenants: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const next = scheduler.claimNext();
      expect(next).not.toBeNull();
      claimedTenants.push(next!.tenantId);
    }

    // Fair DRF interleaves both tenants 3:3 across the 6 global GPU slots instead of 6:0.
    expect(claimedTenants.filter((t) => t === 'tenant-light')).toHaveLength(3);
    expect(claimedTenants.filter((t) => t === 'tenant-heavy')).toHaveLength(3);
    expect(scheduler.claimNext()).toBeNull(); // global cap of 6 reached
  });

  it('prioritizes interactive Studio retakes over unattended background batch clips', () => {
    const scheduler = new ClipFairScheduler<string>({
      maxGlobalInFlight: 2,
      maxTenantInFlight: 2,
    });

    scheduler.enqueue({
      clipId: 'batch-1',
      tenantId: 'owner',
      lane: 'batch',
      estimatedGpuSeconds: 40,
      payload: 'batch-1',
    });
    scheduler.enqueue({
      clipId: 'retake-1',
      tenantId: 'creator-a',
      lane: 'interactive',
      estimatedGpuSeconds: 40,
      payload: 'retake-1',
    });

    const first = scheduler.claimNext();
    const second = scheduler.claimNext();
    expect(first?.clipId).toBe('retake-1');
    expect(second?.clipId).toBe('batch-1');
  });

  it('reconciles actual GPU seconds on completion and respects per-tenant concurrency caps', () => {
    const scheduler = new ClipFairScheduler<string>({
      maxGlobalInFlight: 4,
      maxTenantInFlight: 2,
      tenantWeights: { pro: 2, free: 1 },
    });

    for (let i = 0; i < 3; i += 1) {
      scheduler.enqueue({
        clipId: `pro-${i}`,
        tenantId: 'pro',
        lane: 'batch',
        estimatedGpuSeconds: 40,
        payload: `pro-${i}`,
      });
    }

    const c1 = scheduler.claimNext();
    const c2 = scheduler.claimNext();
    expect(c1?.clipId).toBe('pro-0');
    expect(c2?.clipId).toBe('pro-1');
    // Third claim blocked by maxTenantInFlight = 2 even though global cap = 4.
    expect(scheduler.claimNext()).toBeNull();

    // Actual run was faster (25s instead of 40s estimate); slot frees and usage reconciles.
    scheduler.complete('pro-0', 25);
    expect(scheduler.snapshot().tenantGpuSecondsUsed.pro).toBe(65);

    const c3 = scheduler.claimNext();
    expect(c3?.clipId).toBe('pro-2');
  });
});
