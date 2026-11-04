import type { IdeaCapableLLMProvider } from '../providers/LLMProvider.js';
import type { TrendService } from '../trends/YouTubeTrendService.js';
import type { AnalyticsRepository } from '../../database/AnalyticsRepository.js';
import type { VideosRepository } from '../../database/VideosRepository.js';
export class IdeaGenerator {
  constructor(private readonly llm: IdeaCapableLLMProvider, private readonly trends?: TrendService, private readonly analytics?: AnalyticsRepository, private readonly videos?: VideosRepository) {}
  async generate(niche: string, options: { recentTitles?: string[] } = {}) {
    const idea = await this.llm.generateIdea(niche, options);
    if (!idea.title?.trim() || !idea.angle?.trim() || !Array.isArray(idea.visualKeywords)) throw new Error('Provider returned an invalid idea');
    if (options.recentTitles?.some(t => t.toLowerCase().trim() === idea.title.toLowerCase().trim())) throw new Error('Provider returned an already-used idea title');
    return idea;
  }
}
