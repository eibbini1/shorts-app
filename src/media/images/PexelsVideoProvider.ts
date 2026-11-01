import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type { SceneVisualBrief, VisualAsset } from '../../shared/types.js';
import { ProviderError } from '../../shared/errors.js';
import { withRetry, isRetryableProviderError } from '../../shared/retry.js';
import { getMeanLuminance, runFfmpeg } from '../shared/ffmpegExec.js';
import type { ImageOptions, ImageProvider } from './ImageProvider.js';
import type { VisualSemanticAnalyzer } from './VisualSemanticAnalyzer.js';

/** Upper bound on how much of a source clip we keep; VideoRenderer trims further to the exact scene slot. */
const MAX_CLIP_DOWNLOAD_SEC = 10;
const MIN_ACCEPTABLE_LUMINANCE = 60;
const HTTP_TIMEOUT_MS = 30_000;

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  file_type: string;
  quality: string;
}

interface PexelsVideo {
  id: number;
  duration: number;
  url?: string;
  video_files: PexelsVideoFile[];
}

interface PexelsVideoSearchResponse {
  videos: PexelsVideo[];
}

/**
 * Real B-roll video provider: downloads short portrait clips from Pexels'
 * video API and normalizes them to 1080x1920/30fps so VideoRenderer can drop
 * them straight into a scene slot (with real motion, unlike a still).
 * Same ImageProvider interface as photo providers — VisualAsset.type just
 * comes back 'video' instead of 'image' (docs/DECISIONS.md D1).
 */
