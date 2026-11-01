import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SceneVisualBrief, VisualAsset } from '../../shared/types.js';
import { ProviderError } from '../../shared/errors.js';
import { withRetry, isRetryableProviderError } from '../../shared/retry.js';
import { runFfmpeg } from '../shared/ffmpegExec.js';

export interface VisualSemanticAnalyzer {
  analyze(asset: VisualAsset, brief: SceneVisualBrief): Promise<VisualAsset>;
}

interface GeminiVisionResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

interface VisionResult {
  description: string;
  visibleTerms: string[];
  matchScore?: number;
  matches?: boolean;
  reason?: string;
}

/**
 * Uses one representative video frame to replace query-only evidence with
 * candidate-specific evidence. The analyzer deliberately reports only what
 * is visible in the frame and never treats the search query as proof.
 */
export class GeminiVisualSemanticAnalyzer implements VisualSemanticAnalyzer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly frameDir: string,
  ) {}

  async analyze(asset: VisualAsset, brief: SceneVisualBrief): Promise<VisualAsset> {
    if (asset.type !== 'video') return asset;

    // Two frames (early + later) so one lucky/unlucky still doesn't decide the verdict.
    const frames: string[] = [];
    for (const [i, ss] of ['0.8', '3'].entries()) {
      const framePath = `${this.frameDir}/vision-${randomUUID()}-${i}.jpg`;
      await mkdir(dirname(framePath), { recursive: true });
      try {
        await runFfmpeg(['-ss', ss, '-i', asset.path, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', framePath], 'visual-semantic-analysis');
        frames.push((await readFile(framePath)).toString('base64'));
      } catch {
        // clip shorter than the second sample point: one frame is enough
      } finally {
        await unlink(framePath).catch(() => undefined);
      }
    }
    if (frames.length === 0) throw new ProviderError('gemini-vision', 'Could not extract any frame from the candidate clip.');
    const result = await this.inspectFrame(frames, brief, asset.providerTitle);
    const judged = brief.objective !== undefined && typeof result.matchScore === 'number';
    return {
      ...asset,
      semanticText: result.description,
      semanticTerms: result.visibleTerms,
      semanticEvidence: 'provider-metadata',
      ...(judged
        ? {
            visualMatch: {
              score: Math.max(0, Math.min(1, result.matchScore!)),
              matches: result.matches === true,
              reason: result.reason ?? '',
              judge: `gemini:${this.model}`,
            },
          }
        : {}),
    };
  }

  private async inspectFrame(framesBase64: string[], brief: SceneVisualBrief, providerTitle?: string): Promise<VisionResult> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;
    const judging = brief.objective !== undefined;
    const prompt = judging ? [
      'You are checking stock footage against a shot requirement for a vertical YouTube Short.',
      `Narration at this moment: "${brief.narrationText}"`,
      `Required shot: ${brief.objective}`,
      `Must be visible: ${brief.mustShow?.join('; ') || 'n/a'}`,
      `Must NOT be what the shot is about: ${brief.avoid?.join('; ') || 'n/a'}`,
      `Stock site title for this clip (a hint, may be wrong): ${providerTitle ?? 'unknown'}`,
      `You are given ${framesBase64.length} frame(s) from ONE clip. Describe only what is visible.`,
      'Then judge whether this clip, used as the picture while that narration is spoken, illustrates it: the right subject AND the right action/state.',
      'A related-but-different scene must score 0.3 or lower (for example a restaurant exterior, a menu, or a person eating when the narration is a chef cooking). A generic scenic or abstract shot scores 0.2 or lower.',
      'Score 0.8+ only if a viewer would think "yes, that is exactly what is being described".',
      'Return JSON only: {"description":"short literal description","visibleTerms":["..."],"matchScore":0.0-1.0,"matches":true|false,"reason":"one sentence"}.',
    ].join('\n') : [
      'Inspect this single video frame for semantic visual validation.',
      'Describe only visible content. Do not infer content from the search query or narration.',
      `Narration context: ${brief.narrationText}`,
      `Required visual terms: ${brief.requiredVisualTerms.join(', ') || 'none'}`,
      `Subject anchors: ${brief.coreSubjectAnchors.join(', ') || 'none'}`,
      `Domain-required terms: ${brief.domainRequiredTerms?.join(', ') || 'none'}`,
      `Food-subject terms: ${brief.subjectRequiredTerms?.join(', ') || 'none'}`,
      `Excluded terms: ${brief.excludedTerms.join(', ') || 'none'}`,
      'Return JSON only: {"description":"short literal description","visibleTerms":["term1","term2"]}.',
      'Use visibleTerms for concrete objects, actions, settings, and text actually visible in the frame.',
      'For food and cooking scenes, prioritize what is visibly closest to the camera: identifiable ingredients, hands preparing food, knife work, heat, sauce, texture, plating, slicing, searing, pouring, or the finished dish. Do not treat a distant kitchen, market, landscape, farm, or ingredient source as a recipe step unless the food action or dish is clearly prominent.',
    ].join('\n');

    const data = await withRetry(
      async () => {
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  ...framesBase64.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })),
                ],
              }],
              generationConfig: {
                maxOutputTokens: 400,
                temperature: 0,
                responseMimeType: 'application/json',
              },
            }),
          });
        } catch (error) {
          throw new ProviderError('gemini-vision', 'Failed to reach Gemini vision analysis.', error);
        }
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new ProviderError(
            'gemini-vision',
            `Gemini vision analysis failed with HTTP ${response.status}: ${body.slice(0, 300)}`,
            undefined,
            response.status,
          );
        }
        return (await response.json()) as GeminiVisionResponse;
      },
      { shouldRetry: isRetryableProviderError },
    );

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new ProviderError('gemini-vision', 'Gemini vision response contained no JSON content.');
    }

    let parsed: Partial<VisionResult>;
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, '')) as Partial<VisionResult>;
    } catch (error) {
      throw new ProviderError('gemini-vision', 'Gemini vision response was not valid JSON.', error);
    }
    if (!parsed.description?.trim() || !Array.isArray(parsed.visibleTerms)) {
      throw new ProviderError('gemini-vision', 'Gemini vision response omitted required visual evidence fields.');
    }

    return {
      description: parsed.description.trim(),
      visibleTerms: parsed.visibleTerms.filter(
        (term): term is string => typeof term === 'string' && term.trim().length > 0,
      ),
      ...(typeof parsed.matchScore === 'number' ? { matchScore: parsed.matchScore } : {}),
      ...(typeof parsed.matches === 'boolean' ? { matches: parsed.matches } : {}),
      ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
    };
  }
}
