import { IdeaGenerator } from '../content/ideaGenerator/IdeaGenerator.js';
import { HookGenerator } from '../content/hookGenerator/HookGenerator.js';
import { ScriptGenerator } from '../content/scriptGenerator/ScriptGenerator.js';
import { MetadataGenerator } from '../content/metadataGenerator/MetadataGenerator.js';
import { SubtitleBuilder } from '../media/subtitles/SubtitleBuilder.js';
import { VideoRenderer } from '../media/video/VideoRenderer.js';
import { SoundDesignService } from '../media/audio/SoundDesignService.js';
import { QualityGateService } from './QualityGateService.js';
import { assessReadiness, MAX_DURATION_SEC, type ReadinessReport } from './YouTubeReadinessService.js';
import type { TrendService } from '../content/trends/YouTubeTrendService.js';
import type { AnalyticsRepository } from '../database/AnalyticsRepository.js';
import type { TTSProvider } from '../media/tts/TTSProvider.js';
import type { ImageProvider } from '../media/images/ImageProvider.js';
import type { IdeaCapableLLMProvider } from '../content/providers/LLMProvider.js';
import { VideosRepository } from '../database/VideosRepository.js';
import { JobsRepository } from '../database/JobsRepository.js';
import type { RenderedVideo, Script, VideoMetadata, VisualAsset } from '../shared/types.js';
import type { PipelineManifest, SceneVisualBrief, VisualValidationDecision } from '../shared/types.js';
import { buildBeats } from '../content/scenePlanner/beats.js';
import { ScenePlanner, ScenePlanError } from '../content/scenePlanner/ScenePlanner.js';
import { MockLLMProvider } from '../content/providers/MockLLMProvider.js';
import type { ScenePlan } from '../shared/types.js';
import { isDuplicateVisual, visualIdentity } from '../media/images/VisualValidation.js';
import { ConfigError, isAppError, RenderError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/** A clip must score at least this against the beat objective, with the judge saying it matches. */
const SCENE_MATCH_MIN_SCORE = 0.6;

export interface VideoPipelineResult {
  videoId: number;
  script: Script;
  metadata: VideoMetadata;
  render: RenderedVideo;
  readiness: ReadinessReport;
}

export interface VideoPipelineOptions {
  targetDurationSec?: number;
}

export interface SoundDesignConfig {
  /** Directory of licensed music, organized as `<dir>/<mood>/*.mp3` or `<dir>/<mood>.mp3`. Omit to use synthesized placeholder music. */
  musicLibraryDir?: string;
  /** Directory of licensed SFX, organized as `<dir>/<name>/*.mp3` or `<dir>/<name>.mp3` (whoosh, riser, ding, thud). Omit to use synthesized placeholder SFX. */
  sfxLibraryDir?: string;
}

/**
 * Orchestrates one full video creation run: idea -> script -> metadata ->
 * narration -> visuals -> subtitles -> render. Persists a `videos` row up
 * front and a `jobs` row per step, so a failed run is diagnosable and (in a
 * future iteration) resumable from the failed step rather than from scratch.
 * Does NOT upload — that's UploadService's job (see docs/DECISIONS.md D5, D6).
 */
export class VideoPipelineService {
  constructor(
    private readonly llm: IdeaCapableLLMProvider,
    private readonly tts: TTSProvider,
    private readonly images: ImageProvider,
    private readonly videosRepo: VideosRepository,
    private readonly jobsRepo: JobsRepository,
    private readonly storageRoot: string,
    private readonly soundDesignConfig: SoundDesignConfig = {},
    private readonly trendService?: TrendService,
    private readonly analyticsRepo?: AnalyticsRepository,
  ) {}

  async run(niche: string, opts: VideoPipelineOptions = {}): Promise<VideoPipelineResult> {
    const targetDurationSec = opts.targetDurationSec ?? 18;

    // Reject before any real (paid) provider call happens, not after a full
    // render — the previous behavior let a bad duration burn LLM+TTS+
    // visual+render cost before the readiness gate ever caught it. See
    // docs/DECISIONS.md D17.
    if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) {
      throw new ConfigError(`targetDurationSec must be a positive number, got ${targetDurationSec}.`);
    }
    if (targetDurationSec > MAX_DURATION_SEC) {
      throw new ConfigError(
        `targetDurationSec (${targetDurationSec}) exceeds YouTube's ${MAX_DURATION_SEC}s Shorts ` +
          `ceiling — this would never pass the readiness check, so it's rejected here instead of ` +
          `after spending real provider calls on it.`,
      );
    }

    const ideaGenerator = new IdeaGenerator(this.llm, this.trendService, this.analyticsRepo, this.videosRepo);
    const hookGenerator = new HookGenerator(this.llm);
    const scriptGenerator = new ScriptGenerator(this.llm, this.tts);
    const metadataGenerator = new MetadataGenerator(this.llm, this.trendService);
    const subtitleBuilder = new SubtitleBuilder();
    const renderer = new VideoRenderer(`${this.storageRoot}/videos`);
    const soundDesignService = new SoundDesignService(
      this.soundDesignConfig.musicLibraryDir,
      this.soundDesignConfig.sfxLibraryDir,
      `${this.storageRoot}/audio/sfx-cache`,
    );
    const qualityGateService = new QualityGateService();

    const recentTitles = this.videosRepo.recentTitles(20);

    const idea = await this.runStep('idea', () => ideaGenerator.generate(niche, { recentTitles }));

    const generated = await this.runStep('script', async () => {
      const hookVariants = await hookGenerator.generateVariants(idea, 3);
      logger.info('Generated hook variants', {
        title: idea.title,
        hookVariants,
      });
      return scriptGenerator.generateWithAudio(idea, targetDurationSec, { hookVariants });
    });
    const { script } = generated;

    // Persist the video row as soon as we have a title + script, so later
    // steps have a videoId to attach jobs/errors to.
    const video = this.videosRepo.create({ title: idea.title, script: JSON.stringify(script) });
    this.videosRepo.setStatus(video.id, 'scripted');

    const metadata = await this.runStep(
      'metadata',
      () => metadataGenerator.generate(script),
      video.id,
    );

    const audio = await this.runStep(
      'tts',
      () => Promise.resolve(generated.audio),
      video.id,
    );

    const visuals = await this.runStep(
      'visuals',
      async () => {
        this.images.beginVisualSession?.();
        const selectedIdentities = new Set<string>();
        const allVisuals: NonNullable<Awaited<ReturnType<ImageProvider['getVisuals']>>> = [];
        const visualDecisions: VisualValidationDecision[] = [];

        // 1. Beats from the REAL voice-over timing: one visual per spoken phrase.
        const beats = buildBeats(script, audio);
        // 2. A scene plan: what each beat must show + concrete search queries (see docs/VISUAL_MATCHING.md).
        const plans = await new ScenePlanner(this.llm, this.llm instanceof MockLLMProvider).plan(script, beats);
        logger.info('Scene plan', {
          scenes: plans.map((p) => ({
            at: `${p.beat.startSec.toFixed(1)}-${p.beat.endSec.toFixed(1)}s`,
            says: p.beat.text,
            objective: p.objective,
            queries: p.queries,
            source: p.source,
          })),
        });
        // 3. Per scene: search, inspect the actual frames, keep the best verified match or fail loudly.
        for (const plan of plans) {
          const result = await this.getVisualForScene(plan, selectedIdentities);
          allVisuals.push({ ...result.asset, durationSec: plan.beat.endSec - plan.beat.startSec });
          visualDecisions.push(result.decision);
        }

        return { assets: allVisuals, decisions: visualDecisions };
      },
      video.id,
    );
    const visualAssets = visuals.assets;
    const visualValidation = visuals.decisions;

    this.videosRepo.setStatus(video.id, 'rendering');

    let assPath: string | undefined;
    const render = await this.runStep(
      'render',
      async () => {
        // Word-level captions (accurate when `audio.wordTimings` comes from a
        // real TTS provider like ElevenLabs; falls back to the section-split
        // estimate for MockTTSProvider) rendered as .ass for per-word
        // pop-in/emphasis styling, instead of static 6-word .srt chunks.
        const wordCues = subtitleBuilder.buildWordCues(audio, script);
        assPath = await subtitleBuilder.writeAss(
          wordCues,
          `${this.storageRoot}/videos/subs-${video.id}.ass`,
        );
        // Mood-matched background music + SFX cues timed to section
        // boundaries (whoosh on cuts, riser before the CTA).
        const soundDesign = await soundDesignService.plan(script);
        return renderer.render({
          audio,
          visuals: visualAssets,
          subtitles: { cues: [], assPath },
          ...(soundDesign.musicPath !== undefined ? { musicPath: soundDesign.musicPath } : {}),
          sfxCues: soundDesign.sfxCues,
          outputBaseName: `short-${video.id}`,
        });
      },
      video.id,
    );

    // Catches a fully silent render, a truncated/drifted duration, or a
    // leaked director's-note/meta-instruction in the script or captions —
    // each a failure mode this project has actually hit — before the video
    // is allowed to reach "rendered" status.
    await this.runStep(
      'quality-gate',
      () => qualityGateService.assert(render, script, assPath),
      video.id,
    );

    // Pre-publish scorecard across YouTube's known eligibility/reach/
    // interaction/subscriber-growth signals (docs/DECISIONS.md D16). Only
    // a genuine policy/technical problem (duration outside the Shorts
    // ceiling) blocks here; everything heuristic is a 'warn' surfaced to
    // whoever reviews the video, not a silent block on an imperfect guess.
    const readiness = await this.runStep(
      'readiness',
      async () => {
        const report = assessReadiness({
          script,
          metadata,
          render,
          ...(assPath !== undefined ? { assPath } : {}),
          recentTitles,
          visualValidation,
        });
        const readinessPath = `${this.storageRoot}/videos/readiness-${video.id}.json`;
        await mkdir(dirname(readinessPath), { recursive: true });
        await writeFile(readinessPath, JSON.stringify(report, null, 2), 'utf-8');
        if (!report.ok) {
          const failures = report.checks
            .filter((c) => c.status === 'fail')
            .map((c) => `[${c.name}] ${c.note}`)
            .join(' | ');
          throw new RenderError(`Readiness check failed: ${failures}`);
        }
        return report;
      },
      video.id,
    );

    const metadataJson = JSON.stringify(metadata);
    const readinessJson = JSON.stringify(readiness);
    const manifest: PipelineManifest = {
      version: 1,
      videoId: video.id,
      contentIdentity: {
        scriptSha256: sha256(JSON.stringify(script)),
        metadataSha256: sha256(metadataJson),
      },
      renderIdentity: {
        path: render.path,
        durationSec: render.durationSec,
        width: render.width,
        height: render.height,
        ...(assPath !== undefined ? { captionsPath: assPath } : {}),
      },
      visualValidation,
      readinessSha256: sha256(readinessJson),
      generatedAt: new Date().toISOString(),
    };
    const manifestPath = `${this.storageRoot}/videos/manifest-${video.id}.json`;
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    this.videosRepo.persistPublishArtifacts(video.id, metadata, readiness, manifest);
    this.videosRepo.markRendered(video.id, render.path);

    logger.info('Video pipeline completed', {
      videoId: video.id,
      path: render.path,
      readiness: readiness.summary,
    });

    return { videoId: video.id, script, metadata, render, readiness };
  }

  private async runStep<T>(
    type: Parameters<JobsRepository['start']>[0],
    fn: () => Promise<T>,
    videoId?: number,
  ): Promise<T> {
    const job = this.jobsRepo.start(type, videoId);
    try {
      const result = await fn();
      this.jobsRepo.succeed(job.id);
      return result;
    } catch (err) {
      const message = isAppError(err) ? err.message : String(err);
      this.jobsRepo.fail(job.id, message);
      if (videoId !== undefined) {
        this.videosRepo.setStatus(videoId, 'failed');
      }
      logger.error('Pipeline step failed', { step: type, videoId, error: message });
      throw err;
    }
  }

  /**
   * Finds the visual for ONE narration beat. Candidates are judged against the beat's
   * objective (by inspecting real frames when a vision judge is configured) and the best
   * verified candidate wins. Nothing is substituted silently: if no candidate verifies
   * after every planned query, this throws with the full audit trail.
   */
  private async getVisualForScene(
    plan: ScenePlan,
    selectedIdentities: Set<string>,
  ): Promise<{ asset: VisualAsset; decision: VisualValidationDecision }> {
    const { beat } = plan;
    const brief: SceneVisualBrief = {
      sectionLabel: beat.sectionLabel,
      narrationText: beat.text,
      coreSubjectAnchors: plan.mustShow,
      requiredVisualTerms: plan.mustShow,
      excludedTerms: ['logo', 'watermark', 'text overlay'],
      objective: plan.objective,
      mustShow: plan.mustShow,
      avoid: plan.avoid,
    };
    const placeholderProvider = this.images.validateVisual === undefined;
    const allowUnverified = process.env.ALLOW_UNVERIFIED_VISUALS === 'true';
    const attempts: VisualValidationDecision['attempts'] = [];
    const reasons: string[] = [];
    let bestUnverified: VisualAsset | undefined;

    for (const query of plan.queries) {
      let candidates: VisualAsset[];
      try {
        candidates = await this.images.getVisuals(query, {
          count: 3,
          probeLabel: `beat-${beat.index} ${query}`,
          excludeCandidateIds: [...selectedIdentities]
            .filter((identity) => identity.startsWith('id:pexels-video-'))
            .map((identity) => identity.slice('id:'.length)),
        });
      } catch (error) {
        const reason = `query "${query}" failed: ${error instanceof Error ? error.message : String(error)}`;
        reasons.push(reason);
        attempts.push({ query, accepted: false, reasons: [reason], metadataOnly: false });
        continue;
      }

      let best: { asset: VisualAsset; score: number } | undefined;
      for (const candidate of candidates) {
        let judged = candidate;
        if (this.images.validateVisual) {
          try {
            judged = await this.images.validateVisual(candidate, brief);
          } catch (error) {
            logger.warn('Vision judge failed for candidate; it stays unverified', {
              candidateId: candidate.candidateId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const identity = visualIdentity(judged);
        const duplicate = judged.candidateId !== undefined && isDuplicateVisual(judged, selectedIdentities);
        const match = judged.visualMatch;
        const verified = match !== undefined && match.matches && match.score >= SCENE_MATCH_MIN_SCORE;
        const rejectedReason = duplicate
          ? 'duplicate of an already-selected clip'
          : match
            ? verified ? `verified (${match.score.toFixed(2)}): ${match.reason}` : `rejected (${match.score.toFixed(2)}): ${match.reason}`
            : placeholderProvider
              ? 'placeholder provider: no pixel inspection available'
              : 'unverified: no vision verdict (judge missing or failed)';
        attempts.push({
          query,
          candidateIdentity: identity,
          ...(match ? { score: match.score } : {}),
          accepted: verified && !duplicate,
          reasons: [rejectedReason, ...(judged.providerTitle ? [`provider title: ${judged.providerTitle}`] : [])],
          metadataOnly: !match,
          evidenceMode: match ? 'provider-metadata' : 'query-only',
        });
        if (duplicate) continue;
        if (verified && (!best || match!.score > best.score)) best = { asset: judged, score: match!.score };
        if (!match && !bestUnverified) bestUnverified = judged;
      }

      if (best) {
        selectedIdentities.add(visualIdentity(best.asset));
        return this.sceneResult(plan, best.asset, 'verified', attempts, query);
      }
    }

    // Mock/legacy providers cannot inspect pixels: allowed, but explicitly labelled placeholder.
    if (bestUnverified && placeholderProvider) {
      selectedIdentities.add(visualIdentity(bestUnverified));
      return this.sceneResult(plan, bestUnverified, 'placeholder', attempts, plan.queries[0]!);
    }
    // Real provider, no verdict: only with an explicit opt-in, and flagged in the manifest.
    if (bestUnverified && allowUnverified) {
      logger.warn('ALLOW_UNVERIFIED_VISUALS: using a clip nobody judged', { beat: beat.index, says: beat.text });
      selectedIdentities.add(visualIdentity(bestUnverified));
      return this.sceneResult(plan, bestUnverified, 'unverified', attempts, plan.queries[0]!);
    }

    const tried = [...new Set(attempts.map((a) => `"${a.query}"`))].join(', ');
    const why = [...new Set([...reasons, ...attempts.flatMap((a) => a.reasons.slice(0, 1))])].slice(0, 6).join(' | ');
    const hint = bestUnverified && !placeholderProvider
      ? ' Clips were found but none could be verified: set GEMINI_API_KEY (vision judge) or ALLOW_UNVERIFIED_VISUALS=true to accept them flagged.'
      : '';
    throw new ScenePlanError(
      `No verified visual for scene ${beat.index} (${beat.startSec.toFixed(1)}-${beat.endSec.toFixed(1)}s, says "${beat.text}"; needs: ${plan.objective}). ` +
        `Tried ${tried}. ${why}.${hint}`,
    );
  }

  private sceneResult(
    plan: ScenePlan,
    asset: VisualAsset,
    verification: 'verified' | 'unverified' | 'placeholder',
    attempts: VisualValidationDecision['attempts'],
    query: string,
  ): { asset: VisualAsset; decision: VisualValidationDecision } {
    const match = asset.visualMatch;
    const decision: VisualValidationDecision = {
      sectionLabel: plan.beat.sectionLabel,
      slotIndex: plan.beat.index,
      query,
      attempts,
      selectedIdentity: visualIdentity(asset),
      ...(match ? { selectedScore: match.score } : {}),
      selectedEvidenceMode: match ? 'provider-metadata' : 'query-only',
      accepted: true,
      reasons: [match?.reason ?? `${verification}: not verified against the narration`],
      beatIndex: plan.beat.index,
      beatText: plan.beat.text,
      startSec: plan.beat.startSec,
      endSec: plan.beat.endSec,
      objective: plan.objective,
      ...(asset.semanticText ? { assetDescription: asset.semanticText } : {}),
      ...(asset.providerTitle ? { providerTitle: asset.providerTitle } : {}),
      ...(match ? { matchScore: match.score, matchReason: match.reason } : {}),
      verification,
    };
    return { asset: { ...asset, visualValidation: decision }, decision };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function buildVisualQuery(script: Script, section: Script['sections'][number]): string {
  const title = script.idea.title;
  // A shared anchor (the video's title + its top visual keywords) goes into
  // every section's search query, so hook/body/cta visuals stay thematically
  // tied together even when they come from independent stock searches —
  // this is what makes consecutive scenes read as "the same video" instead
  // of an unrelated stock-photo grab-bag.
  const anchor = script.visualKeywords.slice(0, 3).join(' ');
  // Section-specific terms come directly from what's actually being said at
  // this point in the script, so each visual is anchored to its own moment
  // rather than a generic placeholder — and the role cue is niche-agnostic
  // (previously hardcoded to food-specific vocabulary like "chef hands,"
  // which was wrong for any other CONTENT_NICHE).
  const sectionTerms = extractKeyPhrases(section.text, 4).join(' ');
  const roleCue = VISUAL_ROLE_CUES[section.label];

  const domainCue = isFoodCookingScript(script)
    ? 'food recipe cooking close up appetizing'
    : '';
  return `${title} ${anchor} ${sectionTerms} ${domainCue} ${roleCue} vertical`.replace(/\s+/g, ' ').trim();
}

export function buildSceneVisualBrief(script: Script, section: Script['sections'][number]): SceneVisualBrief {
  const anchors = buildCoreSubjectAnchors(script);
  const narrationTerms = extractKeyPhrases(section.text, 6);
  const requiredVisualTerms = [...new Set([
    ...narrationTerms,
    ...script.visualKeywords.flatMap((keyword) => extractKeyPhrases(keyword, 3)),
  ])].slice(0, 10);
  const domainRequiredTerms = isFoodCookingScript(script)
    ? extractLuxuryFoodTerms(`${script.idea.title} ${section.text} ${script.visualKeywords.join(' ')}`)
    : [];
  const subjectRequiredTerms = isFoodCookingScript(script)
    ? extractLuxuryFoodSubjectTerms(`${script.idea.title} ${section.text} ${script.visualKeywords.join(' ')}`)
    : [];
  return {
    sectionLabel: section.label,
    narrationText: section.text,
    coreSubjectAnchors: anchors.slice(0, 5),
    requiredVisualTerms,
    ...(domainRequiredTerms.length > 0 ? { domainRequiredTerms } : {}),
    ...(subjectRequiredTerms.length > 0 ? { subjectRequiredTerms } : {}),
    // These are editorial exclusions, not claims about the pixels. They prevent
    // a provider's own metadata from selecting common stock artefacts.
    excludedTerms: ['logo', 'watermark', 'text overlay'],
  };
}

export function buildVisualQueriesForSection(
  script: Script,
  section: Script['sections'][number],
  slotCount: number,
  usedQueryKeys: Set<string>,
): string[] {
  const plannedCount = Math.max(1, Math.floor(slotCount));
  const keywordPool = splitVisualKeywordPool(script.visualKeywords);
  const sectionPool = buildSectionPhrasePool(section.text);
  const subjectPool = dedupePhrases([
    ...sectionPool,
    ...keywordPool,
    ...buildSectionPhrasePool(script.idea.title),
  ]);
  const fallbackPool = subjectPool.length > 0 ? subjectPool : ['abstract luxury texture'];
  const foodAnchor = isFoodCookingScript(script)
    ? selectFoodAnchor(
      extractLuxuryFoodTerms(script.idea.title),
      extractLuxuryFoodTerms(`${section.text} ${script.visualKeywords.join(' ')}`),
    )
    : undefined;
  const coreAnchor =
    (foodAnchor && foodAnchor !== 'food' ? foodAnchor : buildCoreSubjectAnchors(script)[0]) ?? 'subject';
  const domainCue = isFoodCookingScript(script) ? 'food recipe' : '';
  const foodShotSubject = isFoodCookingScript(script)
    ? luxuryFoodShotSubject(coreAnchor)
    : '';
  const styleHints = isFoodCookingScript(script)
    ? [
      ...(script.idea.niche.trim().toLowerCase() === 'luxury-food'
        ? LUXURY_FOOD_STYLE_HINTS[section.label]
        : FOOD_COOKING_STYLE_HINTS[section.label]),
      ...QUERY_STYLE_HINTS[section.label],
    ]
    : QUERY_STYLE_HINTS[section.label];
  const localUsed = new Set<string>();
  const queries: string[] = [];

  for (let slotIndex = 0; slotIndex < plannedCount; slotIndex += 1) {
    const searchSpace = Math.max(1, fallbackPool.length) * Math.max(1, styleHints.length + 1);
    let selectedQuery: string | undefined;

    for (let attempt = 0; attempt < searchSpace; attempt += 1) {
      const subject = fallbackPool[(slotIndex + attempt) % fallbackPool.length]!;
      const hintIndex = (slotIndex + attempt) % (styleHints.length + 1);
      const styleHint = hintIndex < styleHints.length ? styleHints[hintIndex] : undefined;
      const candidate = buildSlotVisualQuery(
        coreAnchor,
        `${foodShotSubject} ${subject} ${domainCue}`,
        styleHint,
      );
      const candidateKey = normalizeQueryKey(candidate);

      if (!usedQueryKeys.has(candidateKey) && !localUsed.has(candidateKey)) {
        selectedQuery = candidate;
        break;
      }
    }

    if (!selectedQuery) {
      const fallbackSubject = fallbackPool[slotIndex % fallbackPool.length]!;
      selectedQuery = buildSlotVisualQuery(coreAnchor, fallbackSubject);
    }

    const selectedKey = normalizeQueryKey(selectedQuery);
    usedQueryKeys.add(selectedKey);
    localUsed.add(selectedKey);
    queries.push(selectedQuery);
  }

  return queries;
}

export function splitVisualKeywordPool(visualKeywords: string[]): string[] {
  const pool: string[] = [];

  for (const phrase of visualKeywords) {
    const tokens = queryTokens(phrase, 8);
    if (tokens.length === 0) continue;

    pool.push(tokens.slice(0, MAX_SUBJECT_WORDS).join(' '));
    pool.push(...buildNgramPhrases(tokens, 3, 4));
    pool.push(...buildNgramPhrases(tokens, 2, 4));
  }

  return dedupePhrases(pool);
}

export function normalizeQueryKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSectionPhrasePool(sectionText: string): string[] {
  const words = queryTokens(sectionText, 18);
  const phrases = [
    ...buildNgramPhrases(words, 3, 10),
    ...buildNgramPhrases(words, 2, 10),
  ];
  return dedupePhrases(phrases);
}

function buildSlotVisualQuery(
  anchor: string,
  subjectPhrase: string,
  styleHint?: string,
): string {
  const anchorToken = queryTokens(anchor, 1)[0] ?? 'subject';
  const subjectTokens = queryTokens(subjectPhrase, MAX_SUBJECT_WORDS)
    .filter((token) => token !== anchorToken && !VISUAL_DESCRIPTOR_TOKENS.has(token))
    .slice(0, 2);
  const styleTokens = styleHint
    ? queryTokens(styleHint, MAX_STYLE_WORDS).slice(0, MAX_STYLE_WORDS)
    : [];
  const parts = [anchorToken, ...subjectTokens, ...styleTokens];
  return queryTokens(parts.join(' '), MAX_QUERY_WORDS).join(' ');
}

const MAX_SUBJECT_WORDS = 5;
const MAX_STYLE_WORDS = 2;
const MAX_QUERY_WORDS = 7;

const VISUAL_ROLE_CUES: Record<Script['sections'][number]['label'], string> = {
  hook: 'attention grabbing establishing shot',
  body: 'detailed close up in action',
  cta: 'satisfying final reveal close up',
};

const QUERY_STYLE_HINTS: Record<Script['sections'][number]['label'], string[]> = {
  hook: ['cinematic macro', 'dramatic action', 'dramatic reveal'],
  body: ['cinematic close', 'cinematic macro', 'slow reveal'],
  cta: ['cinematic close', 'final reveal'],
};

const LUXURY_FOOD_STYLE_HINTS: Record<Script['sections'][number]['label'], string[]> = {
  hook: ['extreme close food', 'gold macro leaf', 'chef action food'],
  body: ['food macro detail', 'sauce close pour', 'searing close food'],
  cta: ['gold reveal food', 'plated close food', 'luxury macro food'],
};

const FOOD_COOKING_STYLE_HINTS: Record<Script['sections'][number]['label'], string[]> = {
  hook: ['finished dish close', 'knife action macro', 'sizzle close food'],
  body: ['ingredient prep close', 'pan sauce action', 'crispy texture macro'],
  cta: ['plated dish close', 'sauce pour reveal', 'slice pull macro'],
};

const VISUAL_DESCRIPTOR_TOKENS = new Set([
  'vertical', 'macro', 'close', 'up', 'establishing', 'shot',
  'attention', 'grabbing', 'detailed', 'action', 'satisfying',
  'final', 'reveal', 'cinematic', 'golden', 'yellow', 'rustic', 'texture',
]);

const GENERIC_CONTAINER_TOKENS = new Set([
  'bowl', 'plate', 'jar', 'cup', 'dish', 'container',
]);

/** Common English function words that add search noise rather than visual meaning. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that',
  'these', 'those', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'as', 'by', 'from', 'so', 'if', 'then', 'than', 'not', 'no', 'do',
  'does', 'did', 'be', 'been', 'being', 'you', 'your', 'yours', 'we', 'our',
  'they', 'their', 'he', 'she', 'his', 'her', 'just', 'really', 'still',
  'also', 'very', 'more', 'most', 'some', 'any', 'all', 'can', 'could',
  'should', 'would', 'will', 'shall', 'has', 'have', 'had', 'get', 'gets',
  'got', 'one', 'out', 'up', 'down', 'about', 'into', 'over', 'again',
  'okay', 'surely', 'humans', 'minds', 'entirely', 'yet', 'prove', 'apparently',
  'better', 'taste', 'need',
]);

/**
 * Pulls up to maxWords distinct, meaningful terms out of narration text
 * (order of first appearance), for use as stock-search keywords. Cheap and
 * dependency-free rather than a full NLP pass — good enough to anchor a
 * visual search to what a section actually says.
 */
export function extractKeyPhrases(text: string, maxWords: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      result.push(word);
    }
    if (result.length >= maxWords) break;
  }
  return result;
}

function buildNgramPhrases(words: string[], size: number, maxPhrases: number): string[] {
  const phrases: string[] = [];
  for (let i = 0; i <= words.length - size; i += 1) {
    phrases.push(words.slice(i, i + size).join(' '));
    if (phrases.length >= maxPhrases) break;
  }
  return phrases;
}

function dedupePhrases(phrases: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const phrase of phrases) {
    const compact = queryTokens(phrase, MAX_QUERY_WORDS).join(' ');
    const key = normalizeQueryKey(compact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(compact);
  }
  return unique;
}

function buildCoreSubjectAnchors(script: Script): string[] {
  const titleTokens = queryTokens(script.idea.title, 20);
  const keywordTokens = script.visualKeywords.flatMap((phrase) => queryTokens(phrase, 6));
  const nicheTokens = queryTokens(script.idea.niche, 6);

  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let seenIndex = 0;

  const addTokens = (tokens: string[], weight: number): void => {
    for (const token of tokens) {
      if (!isCoreAnchorCandidate(token)) continue;
      scores.set(token, (scores.get(token) ?? 0) + weight);
      if (!firstSeen.has(token)) firstSeen.set(token, seenIndex);
      seenIndex += 1;
    }
  };

  addTokens(keywordTokens, 3);
  addTokens(titleTokens, 2);
  addTokens(nicheTokens, 1);

  const anchors = [...scores.keys()]
    .sort((a, b) => {
      const scoreDelta = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      const lengthDelta = b.length - a.length;
      if (lengthDelta !== 0) return lengthDelta;
      return (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0);
    })
    .slice(0, 3);

  return anchors.length > 0 ? anchors : ['subject'];
}

const LUXURY_FOOD_TERMS = [
  'burger', 'quesadilla', 'tortilla', 'gouda', 'cheddar', 'potato', 'potatoes', 'steak', 'wagyu', 'beef', 'ham', 'duck', 'pheasant',
  'shrimp', 'prawn', 'fish', 'pork', 'chop', 'caviar', 'sushi', 'dessert', 'chocolate',
  'carbonara', 'truffle', 'saffron', 'honey', 'sauce', 'pasta', 'bread', 'cheese', 'rice',
  'roll', 'matsutake', 'mushroom', 'balsamic', 'olive', 'oil', 'butter', 'cream',
  'tomato', 'garlic', 'carrot', 'cucumber', 'salmon', 'chicken', 'egg', 'eggs',
  'milk', 'meat', 'gold', 'leaf', 'food',
  'dish', 'plate', 'plating', 'meal', 'ingredient', 'chef', 'kitchen',
  'restaurant', 'cooking', 'cook', 'roast', 'sear', 'slice', 'pour',
];

function isFoodCookingScript(script: Script): boolean {
  const niche = script.idea.niche.trim().toLowerCase();
  return niche === 'food-cooking' || niche === 'cooking-recipes' || niche === 'luxury-food';
}

function extractLuxuryFoodTerms(text: string): string[] {
  const allowedTerms = new Set(LUXURY_FOOD_TERMS);
  const matches = queryTokens(text, 80).filter((token) => allowedTerms.has(token));
  const specificMatches = matches.filter((term) =>
    !['food', 'dish', 'plate', 'plating', 'meal', 'ingredient', 'chef', 'kitchen', 'restaurant', 'cooking', 'cook'].includes(term),
  );
  const selected = specificMatches.length > 0 ? specificMatches : matches;
  return selected.length > 0 ? [...new Set(selected)].slice(0, 3) : ['food'];
}

function extractLuxuryFoodSubjectTerms(text: string): string[] {
  const allowedTerms = new Set(LUXURY_FOOD_SUBJECT_TERMS);
  const matches = queryTokens(text, 80).filter((token) => allowedTerms.has(token));
  return matches.length > 0 ? [...new Set(matches)].slice(0, 3) : ['food'];
}

function luxuryFoodShotSubject(anchor: string): string {
  const companion = LUXURY_FOOD_SHOT_COMPANIONS[anchor];
  return companion ?? anchor;
}

function selectFoodAnchor(titleTerms: string[], supportingTerms: string[]): string | undefined {
  const titleAnchor = titleTerms[0];
  const supportingAnchor = supportingTerms[0];
  if (titleAnchor && supportingAnchor && BROAD_FOOD_ANCHORS.has(titleAnchor)) {
    return supportingAnchor;
  }
  return titleAnchor ?? supportingAnchor;
}

const BROAD_FOOD_ANCHORS = new Set([
  'food', 'dish', 'plate', 'meal', 'ingredient', 'mushroom', 'cheese', 'meat',
  'sauce', 'pasta', 'bread',
]);

const LUXURY_FOOD_SHOT_COMPANIONS: Record<string, string> = {
  burger: 'burger',
  quesadilla: 'quesadilla',
  tortilla: 'tortilla',
  carbonara: 'carbonara',
  pork: 'pork chop',
  cheddar: 'cheese',
  gouda: 'cheese',
  olive: 'oil',
  butter: 'butter',
  gold: 'gold leaf',
  honey: 'honey',
  saffron: 'saffron',
  matsutake: 'mushroom',
  shrimp: 'shrimp',
  prawn: 'prawn',
  steak: 'steak',
  wagyu: 'beef',
  caviar: 'caviar',
  sushi: 'sushi',
  truffle: 'truffle',
};

const LUXURY_FOOD_SUBJECT_TERMS = [
  'burger', 'quesadilla', 'tortilla', 'gouda', 'cheddar', 'steak', 'wagyu', 'beef', 'ham', 'duck', 'pheasant',
  'shrimp', 'prawn', 'fish', 'pork', 'chop', 'caviar', 'sushi', 'dessert', 'chocolate',
  'carbonara', 'truffle', 'saffron', 'honey', 'sauce', 'pasta', 'bread', 'cheese', 'rice',
  'roll', 'matsutake', 'mushroom', 'balsamic', 'olive', 'oil', 'butter', 'cream',
  'milk', 'meat',
  'food', 'dish', 'plate', 'meal', 'ingredient', 'roast', 'sear', 'slice',
];

function isCoreAnchorCandidate(token: string): boolean {
  return (
    /[a-z]/.test(token) &&
    !VISUAL_DESCRIPTOR_TOKENS.has(token) &&
    !GENERIC_CONTAINER_TOKENS.has(token)
  );
}

function queryTokens(text: string, maxTokens: number): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  return tokens.slice(0, maxTokens);
}
