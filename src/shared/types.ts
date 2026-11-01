export interface Idea {
  title: string;
  angle: string;
  niche: string;
  visualKeywords: string[];
}

export interface ScriptRequest {
  niche: string;
  idea: Idea;
  targetDurationSec: number;
  channelVoice?: string;
  narrativeArc?: string;
  hookVariants?: string[];
  audienceProfile?: string;
  /** Feedback from a prior TTS measurement when the draft missed the target. */
  durationFeedback?: string;
}

export interface ScriptSection {
  label: 'hook' | 'body' | 'cta';
  text: string;
  startSec: number;
  endSec: number;
}

export interface Script {
  idea: Idea;
  sections: ScriptSection[];
  fullText: string;
  estimatedDurationSec: number;
  visualKeywords: string[];
}

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
}

export interface PipelineManifest {
  version: 1;
  videoId: number;
  contentIdentity: {
    scriptSha256: string;
    metadataSha256: string;
  };
  renderIdentity: {
    path: string;
    durationSec: number;
    width: number;
    height: number;
    captionsPath?: string;
  };
  readinessSha256: string;
  visualValidation?: VisualValidationDecision[];
  generatedAt: string;
}

export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface AudioAsset {
  path: string;
  durationSec: number;
  wordTimings?: WordTiming[];
}

export interface SceneVisualBrief {
  sectionLabel: ScriptSection['label'];
  narrationText: string;
  coreSubjectAnchors: string[];
  requiredVisualTerms: string[];
  /** Terms that must be visible for niche-specific visual grounding. */
  domainRequiredTerms?: string[];
  /** Terms that identify the edible product itself, not merely its source or setting. */
  subjectRequiredTerms?: string[];
  excludedTerms: string[];
  /** Scene-plan objective: one literal sentence describing what the camera must show for this beat. */
  objective?: string;
  /** Concrete things that must be visible for this beat (from the scene plan). */
  mustShow?: string[];
  /** Things that must NOT be what the shot is about (from the scene plan). */
  avoid?: string[];
}

/** One narration beat: a contiguous time window of real speech that gets exactly one visual. */
export interface Beat {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  sectionLabel: ScriptSection['label'];
}

/** What a beat must show and how to search for it. `source` records who authored the plan. */
export interface ScenePlan {
  beat: Beat;
  objective: string;
  /** Ordered most-specific first; each 2-5 concrete words. */
  queries: string[];
  mustShow: string[];
  avoid: string[];
  source: 'llm' | 'heuristic';
}

/** Verdict from looking at the candidate's actual frames against the beat objective. */
export interface VisualMatch {
  score: number;
  matches: boolean;
  reason: string;
  judge: string;
}

export interface VisualValidationDecision {
  sectionLabel: ScriptSection['label'];
  slotIndex: number;
  query: string;
  attempts: Array<{
    query: string;
    candidateIdentity?: string;
    score?: number;
    accepted: boolean;
    reasons: string[];
    metadataOnly: boolean;
    evidenceMode?: 'provider-metadata' | 'query-only';
  }>;
  selectedIdentity?: string;
  selectedScore?: number;
  selectedEvidenceMode?: 'provider-metadata' | 'query-only';
  accepted: boolean;
  reasons: string[];
  /** Scene-plan audit fields (present when the scene planner drove selection). */
  beatIndex?: number;
  beatText?: string;
  startSec?: number;
  endSec?: number;
  objective?: string;
  assetDescription?: string;
  providerTitle?: string;
  matchScore?: number;
  matchReason?: string;
  /** 'verified' = frames judged against the objective; 'unverified' = accepted without it (flagged); 'placeholder' = mock provider. */
  verification?: 'verified' | 'unverified' | 'placeholder';
}

export interface VisualAsset {
  path: string;
  type: 'image' | 'video';
  durationSec?: number;
  /** Stable provider identity when available (for duplicate detection/audit). */
  candidateId?: string;
  /** Non-sensitive provider metadata; never implies pixels were inspected. */
  semanticText?: string;
  semanticTerms?: string[];
  /** Whether semantic fields describe the returned candidate or only the request prompt/query. */
  semanticEvidence?: 'provider-metadata' | 'query-only';
  /** Human-written title/slug from the stock provider (e.g. Pexels page slug), when available. */
  providerTitle?: string;
  /** Pixel-level verdict against the beat objective (set only when frames were actually inspected). */
  visualMatch?: VisualMatch;
  visualValidation?: VisualValidationDecision;
}

export interface SubtitleCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * A short, word-level caption cue (1-3 words) built directly from TTS word
 * timings, used for dynamic pop-in/emphasis-style captions (.ass), as
 * opposed to the coarser fixed-chunk SubtitleCue used for plain .srt.
 */
export interface CaptionCue {
  index: number;
  startSec: number;
  endSec: number;
  words: string[];
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  /** Path to a generated .srt file, once written. */
  srtPath?: string;
  /** Path to a generated word-level .ass file, once written. Takes priority over srtPath when rendering. */
  assPath?: string;
}

/** A short sound effect burned into the mix at a specific timestamp (whoosh on a cut, riser before the CTA, etc). */
export interface SfxCue {
  path: string;
  atSec: number;
  /** Mix volume, 0-1. Defaults to a conservative 0.5 if omitted. */
  volume?: number;
}

export interface RenderInput {
  audio: AudioAsset;
  visuals: VisualAsset[];
  subtitles: SubtitleTrack;
  musicPath?: string;
  sfxCues?: SfxCue[];
  outputBaseName: string;
}

export interface RenderedVideo {
  path: string;
  durationSec: number;
  width: number;
  height: number;
}

export interface UploadResult {
  youtubeId: string;
  url: string;
}

export type VideoStatus =
  | 'draft'
  | 'scripted'
  | 'rendering'
  | 'rendered'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type JobType =
  | 'idea'
  | 'script'
  | 'metadata'
  | 'tts'
  | 'visuals'
  | 'render'
  | 'quality-gate'
  | 'readiness'
  | 'upload'
  | 'analytics';

export type JobStatus = 'pending' | 'running' | 'success' | 'failed';
