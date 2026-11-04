import type { AudioAsset } from '../../shared/types.js';
export interface TTSProvider { synthesize(text: string, options?: { targetDurationSec?: number }): Promise<AudioAsset> }
