import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { ConfigError, RenderError } from '../../shared/errors.js';
import type { HostedJob, HostedJobsRepository } from '../../database/HostedJobsRepository.js';

export interface HostedArtifactUrlResolver {
  getArtifactUrl(providerJobId: string, artifactRef: string): Promise<string>;
}

export interface HostedArtifactTransferOptions {
  storageRoot: string;
  allowedHosts: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

export interface TransferredHostedArtifact {
  path: string;
  sha256: string;
  bytes: number;
}

const EXPIRED_URL_STATUSES = new Set([401, 403]);
const JOB_ID_PATTERN = /^[a-f0-9-]{36}$/i;

function validateOptions(options: HostedArtifactTransferOptions): void {
  if (!options.storageRoot.trim()) throw new ConfigError('Hosted artifact storageRoot must not be empty.');
  if (options.allowedHosts.length === 0 || options.allowedHosts.some((host) => !host.trim())) {
    throw new ConfigError('Hosted artifact transfer requires an explicit host allowlist.');
  }
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new ConfigError('Hosted artifact maxBytes must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new ConfigError('Hosted artifact timeoutMs must be a positive safe integer.');
  }
}

function validatedUrl(value: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('The provider returned an invalid artifact URL.');
  }
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed.has(url.hostname.toLowerCase())
  ) {
    throw new ConfigError('The provider artifact URL is outside the configured HTTPS host allowlist.');
  }
  return url;
}

async function* bodyChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let finished = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        finished = true;
        return;
      }
      yield result.value;
    }
  } finally {
    if (!finished) await reader.cancel();
    reader.releaseLock();
  }
}

async function download(
  url: URL,
  job: HostedJob,
  options: HostedArtifactTransferOptions,
): Promise<TransferredHostedArtifact | 'expired'> {
  const fetcher = options.fetcher ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs);
  const response = await fetcher(url, {
    redirect: 'error',
    signal,
  });
  if (EXPIRED_URL_STATUSES.has(response.status)) {
    await response.body?.cancel();
    return 'expired';
  }
  if (!response.ok) throw new RenderError(`Hosted artifact download failed with HTTP ${response.status}.`);
  if (!response.body) throw new RenderError('Hosted artifact response had no body.');

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > options.maxBytes) {
    throw new RenderError(`Hosted artifact exceeds the ${options.maxBytes}-byte transfer limit.`);
  }

  const jobDirectory = path.resolve(options.storageRoot, job.jobId);
  const finalPath = path.join(jobDirectory, 'artifact.mp4');
  const temporaryPath = path.join(jobDirectory, `${randomUUID()}.part`);
  await mkdir(jobDirectory, { recursive: true, mode: 0o700 });
  await chmod(jobDirectory, 0o700);
  const digest = createHash('sha256');
  let bytes = 0;
  let completed = false;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > options.maxBytes) {
        callback(new RenderError(`Hosted artifact exceeds the ${options.maxBytes}-byte transfer limit.`));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.from(bodyChunks(response.body)),
      meter,
      createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    await rename(temporaryPath, finalPath);
    completed = true;
    return { path: finalPath, sha256: digest.digest('hex'), bytes };
  } finally {
    if (!completed) await rm(temporaryPath, { force: true });
  }
}

async function hashExistingArtifact(filePath: string): Promise<{ sha256: string; bytes: number } | null> {
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of createReadStream(filePath)) {
      bytes += chunk.length;
      digest.update(chunk);
    }
    return { sha256: digest.digest('hex'), bytes };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function transferHostedArtifact(
  jobId: string,
  jobs: HostedJobsRepository,
  resolver: HostedArtifactUrlResolver,
  options: HostedArtifactTransferOptions,
): Promise<TransferredHostedArtifact> {
  validateOptions(options);
  if (!JOB_ID_PATTERN.test(jobId)) throw new ConfigError('Hosted job id is invalid.');
  const job = jobs.getById(jobId);
  if (job.status !== 'succeeded' || !job.providerJobId || !job.artifactRef) {
    throw new ConfigError(`Hosted job "${jobId}" has no successful provider artifact to transfer.`);
  }
  if (job.artifactPath && job.artifactSha256) {
    const storedPath = path.resolve(job.artifactPath);
    const expectedPath = path.resolve(options.storageRoot, job.jobId, 'artifact.mp4');
    if (storedPath !== expectedPath) throw new ConfigError('Stored artifact path is outside its private job directory.');
    try {
      const details = await stat(storedPath);
      if (details.isFile()) {
        const existing = await hashExistingArtifact(storedPath);
        if (existing?.sha256 === job.artifactSha256) {
          return { path: storedPath, ...existing };
        }
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rawUrl = await resolver.getArtifactUrl(job.providerJobId, job.artifactRef);
    const url = validatedUrl(rawUrl, options.allowedHosts);
    const artifact = await download(url, job, options);
    if (artifact === 'expired') continue;
    jobs.recordArtifact(jobId, artifact.path, artifact.sha256);
    return artifact;
  }
  throw new RenderError(`Hosted artifact URL for job "${jobId}" expired after one refresh.`);
}
