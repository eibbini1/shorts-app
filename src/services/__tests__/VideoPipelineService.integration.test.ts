import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { getDb, __resetDbForTests } from '../../database/connection.js';
import { VideosRepository } from '../../database/VideosRepository.js';
import { JobsRepository } from '../../database/JobsRepository.js';
import { MockLLMProvider } from '../../content/providers/MockLLMProvider.js';
import { MockTTSProvider } from '../../media/tts/MockTTSProvider.js';
import { MockImageProvider } from '../../media/images/MockImageProvider.js';
import { VideoPipelineService } from '../VideoPipelineService.js';

const TEST_STORAGE = '/tmp/video-pipeline-integration-test';

describe('VideoPipelineService (integration, real ffmpeg)', () => {
  let db: Database.Database;

  beforeEach(() => {
    __resetDbForTests();
    db = getDb(':memory:');
  });

  afterAll(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true });
  });

  // Real ffmpeg + preset slow + per-scene xfade crossfades is meaningfully
  // slower than the old hard-cut concat; 30s default timeout isn't enough headroom.
  it('produces a rendered video file and a full success job history', async () => {
    const videosRepo = new VideosRepository(db);
    const jobsRepo = new JobsRepository(db);

    const tts = new MockTTSProvider(`${TEST_STORAGE}/audio`);
    const synthesize = vi.spyOn(tts, 'synthesize');
    const service = new VideoPipelineService(
      new MockLLMProvider(),
      tts,
      new MockImageProvider(`${TEST_STORAGE}/images`),
      videosRepo,
      jobsRepo,
      TEST_STORAGE,
    );

    const result = await service.run('luxury-food', { targetDurationSec: 15 });

    expect(result.videoId).toBeGreaterThan(0);
    // MockTTSProvider honors targetDurationSec, so duration validation passes
    // on the first attempt and this exact audio is reused by the tts job.
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(result.render.width).toBe(1080);
    expect(result.render.height).toBe(1920);

    const video = videosRepo.getById(result.videoId);
    expect(video.status).toBe('rendered');
    expect(video.videoPath).toBe(result.render.path);

    const jobs = jobsRepo.historyForVideo(result.videoId);
    const jobTypes = jobs.map((j) => j.type);
    expect(jobTypes).toContain('metadata');
    expect(jobTypes).toContain('tts');
    expect(jobTypes).toContain('visuals');
    expect(jobTypes).toContain('render');
    expect(jobTypes).toContain('quality-gate');
    expect(jobTypes).toContain('readiness');
    expect(jobs.every((j) => j.status === 'success')).toBe(true);

    // The readiness scorecard should be present and internally consistent
    // (this is the "final MVP" step — verified against a real render, not
    // just mocked unit tests).
    expect(result.readiness.checks.length).toBeGreaterThan(0);
    expect(result.readiness.ok).toBe(true);
    const readinessFile = `${TEST_STORAGE}/videos/readiness-${result.videoId}.json`;
    const { readFile } = await import('node:fs/promises');
    const persisted = JSON.parse(await readFile(readinessFile, 'utf-8')) as typeof result.readiness;
    expect(persisted.summary).toBe(result.readiness.summary);
    const manifestFile = `${TEST_STORAGE}/videos/manifest-${result.videoId}.json`;
    const manifest = JSON.parse(await readFile(manifestFile, 'utf-8')) as {
      videoId: number;
      contentIdentity: { scriptSha256: string; metadataSha256: string };
      renderIdentity: { path: string };
    };
    expect(manifest.videoId).toBe(result.videoId);
    expect(manifest.contentIdentity.scriptSha256).toHaveLength(64);
    expect(manifest.contentIdentity.metadataSha256).toHaveLength(64);
    expect(manifest.renderIdentity.path).toBe(result.render.path);
    expect(videosRepo.getById(result.videoId).metadataJson).toBe(JSON.stringify(result.metadata));
    expect(videosRepo.getById(result.videoId).readinessJson).toBe(JSON.stringify(result.readiness));

    const { access } = await import('node:fs/promises');
    await expect(access(result.render.path)).resolves.toBeUndefined();
  }, 400_000);
});
