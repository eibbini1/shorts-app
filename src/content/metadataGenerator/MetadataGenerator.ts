import type { IdeaCapableLLMProvider } from '../providers/LLMProvider.js';
import type { TrendService } from '../trends/YouTubeTrendService.js';
import type { Script } from '../../shared/types.js';
export class MetadataGenerator {
  constructor(private readonly llm: IdeaCapableLLMProvider, private readonly trends?: TrendService) {}
  async generate(script: Script) {
    const metadata = await this.llm.generateMetadata(script);
    if (!metadata.title?.trim() || metadata.title.length > 100 || typeof metadata.description !== 'string' || !Array.isArray(metadata.tags)) throw new Error('Invalid generated metadata');
    return metadata;
  }
}
