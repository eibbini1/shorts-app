import type { IdeaCapableLLMProvider } from '../providers/LLMProvider.js';
import type { Idea } from '../../shared/types.js';
export class HookGenerator {
  constructor(private readonly llm: IdeaCapableLLMProvider) {}
  async generateVariants(idea: Idea, count = 3): Promise<string[]> {
    const raw = await this.llm.generateText('Write ' + count + ' short opening lines, one per line, for: ' + idea.title + '. Use only supplied facts; do not invent prices or claims.');
    return [...new Set(raw.split(/\r?\n/).map(s => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean))].slice(0,count);
  }
}
