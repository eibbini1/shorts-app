import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { __resetDbForTests, getDb } from '../../../database/connection.js';
import { HostedJobsRepository } from '../../../database/HostedJobsRepository.js';
import { HostedSpendLedgerRepository } from '../../../database/HostedSpendLedgerRepository.js';
import { transferHostedArtifact } from '../HostedArtifactTransfer.js';
import type { MotionRequest } from '../MotionEngine.js';
import type { LocalDatabase } from '../../../database/connection.js';

const request: MotionRequest = {
  prompt: 'A cyclist rides beside a lake.',
  mode: 't2v',
  width: 1280,
  height: 720,
  fps: 24,
  frameCount: 120,
  audio: 'silent',
  conditioning: [],
};

describe('transferHostedArtifact', () => {
  let db: LocalDatabase;
  let jobs: HostedJobsRepository;
  let storageRoot: string;

  beforeEach(async () => {
    __resetDbForTests();
    db = getDb(':memory:');
    jobs = new HostedJobsRepository(db);
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'hosted-artifacts-'));
  });

  afterEach(async () => {
    __resetDbForTests();
    await rm(storageRoot, { recursive: true, force: true });
  });

  function succeededJob() {
    const idempotencyKey = 'artifact-job';
    new HostedSpendLedgerRepository(db).reserve({
      runId: 'pilot',
      idempotencyKey,
      provider: 'provider-a',
      maximumChargeUsd: 0.5,
      capUsd: 1,
    });
    const job = jobs.enqueue({
      idempotencyKey,
      runId: 'pilot',
      provider: 'provider-a',
      engineId: 'engine-a',
      request,
      queueTimeoutMs: 60_000,
      workerTimeoutMs: 120_000,
    });
    jobs.claimForSubmission(job.jobId, { controller: 1, provider: 1 });
    jobs.markSubmitted(job.jobId, 'remote-job');
    jobs.markRunning(job.jobId);
    return jobs.markSucceeded(job.jobId, 'opaque-object-key', 0.2);
  }

  it('refreshes an expired URL once, downloads privately, and records the checksum without storing the URL', async () => {
    const job = succeededJob();
    const resolver = {
      getArtifactUrl: vi.fn()
        .mockResolvedValueOnce('https://storage.example/clip?signature=expired')
        .mockResolvedValueOnce('https://storage.example/clip?signature=fresh'),
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '4' },
      }));

    const artifact = await transferHostedArtifact(job.jobId, jobs, resolver, {
      storageRoot,
      allowedHosts: ['storage.example'],
      maxBytes: 16,
      timeoutMs: 1_000,
      fetcher,
    });

    expect(resolver.getArtifactUrl).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await readFile(artifact.path)).toEqual(Buffer.from([0, 1, 2, 3]));
    expect((await stat(artifact.path)).mode & 0o777).toBe(0o600);
    expect(jobs.getById(job.jobId)).toMatchObject({
      artifactRef: 'opaque-object-key',
      artifactPath: artifact.path,
      artifactSha256: artifact.sha256,
    });
    expect(JSON.stringify(jobs.getById(job.jobId))).not.toContain('signature=');

    await expect(transferHostedArtifact(job.jobId, jobs, resolver, {
      storageRoot,
      allowedHosts: ['storage.example'],
      maxBytes: 16,
      timeoutMs: 1_000,
      fetcher,
    })).resolves.toMatchObject({ sha256: artifact.sha256, bytes: 4 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects non-HTTPS and non-allowlisted artifact hosts before fetching', async () => {
    const job = succeededJob();
    const fetcher = vi.fn<typeof fetch>();
    const resolver = { getArtifactUrl: vi.fn().mockResolvedValue('http://127.0.0.1/private') };

    await expect(transferHostedArtifact(job.jobId, jobs, resolver, {
      storageRoot,
      allowedHosts: ['storage.example'],
      maxBytes: 16,
      timeoutMs: 1_000,
      fetcher,
    })).rejects.toThrow('HTTPS host allowlist');
    expect(fetcher).not.toHaveBeenCalled();

    resolver.getArtifactUrl.mockResolvedValue('https://attacker.example/file');
    await expect(transferHostedArtifact(job.jobId, jobs, resolver, {
      storageRoot,
      allowedHosts: ['storage.example'],
      maxBytes: 16,
      timeoutMs: 1_000,
      fetcher,
    })).rejects.toThrow('HTTPS host allowlist');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces the artifact size limit before and during download', async () => {
    const job = succeededJob();
    const resolver = { getArtifactUrl: vi.fn().mockResolvedValue('https://storage.example/clip') };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new Uint8Array([0, 1, 2, 3]),
      { status: 200, headers: { 'content-length': '4' } },
    ));

    await expect(transferHostedArtifact(job.jobId, jobs, resolver, {
      storageRoot,
      allowedHosts: ['storage.example'],
      maxBytes: 3,
      timeoutMs: 1_000,
      fetcher,
    })).rejects.toThrow('transfer limit');
    expect(jobs.getById(job.jobId).artifactPath).toBeNull();
  });
});
