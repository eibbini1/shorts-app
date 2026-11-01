import type { LLMProvider } from '../providers/LLMProvider.js';
import type { Beat, Script, ScenePlan } from '../../shared/types.js';
import { logger } from '../../shared/logger.js';

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that', 'and', 'or', 'but', 'of', 'to',
  'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from', 'so', 'then', 'you', 'your', 'we', 'our', 'they',
  'their', 'he', 'she', 'his', 'her', 'just', 'than', 'not', 'no', 'do', 'does', 'did', 'be', 'will', 'can',
  'would', 'could', 'should', 'have', 'has', 'had', 'into', 'out', 'up', 'down', 'about', 'what', 'how',
]);

export class ScenePlanError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'ScenePlanError';
  }
}

interface RawScene {
  index?: unknown;
  objective?: unknown;
  queries?: unknown;
  mustShow?: unknown;
  avoid?: unknown;
}

/**
 * Turns narration beats into a scene plan: for each beat, WHAT the camera must show
 * (a literal, filmable objective) and HOW to search for it (concrete queries, most specific
 * first). This replaces the old approach of permuting keyword fragments of the section text,
 * which drifted away from what was actually being said (see docs/VISUAL_MATCHING.md).
 *
 * Real LLMs plan with full-script context. The mock provider gets a clearly-labelled
 * heuristic plan so offline runs still work; the label travels with the plan into the manifest.
 */
export class ScenePlanner {
  constructor(private readonly llm: LLMProvider, private readonly useHeuristic = false) {}

  async plan(script: Script, beats: Beat[]): Promise<ScenePlan[]> {
    if (beats.length === 0) throw new ScenePlanError('No narration beats to plan visuals for.');
    if (this.useHeuristic) return beats.map((b) => heuristicPlan(script, b));

    let feedback = '';
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.llm.generateText(buildPrompt(script, beats, feedback), {
        maxTokens: Math.min(6000, 300 + beats.length * 260),
        temperature: 0.4,
      });
      try {
        return parsePlan(raw, beats);
      } catch (error) {
        lastError = error;
        feedback = `\nYour previous answer was rejected: ${error instanceof Error ? error.message : String(error)}. Fix exactly that and answer with JSON only.`;
        logger.warn('Scene plan rejected; retrying once', { error: error instanceof Error ? error.message : String(error) });
      }
    }
    throw new ScenePlanError(
      `Could not obtain a valid scene plan after 2 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      lastError,
    );
  }
}

export function buildPrompt(script: Script, beats: Beat[], feedback = ''): string {
  const lines = beats
    .map((b) => `${b.index}. [${b.startSec.toFixed(1)}-${b.endSec.toFixed(1)}s ${b.sectionLabel}] "${b.text}"`)
    .join('\n');
  return [
    'SCENE_PLAN',
    'You are the editor of a vertical YouTube Short. For EVERY narration beat below, decide the single stock-footage shot that best illustrates what is being said at that moment.',
    `Video title: ${script.idea.title}`,
    `Niche: ${script.idea.niche}`,
    `Full narration: ${script.fullText}`,
    '',
    'Beats (timed to the real voice-over):',
    lines,
    '',
    'Rules:',
    '- "objective": ONE literal sentence describing exactly what the camera sees (subject + action + setting). Filmable, concrete, no metaphors.',
    '- "queries": exactly 3 stock-footage search queries, 2-5 words each. #1 most specific (subject + action), #2 a different angle of the same moment, #3 broader but still the same subject and action. Visible nouns and verbs only; never abstract words (best, secret, trick, amazing).',
    '- "mustShow": 1-3 things that must be visible. "avoid": 1-3 things that would make a shot WRONG for this beat (e.g. a restaurant exterior when a chef is cooking).',
    '- Match MEANING, not keywords. If a beat is abstract (a claim, a question, a call to action), pick the closest literal shot of the video\'s real subject that supports it. Never pick an unrelated or generic scenic shot.',
    '- Consecutive beats should show different shots, but always of the same subject world as the title.',
    `- Return exactly ${beats.length} scenes, one per beat, using the beat index.`,
    'Return JSON only: {"scenes":[{"index":0,"objective":"...","queries":["...","...","..."],"mustShow":["..."],"avoid":["..."]}]}',
    feedback,
  ].join('\n');
}

export function parsePlan(raw: string, beats: Beat[]): ScenePlan[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let json: { scenes?: RawScene[] };
  try {
    json = JSON.parse(text) as { scenes?: RawScene[] };
  } catch {
    throw new ScenePlanError('response was not valid JSON');
  }
  if (!Array.isArray(json.scenes)) throw new ScenePlanError('missing "scenes" array');
  if (json.scenes.length !== beats.length) {
    throw new ScenePlanError(`expected ${beats.length} scenes but got ${json.scenes.length}`);
  }
  return beats.map((beat) => {
    const s = json.scenes!.find((x) => x.index === beat.index);
    if (!s) throw new ScenePlanError(`no scene for beat ${beat.index}`);
    const objective = typeof s.objective === 'string' ? s.objective.trim() : '';
    if (objective.length < 8) throw new ScenePlanError(`beat ${beat.index} has no objective`);
    const queries = strings(s.queries).map((q) => q.replace(/\s+/g, ' ').trim()).filter((q) => q.split(' ').length >= 2 && q.split(' ').length <= 7);
    if (queries.length < 2) throw new ScenePlanError(`beat ${beat.index} needs at least 2 concrete queries of 2-5 words`);
    return {
      beat,
      objective,
      queries: [...new Set(queries)].slice(0, 3),
      mustShow: strings(s.mustShow).slice(0, 3),
      avoid: strings(s.avoid).slice(0, 3),
      source: 'llm' as const,
    };
  });
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

/** Offline-only plan (mock providers). Literal, labelled 'heuristic', never used with real LLMs. */
export function heuristicPlan(script: Script, beat: Beat): ScenePlan {
  const content = beat.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const anchor = script.visualKeywords[0]?.toLowerCase() ?? script.idea.title.toLowerCase().split(/\s+/)[0] ?? 'subject';
  const top = content.slice(0, 3);
  return {
    beat,
    objective: `Show ${top.length ? top.join(', ') : anchor} (${anchor}).`,
    queries: [
      [anchor, ...top.slice(0, 2)].join(' '),
      [anchor, ...top.slice(1, 3)].join(' ') || `${anchor} close up`,
      `${anchor} close up`,
    ],
    mustShow: [anchor],
    avoid: [],
    source: 'heuristic',
  };
}

