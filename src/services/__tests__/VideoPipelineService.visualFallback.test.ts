import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { getDb, __resetDbForTests } from '../../database/connection.js';
import { VideosRepository } from '../../database/VideosRepository.js';
import { JobsRepository } from '../../database/JobsRepository.js';
import { VideoPipelineService } from '../VideoPipelineService.js';
import type { IdeaCapableLLMProvider } from '../../content/providers/LLMProvider.js';
import type { TTSProvider } from '../../media/tts/TTSProvider.js';
import type { ImageProvider } from '../../media/images/ImageProvider.js';
import type { Idea, Script, VideoMetadata } from '../../shared/types.js';

const TEST_STORAGE = '/tmp/video-pipeline-fallback-test';

function makeIdea(): Idea {
  return {
    title: 'The $1,000 bowl of Japanese matsutake soup picked by mountain monks',
    angle: 'A',
    niche: 'luxury-food',
    visualKeywords: [
      'foggy mountain pine forest',
      'muddy artisan unearthing mushroom',
      'steaming ceramic bowl',
      'close up of sliced white mushroom',
      'deadpan creator tasting soup',
    ],
  };
}

function makeScript(): Script {
  const idea = makeIdea();
  return {
    idea,
    sections: [
      { label: 'hook', text: 'An expensive mushroom soup appears.', startSec: 0, endSec: 3 },
      { label: 'body', text: 'Matsutake mushrooms are hand-picked in mountain forests.', startSec: 3, endSec: 9 },
      { label: 'cta', text: 'Would you pay for this bowl?', startSec: 9, endSec: 12 },
    ],
    fullText:
      'An expensive mushroom soup appears. Matsutake mushrooms are hand-picked in mountain forests. Would you pay for this bowl?',
    estimatedDurationSec: 12,
    visualKeywords: idea.visualKeywords,
  };
}

function makeMetadata(): VideoMetadata {
  return {
    title: 'Matsutake Soup Shock',
    description: 'Test metadata',
    tags: ['matsutake'],
    hashtags: ['#matsutake'],
  };
}

function planJson(count: number): string {
  return JSON.stringify({
    scenes: Array.from({ length: count }, (_, index) => ({
      index,
      objective: `Close shot of matsutake mushroom soup step ${index}`,
      queries: [`matsutake mushroom soup ${index}`, 'sliced white mushroom close', 'steaming ceramic soup bowl'],
      mustShow: ['mushroom'],
      avoid: ['restaurant exterior'],
    })),
  });
}

function makeLlm(script: Script): IdeaCapableLLMProvider {
  return {
    generateText: vi.fn(async (prompt: string) => {
      if (prompt.includes('SCENE_PLAN')) {
        const count = Number(/Return exactly (\d+) scenes/.exec(prompt)?.[1] ?? 0);
        return planJson(count);
      }
      return 'ok';
    }),
    generateIdea: vi.fn(async () => script.idea),
    generateScript: vi.fn(async () => script),
    generateMetadata: vi.fn(async () => makeMetadata()),
  } as unknown as IdeaCapableLLMProvider;
}

function makeTts(script: Script): TTSProvider {
  const words = script.fullText.split(/\s+/);
  return {
    synthesize: vi.fn(async (_text, opts) => {
      const durationSec = opts?.targetDurationSec ?? 15;
      const per = durationSec / words.length;
      return {
        path: `${TEST_STORAGE}/audio/nonexistent.wav`,
        durationSec,
        wordTimings: words.map((word, i) => ({ word, startSec: i * per, endSec: (i + 1) * per })),
      };
    }),
  };
}

function verdict(score: number, matches = score >= 0.6) {
  return { score, matches, reason: matches ? 'shows the mushroom soup' : 'restaurant exterior', judge: 'test' };
}

describe('VideoPipelineService scene-planned visual selection', () => {
  let db: Database.Database;
  beforeEach(() => {
    __resetDbForTests();
    db = getDb(':memory:');
  });

  function build(images: ImageProvider, script = makeScript()) {
    const videosRepo = new VideosRepository(db);
    const jobsRepo = new JobsRepository(db);
    return { service: new VideoPipelineService(makeLlm(script), makeTts(script), images, videosRepo, jobsRepo, TEST_STORAGE), videosRepo };
  }

  it('retries the next planned query when the first returns nothing, then fails loudly if nothing verifies', async () => {
    const getVisuals = vi.fn(async () => []);
    const { service } = build({ getVisuals, validateVisual: vi.fn(async (a) => a) });
    await expect(service.run('luxury-food', { targetDurationSec: 15 })).rejects.toThrow(/No verified visual for scene 0/);
    const queried = getVisuals.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(queried.slice(0, 3)).toEqual(['matsutake mushroom soup 0', 'sliced white mushroom close', 'steaming ceramic soup bowl']);
  });

  it('rejects clips the judge says do not match, and names the scene it could not fill', async () => {
    const getVisuals = vi.fn(async () => [{ path: '/x.mp4', type: 'video' as const, candidateId: 'pexels-video-1' }]);
    const validateVisual = vi.fn(async (a) => ({ ...a, visualMatch: verdict(0.2) }));
    const { service } = build({ getVisuals, validateVisual });
    await expect(service.run('luxury-food', { targetDurationSec: 15 })).rejects.toThrow(/rejected \(0\.20\): restaurant exterior/);
  });

  it('refuses unjudged clips from a real provider unless ALLOW_UNVERIFIED_VISUALS is set', async () => {
    const getVisuals = vi.fn(async () => [{ path: '/x.mp4', type: 'video' as const, candidateId: 'pexels-video-9' }]);
    const { service } = build({ getVisuals, validateVisual: vi.fn(async (a) => a) });
    await expect(service.run('luxury-food', { targetDurationSec: 15 })).rejects.toThrow(/GEMINI_API_KEY|ALLOW_UNVERIFIED_VISUALS/);
  });

  it('plans beats from real word timing and passes each beat objective to the judge', async () => {
    const seen: string[] = [];
    let n = 0;
    const getVisuals = vi.fn(async () => [{ path: `/x${n}.mp4`, type: 'video' as const, candidateId: `pexels-video-${n++}` }]);
    const validateVisual = vi.fn(async (a, brief) => {
      seen.push(`${brief.narrationText} => ${brief.objective}`);
      return { ...a, visualMatch: verdict(0.9) };
    });
    const { service } = build({ getVisuals, validateVisual });
    // Fails later at tts/render (no real audio file), but the visuals step must have succeeded.
    await service.run('luxury-food', { targetDurationSec: 15 }).catch(() => undefined);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).toMatch(/^An expensive mushroom/);
    expect(seen[0]).toContain('Close shot of matsutake mushroom soup step 0');
  });
});
