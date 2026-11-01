/**
 * Unit tests for AbdulImageProvider — prompt-building and provider selection.
 * Generation paths (api / browser) are not tested here since they require
 * live credentials or a running browser. Use `npm run render-demo` with
 * IMAGE_PROVIDER=abdul-flow for an end-to-end smoke test.
 */

import { describe, it, expect } from 'vitest';
import { buildAbdulPrompt } from './AbdulImageProvider.js';
import type { SceneVisualBrief } from '../../shared/types.js';

const baseBrief: SceneVisualBrief = {
  sectionLabel: 'body',
  narrationText: 'Abdul spots a group of kids flying kites on the lakefront.',
  coreSubjectAnchors: ['kite', 'lakefront', 'kids'],
  requiredVisualTerms: ['kite', 'lake', 'sky'],
  excludedTerms: ['car', 'road'],
};

const basePlan = {
  objective: 'Abdul (5yo) runs toward three children flying colorful kites at Chicago lakefront.',
  mustShow: ['kite', 'lakefront', 'children playing'],
  avoid: ['cars', 'text overlays'],
};

describe('buildAbdulPrompt', () => {
  it('includes the Style Bible on every prompt', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan);
    expect(prompt).toContain('Pixar/Disney 3D animation');
    expect(prompt).toContain('white kufi cap');
    expect(prompt).toContain('9:16 vertical');
    expect(prompt).toContain('NO text overlaid');
  });

  it('embeds the ScenePlan objective in the SCENE line', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan);
    expect(prompt).toContain('SCENE:');
    expect(prompt).toContain('Abdul (5yo) runs toward');
  });

  it('lists mustShow elements', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan);
    expect(prompt).toContain('kite');
    expect(prompt).toContain('children playing');
  });

  it('includes an AVOID line when avoid list is non-empty', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan);
    expect(prompt).toContain('AVOID:');
    expect(prompt).toContain('cars');
  });

  it('omits AVOID line when avoid list is empty', () => {
    const prompt = buildAbdulPrompt(baseBrief, { ...basePlan, avoid: [] });
    expect(prompt).not.toContain('AVOID:');
  });

  it('chains CONTINUITY from the previous scene', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan, {
      continuity: 'Abdul just arrived at Navy Pier and waved to the seagulls.',
    });
    expect(prompt).toContain('CONTINUITY:');
    expect(prompt).toContain('Navy Pier');
  });

  it('uses hook section mood → wonder', () => {
    const hookBrief: SceneVisualBrief = { ...baseBrief, sectionLabel: 'hook' };
    const prompt = buildAbdulPrompt(hookBrief, basePlan);
    expect(prompt).toContain('MOOD: wonder');
  });

  it('uses cta section mood → joy', () => {
    const ctaBrief: SceneVisualBrief = { ...baseBrief, sectionLabel: 'cta' };
    const prompt = buildAbdulPrompt(ctaBrief, basePlan);
    expect(prompt).toContain('MOOD: joy');
  });

  it('injects episode label into LOCATION when provided', () => {
    const prompt = buildAbdulPrompt(baseBrief, basePlan, {
      location: 'Chicago',
      episode: 'Chicago Ep1',
    });
    expect(prompt).toContain('LOCATION: Chicago — Chicago Ep1');
  });

  it('truncates narration text in LESSON to 160 chars', () => {
    const longBrief: SceneVisualBrief = {
      ...baseBrief,
      narrationText: 'A'.repeat(300),
    };
    const prompt = buildAbdulPrompt(longBrief, basePlan);
    const lessonLine = prompt.split('\n').find((l) => l.startsWith('LESSON:'))!;
    expect(lessonLine.length).toBeLessThanOrEqual('LESSON: '.length + 160);
  });
});
