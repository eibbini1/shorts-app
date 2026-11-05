export type ColorName = 'yellow' | 'cyan' | 'pink' | 'white' | 'purple' | 'teal' | 'orange' | 'red' | 'blue' | 'green';

export interface SpecClip {
  /** Path to a Veo/Flow clip (relative to the repo root or absolute). Its native audio is kept. */
  file: string;
  /** Slow punch-in zoom over the first N seconds (used on the hook gasp). */
  punchInSec?: number;
  punchInZoom?: number;
}

export interface SpecTeaserShot {
  /** Index into clips[] to borrow a frame burst from. */
  clip: number;
  /** Second inside that clip where the flash cut starts. */
  at: number;
  /** Big word shown during this flash. */
  word: string;
  color: ColorName;
}

export interface SpecEvent {
  /** Which clip this event is timed against (0-based). */
  clip: number;
  /** Seconds after the clip starts. */
  at: number;
  dur: number;
  kind: 'stamp' | 'word';
  text: string;
  /** Second line (stamp fun fact). */
  sub?: string;
  color: ColorName;
  /** word only: font size (auto-shrinks to fit). */
  size?: number;
  /** word only: shake animation instead of a plain pop. */
  shake?: boolean;
  /** word only: second line stacked below (e.g. "SHARING" / "IS CARING!"). */
  line2?: { text: string; color: ColorName };
  /** Play a sparkle chime when it appears. */
  sparkle?: boolean;
}

export interface AssembleSpec {
  output: string;
  fps?: number;
  width?: number;
  height?: number;
  /** Small persistent progress tag at the top, e.g. "ABDUL ACROSS AMERICA | STOP 1: ILLINOIS". */
  chip?: string;
  clips: SpecClip[];
  teaser?: SpecTeaserShot[];
  events: SpecEvent[];
  /** Optional royalty-free/original music file mixed quietly under the Veo voices. */
  music?: string;
  musicVolume?: number;
}

export type SceneColorGrade = 'cinema' | 'natural' | 'food';

export interface StillsScene {
  /** Still image (e.g. from Flow/Nano Banana). Relative to the repo root or absolute. */
  image: string;
  /** Optional local footage for the portrait scene. */
  video?: string;
  /** Optional grade for this shot; defaults to the existing cinema look. */
  colorGrade?: SceneColorGrade;
  /** Mix the clip's first audio track at this gain (0–1); omitted means muted. */
  sourceAudioGain?: number;
  /** Hold the final frame when footage is shorter than the scene. Default: loop. */
  videoFill?: 'loop' | 'hold';
  /** Narration for this scene (voiced + captioned word by word). */
  text: string;
  motion?: 'in' | 'out' | 'left' | 'right';
  openingStill?: { image: string; seconds: number };
  pushIn?: { x: number; y: number; holdSec: number };
  /** How this scene is entered from the previous one. Default 'fade' (dip to black). */
  transition?: SceneTransition;
}

/** fade = dip to black, flash = white flash, gold = gold dip, cut = hard cut (no whoosh), punch = hard cut with a brief brightness pop. */
export type SceneTransition = 'fade' | 'flash' | 'gold' | 'cut' | 'punch' | 'whip';
// whip = hard cut with a horizontal motion blur on the last 0.10 s of the outgoing scene and first 0.12 s of the incoming one.

/** Luxury / documentary mode: stills + cinematic camera moves + ElevenLabs narration + gold captions. */
export interface StillsSpec {
  kind: 'stills';
  /** Native portrait export height. Defaults to 1280. */
  portraitHeight?: 1280 | 1920;
  output: string;
  fps?: number;
  voice: { provider: 'elevenlabs' | 'mock'; voiceId?: string; speed?: number; stability?: number; style?: number };
  /** Small gold kicker line shown at the top for the first seconds. */
  kicker?: string;
  /** Tight open: trims dead air before the first word and shows hookText from frame 0. */
  tightOpen?: boolean;
  /** Big on-screen hook (e.g. "$1,000 BURGER") visible from the very first frame for ~2.4 s. */
  hookText?: string;
  brand: { name: string; sub?: string };
  scenes: StillsScene[];
  /** 'ambient' = original synthesized bed, or a path to your own royalty-free track. */
  music?: string;
  musicVolume?: number;
}