export class PexelsVideoProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly outputDir: string,
    private readonly semanticAnalyzer?: VisualSemanticAnalyzer,
  ) {}

  async validateVisual(asset: VisualAsset, brief: SceneVisualBrief): Promise<VisualAsset> {
    if (!this.semanticAnalyzer || asset.type !== 'video') return asset;
    return this.semanticAnalyzer.analyze(asset, brief);
  }

  async getVisuals(query: string, opts?: ImageOptions): Promise<VisualAsset[]> {
    const count = opts?.count ?? 3;
    const probeLabel = opts?.probeLabel ?? 'visual';
    const excludedIds = new Set(opts?.excludeCandidateIds ?? []);
    visualProbe(`${probeLabel} search-before ${query}`);
    // Fetch spare candidates so dark clips can be rejected and replaced.
    const videos = await this.searchVideos(query, Math.min(Math.max(count * 3, count), 20));
    visualProbe(`${probeLabel} search-after ${query}`);
    const assets: VisualAsset[] = [];

    for (const video of videos) {
      if (assets.length >= count) break;
      if (excludedIds.has(`pexels-video-${video.id}`)) continue;

      const file = pickBestPortraitFile(video.video_files);
      if (!file) {
        continue;
      }

      const basePath =
        `${this.outputDir}/pexels-video-${Date.now()}-${randomUUID()}-${assets.length}`;
      const downloadedPath = `${basePath}-raw.mp4`;
      const outPath = `${basePath}.mp4`;
      await mkdir(dirname(outPath), { recursive: true });
      let keepAsset = false;
      try {
        visualProbe(`${probeLabel} download-before ${video.id}`);
        await this.downloadVideo(file.link, downloadedPath);
        visualProbe(`${probeLabel} download-after ${video.id}`);
        visualProbe(`${probeLabel} normalize-before ${video.id}`);
        await this.normalizeClip(downloadedPath, outPath, probeLabel);
        visualProbe(`${probeLabel} normalize-after ${video.id}`);

        const normalizedDurationSec = Math.min(video.duration, MAX_CLIP_DOWNLOAD_SEC);
        visualProbe(`${probeLabel} luminance-before ${video.id}`);
        const luminance = await getMeanLuminance(
          outPath,
          Math.max(0, normalizedDurationSec / 2),
          probeLabel,
        );
        visualProbe(`${probeLabel} luminance-after ${video.id}`);
        if (luminance < MIN_ACCEPTABLE_LUMINANCE) {
          continue;
        }

        assets.push({
          path: outPath,
          type: 'video',
          candidateId: `pexels-video-${video.id}`,
          semanticEvidence: 'query-only',
          ...(titleFromPexelsUrl(video.url) ? { providerTitle: titleFromPexelsUrl(video.url)! } : {}),
        });
        keepAsset = true;
      } catch (error) {
        // A single CDN timeout or malformed clip should not discard all other
        // candidates returned for this query.
        console.warn(
          `[PexelsVideoProvider] Skipping candidate ${video.id}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await removeIfPresent(downloadedPath);
        if (!keepAsset) await removeIfPresent(outPath);
      }
    }

    async function removeIfPresent(path: string): Promise<void> {
      await unlink(path).catch(() => undefined);
    }

    if (assets.length < count) {
      throw new ProviderError(
        'pexels-video',
        `Could not find ${count} usable non-dark videos for query "${query}".`,
      );
    }

    return assets;
  }

  private async searchVideos(query: string, count: number): Promise<PexelsVideo[]> {
    const url = new URL('https://api.pexels.com/videos/search');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'portrait');
    url.searchParams.set('per_page', String(Math.min(Math.max(count, 1), 20)));

    const videos = await withRetry(
      async () => {
        try {
          const response = await fetch(url, {
            headers: { Authorization: this.apiKey },
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
          });

          if (!response.ok) {
            throw new ProviderError(
              'pexels-video',
              `Pexels video search failed with HTTP ${response.status} for "${query}".`,
              undefined,
              response.status,
            );
          }

          const data = (await response.json()) as PexelsVideoSearchResponse;
          return data.videos ?? [];
        } catch (err) {
          if (err instanceof ProviderError) throw err;
          if (isTimeoutError(err)) {
            throw new ProviderError(
              'pexels-video',
              `Pexels video search timed out after ${HTTP_TIMEOUT_MS / 1000}s for "${query}".`,
              err,
            );
          }
          throw new ProviderError('pexels-video', `Failed to reach Pexels API for "${query}".`, err);
        }
      },
      { shouldRetry: isRetryableProviderError },
    );

    if (videos.length === 0) {
      throw new ProviderError('pexels-video', `Pexels returned no videos for "${query}".`);
    }

    return videos;
  }

  private async downloadVideo(url: string, outPath: string): Promise<void> {
    const bytes = await withRetry(
      async () => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });

          if (!response.ok) {
            throw new ProviderError(
              'pexels-video',
              `Pexels video download failed with HTTP ${response.status} for ${url}.`,
              undefined,
              response.status,
            );
          }

          return Buffer.from(await response.arrayBuffer());
        } catch (err) {
          if (err instanceof ProviderError) throw err;
          if (isTimeoutError(err)) {
            throw new ProviderError(
              'pexels-video',
              `Pexels video download timed out after ${HTTP_TIMEOUT_MS / 1000}s.`,
              err,
            );
          }
          throw new ProviderError('pexels-video', `Failed to reach Pexels for download: ${url}.`, err);
        }
      },
      { shouldRetry: isRetryableProviderError },
    );

    await writeFile(outPath, bytes);
  }

  /** Re-encodes to a consistent 1080x1920/30fps clip, capped to MAX_CLIP_DOWNLOAD_SEC. */
  private async normalizeClip(inputPath: string, outPath: string, probeLabel: string): Promise<void> {
    await runFfmpeg([
      '-i', inputPath,
      '-t', String(MAX_CLIP_DOWNLOAD_SEC),
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,fps=30',
      '-an',
      outPath,
    ], probeLabel);
  }
}

/** Pexels page URLs end in a human-written slug, e.g. /video/chef-searing-a-burger-patty-3298123/. */
export function titleFromPexelsUrl(url?: string): string | undefined {
  const slug = url?.match(/\/video\/([^/]+?)-?\d*\/?$/)?.[1];
  const title = slug?.replace(/-/g, ' ').trim();
  return title && title.length > 3 ? title : undefined;
}

function visualProbe(message: string): void {
  console.log(`[VISUAL-PROBE] ${message}`);
  process.stdout.write('');
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Picks the highest-resolution genuinely-portrait (height > width) mp4 file available. */
function pickBestPortraitFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const portraitMp4s = files.filter((f) => f.file_type === 'video/mp4' && f.height > f.width);
  const pool = portraitMp4s.length > 0 ? portraitMp4s : files.filter((f) => f.file_type === 'video/mp4');
  return pool.sort((a, b) => b.height - a.height)[0];
}
