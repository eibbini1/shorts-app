import type { Idea, Script, ScriptRequest, VideoMetadata } from '../../shared/types.js';
export interface LLMProvider { generateText(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> }
export interface IdeaCapableLLMProvider extends LLMProvider {
  generateIdea(niche: string, options?: { recentTitles?: string[] }): Promise<Idea>;
  generateScript(request: ScriptRequest): Promise<Script>;
  generateMetadata(script: Script): Promise<VideoMetadata>;
}
