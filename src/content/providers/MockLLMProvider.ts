import type { IdeaCapableLLMProvider } from './LLMProvider.js';
import type { Idea, Script, ScriptRequest, VideoMetadata } from '../../shared/types.js';
/** Offline test provider. Its invented demonstration text must never be published as facts. */
export class MockLLMProvider implements IdeaCapableLLMProvider {
  async generateText(): Promise<string> { return 'A demonstration of gold-colored dessert.\nHow this test scene is assembled.\nWatch the example come together.'; }
  async generateIdea(niche: string): Promise<Idea> { return { title: 'Offline luxury dessert demonstration', angle: 'Rendering test', niche, visualKeywords: ['dessert', 'gold'] }; }
  async generateScript(request: ScriptRequest): Promise<Script> {
    const lines = ['This is an offline rendering demonstration.', 'These scenes test captions, transitions, and sound design.', 'No factual price or product claim is being made.'];
    const labels = ['hook','body','cta'] as const;
    const duration = request.targetDurationSec;
    return { idea: request.idea, fullText: lines.join(' '), estimatedDurationSec: duration, visualKeywords: request.idea.visualKeywords, sections: lines.map((text,i) => ({label:labels[i]!,text,startSec:i*duration/3,endSec:(i+1)*duration/3})) };
  }
  async generateMetadata(script: Script): Promise<VideoMetadata> { return { title: script.idea.title, description: 'Offline synthetic demonstration. Do not publish as a factual episode.', tags: ['offline-demo'], hashtags: ['#demo'] }; }
}
