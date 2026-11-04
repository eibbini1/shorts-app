import type { IdeaCapableLLMProvider } from '../providers/LLMProvider.js';
import type { TTSProvider } from '../../media/tts/TTSProvider.js';
import type { Idea } from '../../shared/types.js';
export class ScriptGenerator {
  constructor(private readonly llm: IdeaCapableLLMProvider, private readonly tts: TTSProvider) {}
  async generateWithAudio(idea: Idea, targetDurationSec: number, options: { hookVariants?: string[] } = {}) {
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const script = await this.llm.generateScript({ idea, niche: idea.niche, targetDurationSec, ...options, durationFeedback: feedback });
      if (!script.fullText?.trim() || !script.sections?.length) throw new Error('Provider returned an empty script');
      const audio = await this.tts.synthesize(script.fullText, { targetDurationSec });
      if (!Number.isFinite(audio.durationSec) || audio.durationSec <= 0) throw new Error('Invalid narration duration');
      if (Math.abs(audio.durationSec - targetDurationSec) <= Math.max(2, targetDurationSec * 0.2)) return { script, audio };
      feedback = 'Measured narration was ' + audio.durationSec + ' seconds; target is ' + targetDurationSec + '. Adjust word count.';
    }
    throw new Error('Narration missed target duration after two script attempts');
  }
}
