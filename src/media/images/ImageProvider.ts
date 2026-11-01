import type { SceneVisualBrief, VisualAsset } from '../../shared/types.js';

export interface ImageOptions {
  count?: number;
  probeLabel?: string;
  excludeCandidateIds?: string[];
  /** Pass the full SceneVisualBrief so providers can use objective/mustShow/avoid */
  brief?: SceneVisualBrief;
  /** Pass the resolved ScenePlan for richer prompt building */
  plan?: { objective: string; mustShow: string[]; avoid: string[] };
  /** CONTINUITY text from the previous beat (AbdulImageProvider) */
  continuity?: string;
}

export interface ImageProvider {
  /**
   * Returns candidate VisualAssets for a given query string.
   * Called once per narration beat by VideoPipelineService.
   */
  getVisuals(query: string, opts?: ImageOptions): Promise<VisualAsset[]>;

  /**
   * Optional: inspect the candidate against the beat brief and return an
   * updated asset with a `visualMatch` verdict. When absent, the pipeline
   * treats the provider as a placeholder (no pixel inspection).
   */
  validateVisual?(asset: VisualAsset, brief: SceneVisualBrief): Promise<VisualAsset>;

  /**
   * Optional: called once before the per-beat loop so a provider can reset
   * session state (e.g. AbdulImageProvider resets its CONTINUITY chain).
   */
  beginVisualSession?(): void;
}
