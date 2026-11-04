/**
 * createAbdulEpisode.ts
 * =====================
 * CLI entry point for generating a complete "Abdul Across America" episode.
 *
 * Unlike the generic `createShort` CLI (which uses LLM + TTS + Pexels),
 * this script is purpose-built for the Abdul series:
 *   - Uses the AbdulImageProvider (Google Flow / Imagen3) for all visuals
 *   - Script comes from a hand-crafted JSON episode file (no LLM needed)
 *   - TTS narration is optional — pass --audio if you have the .wav already
 *   - Outputs a fully rendered Short (MP4, 9:16, <60s) ready to upload
 *
 * Usage:
 *   npm run create-abdul -- \
 *     --episode episodes/chicago-ep1.json \
 *     [--audio path/to/narration.wav]  (skip to generate TTS)
 *     [--out ./storage/episodes]
 *     [--provider browser|api]         (default: browser)
 *     [--dry-run]                      (plan only, no generation)
 *
 * Environment (see .env.example):
 *   FLOW_PROJECT_ID, ABDUL_PROVIDER, IMAGEN3_API_KEY (if api)
 *   PLAYWRIGHT_WS_ENDPOINT (if reusing your browser bot)
 *   MUSIC_LIBRARY_DIR, SFX_LIBRARY_DIR (optional)
 */

import 'dotenv/config';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { VideoRenderer } from '../media/video/VideoRenderer.js';
import { SubtitleBuilder } from '../media/subtitles/SubtitleBuilder.js';
import { SoundDesignService } from '../media/audio/SoundDesignService.js';
import { AbdulImageProvider, buildAbdulPrompt } from '../media/images/AbdulImageProvider.js';
import { buildBeats } from '../content/scenePlanner/beats.js';
import { getMediaDuration } from '../media/shared/ffmpegExec.js';
import type {
  AudioAsset,
  Script,
  ScriptSection,
  VisualAsset,
  WordTiming,
  Beat,
  ScenePlan,
} from '../shared/types.js';

// ---------------------------------------------------------------------------
// Episode JSON schema
// ---------------------------------------------------------------------------
interface EpisodeFile {
  /** E.g. "Chicago Ep1 — Sharing is Caring" */
  title: string;
  /** E.g. "Chicago, Illinois" */
  location: string;
  /** E.g. "Chicago Ep1" — injected into every image prompt */
  episode: string;
  /** One core life lesson for the episode */
  lesson: string;
  /** The full narration text (will be split into beats automatically) */
  narration: string;
  /**
   * 6-beat visual storyboard — maps directly to the 70-second episode structure.
   * Each beat overrides the auto-generated ScenePlan for that beat index.
   * If fewer beats are provided, the remainder use auto-planning.
   */
  beats: Array<{
    /** Beat index (0-based) */
    index: number;
    /** One sentence describing exactly what the camera sees */
    objective: string;
    /** 1-3 things that MUST be visible */
    mustShow: string[];
    /** 1-3 things to avoid */
    avoid: string[];
    /** Optional: override the mood (default: derived from section label) */
    mood?: string;
    /** Optional: CONTINUITY text — what happened just before this scene */
    continuity?: string;
  }>;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function require(name: string, val: string | undefined): string {
  if (!val) { console.error(`Missing --${name}`); process.exit(1); }
  return val;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const episodePath = resolve(require('episode', arg('episode')));
  const outDir = resolve(arg('out', './storage/episodes')!);
  const audioArg = arg('audio');
  const providerMode = (arg('provider') ?? process.env.ABDUL_PROVIDER ?? 'browser') as 'browser' | 'api';
  const dryRun = flag('dry-run');

  if (!existsSync(episodePath)) {
    console.error(`Episode file not found: ${episodePath}`);
    process.exit(1);
  }

  const ep: EpisodeFile = JSON.parse(readFileSync(episodePath, 'utf8'));
  console.log(`\n🎬  Abdul Across America — ${ep.title}`);
  console.log(`📍  ${ep.location} | Lesson: "${ep.lesson}"\n`);

  mkdirSync(outDir, { recursive: true });
  const episodeSlug = basename(episodePath, extname(episodePath));
  const visualDir = join(outDir, episodeSlug, 'visuals');
  mkdirSync(visualDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. Audio — use provided .wav or stub timing from narration text
  // ---------------------------------------------------------------------------
  let audio: AudioAsset;
  if (audioArg && existsSync(audioArg)) {
    const durationSec = await getMediaDuration(audioArg);
    const words = ep.narration.trim().split(/\s+/);
    const per = durationSec / words.length;
    const wordTimings: WordTiming[] = words.map((word, i) => ({
      word,
      startSec: +(i * per).toFixed(3),
      endSec: +((i + 1) * per).toFixed(3),
    }));
    audio = { path: audioArg, durationSec, wordTimings };
    console.log(`🎙  Audio: ${audioArg} (${durationSec.toFixed(1)}s)`);
  } else {
    // Stub: estimate 70s for a Shorts episode, uniform word timing
    const durationSec = 70;
    const words = ep.narration.trim().split(/\s+/);
    const per = durationSec / words.length;
    const wordTimings: WordTiming[] = words.map((word, i) => ({
      word,
      startSec: +(i * per).toFixed(3),
      endSec: +((i + 1) * per).toFixed(3),
    }));
    // Use a synthesized silent track path as placeholder
    audio = {
      path: join(outDir, episodeSlug, 'narration-placeholder.wav'),
      durationSec,
      wordTimings,
    };
    console.log(`🎙  Audio: stub 70s (add --audio narration.wav for real TTS)`);
  }

  // ---------------------------------------------------------------------------
  // 2. Build a Script object so beats + section labels work correctly
  // ---------------------------------------------------------------------------
  const totalWords = ep.narration.trim().split(/\s+/).length;
  const perWord = audio.durationSec / totalWords;
  const sentences = ep.narration.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [ep.narration];
  let cursor = 0;
  const sections: ScriptSection[] = sentences.map((s, i) => {
    const n = s.split(/\s+/).length;
    const label: ScriptSection['label'] =
      i === 0 ? 'hook' : i === sentences.length - 1 ? 'cta' : 'body';
    const sec: ScriptSection = {
      label,
      text: s,
      startSec: +(cursor * perWord).toFixed(3),
      endSec: +((cursor + n) * perWord).toFixed(3),
    };
    cursor += n;
    return sec;
  });

  const script: Script = {
    idea: {
      title: ep.title,
      angle: ep.lesson,
      niche: 'kids-animation',
      visualKeywords: ep.beats.flatMap((b) => b.mustShow),
    },
    sections,
    fullText: ep.narration,
    estimatedDurationSec: audio.durationSec,
    visualKeywords: ep.beats.flatMap((b) => b.mustShow),
  };

  // ---------------------------------------------------------------------------
  // 3. Beat slicing — use the real beat builder (phrase-aligned, not 2s grid)
  // ---------------------------------------------------------------------------
  let beats: Beat[] = buildBeats(script, audio);
  console.log(`🎞  ${beats.length} narration beats detected`);

  // Scene merge: if every episode beat has an `atText` anchor, group the
  // micro-beats into one scene per anchor (one image per scene, timed to the
  // narration span). Guarantees the last scene lands on the last line.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ep.beats.length > 0 && ep.beats.every((b) => (b as { atText?: string }).atText)) {
    const startIdx = ep.beats.map((b) => {
      const a = norm((b as { atText?: string }).atText!);
      const i = beats.findIndex((bt) => norm(bt.text).startsWith(a));
      if (i < 0) throw new Error(`atText anchor not found in narration beats: "${a}"`);
      return i;
    });
    const merged: Beat[] = [];
    startIdx.forEach((s, k) => {
      const e = k + 1 < startIdx.length ? startIdx[k + 1]! : beats.length;
      const slice = beats.slice(s, e);
      merged.push({
        ...slice[0]!,
        index: ep.beats[k]!.index,
        text: slice.map((x) => x.text).join(' '),
        startSec: slice[0]!.startSec,
        endSec: slice[slice.length - 1]!.endSec,
      });
    });
    beats = merged;
    console.log(`🎞  Merged into ${beats.length} scenes`);
  }

  // ---------------------------------------------------------------------------
  // 4. Resolve scene plans — merge episode beat overrides with auto-heuristics
  // ---------------------------------------------------------------------------
  const plans: Array<ScenePlan & { mood?: string; continuity?: string }> = beats.map((beat) => {
    const override = ep.beats.find((b) => b.index === beat.index);
    if (override) {
      return {
        beat,
        objective: override.objective,
        queries: [
          // Most-specific first: objective → mustShow joined → episode+mustShow
          override.objective,
          override.mustShow.join(' ') + ` ${ep.location}`,
          `Abdul kids ${override.mustShow[0] ?? ''} ${ep.location} animated`,
        ],
        mustShow: override.mustShow,
        avoid: override.avoid,
        source: 'heuristic' as const,
        mood: override.mood,
        continuity: override.continuity,
      };
    }
    // Auto-heuristic from narration text
    const anchor = beat.text.split(/\s+/).filter((w) => w.length > 4)[0] ?? beat.text.slice(0, 20);
    return {
      beat,
      objective: `Abdul (5yo) in ${ep.location}: ${beat.text}`,
      queries: [anchor + ` ${ep.location}`, `kids ${anchor} animated`, anchor],
      mustShow: [anchor],
      avoid: ['text overlay', 'logo'],
      source: 'heuristic' as const,
    };
  });

  // ---------------------------------------------------------------------------
  // 5. Print the full episode plan
  // ---------------------------------------------------------------------------
  console.log(`\n📋  Episode Plan:`);
  for (const p of plans) {
    const { beat, objective, mustShow, avoid } = p;
    console.log(
      `  Beat ${beat.index} [${beat.startSec.toFixed(1)}-${beat.endSec.toFixed(1)}s | ${beat.sectionLabel}]`,
    );
    console.log(`    "${beat.text}"`);
    console.log(`    → ${objective}`);
    console.log(`    ✅ ${mustShow.join(', ')}  🚫 ${avoid.join(', ')}`);
  }

  if (dryRun) {
    console.log(`\n✅  Dry run complete — no images generated.`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. Generate visuals with AbdulImageProvider
  // ---------------------------------------------------------------------------
  console.log(`\n🎨  Generating ${plans.length} images via Google Flow (${providerMode})…`);

  const provider = new AbdulImageProvider({
    provider: providerMode,
    outputDir: visualDir,
    episode: ep.episode,
  });

  const visualAssets: VisualAsset[] = [];
  let prevObjective = '';

  for (const plan of plans) {
    const { beat } = plan;
    const prompt = buildAbdulPrompt(
      {
        sectionLabel: beat.sectionLabel,
        narrationText: beat.text,
        coreSubjectAnchors: plan.mustShow,
        requiredVisualTerms: plan.mustShow,
        excludedTerms: plan.avoid,
        objective: plan.objective,
        mustShow: plan.mustShow,
        avoid: plan.avoid,
      },
      plan,
      {
        continuity: plan.continuity ?? prevObjective,
        location: ep.location,
        episode: ep.episode,
        mood: plan.mood,
      },
    );

    console.log(`\n  [${beat.index + 1}/${plans.length}] Beat ${beat.index} — ${plan.objective.slice(0, 60)}…`);
    if (prevObjective) console.log(`  ↳ continuity: ${prevObjective.slice(0, 60)}…`);

    const [asset] = await provider.getVisuals(plan.queries[0]!, {
      brief: {
        sectionLabel: beat.sectionLabel,
        narrationText: beat.text,
        coreSubjectAnchors: plan.mustShow,
        requiredVisualTerms: plan.mustShow,
        excludedTerms: plan.avoid,
        mustShow: plan.mustShow,
        avoid: plan.avoid,
      },
      plan,
      continuity: plan.continuity ?? prevObjective,
    });

    const beatDur = beat.endSec - beat.startSec;
    visualAssets.push({ ...asset!, durationSec: beatDur });
    prevObjective = plan.objective;
    console.log(`  ✅  Saved → ${asset!.path}`);
  }

  // ---------------------------------------------------------------------------
  // 7. Subtitles (word-level .ass — pop-in Poppins, lower-third safe zone)
  // ---------------------------------------------------------------------------
  console.log(`\n📝  Building captions…`);
  const subtitleBuilder = new SubtitleBuilder();
  const wordCues = subtitleBuilder.buildWordCues(audio, script);
  const assPath = await subtitleBuilder.writeAss(
    wordCues,
    join(outDir, episodeSlug, `${episodeSlug}.ass`),
  );

  // ---------------------------------------------------------------------------
  // 8. Sound design (mood-matched music + SFX cues)
  // ---------------------------------------------------------------------------
  console.log(`🎵  Planning sound design…`);
  const soundDesign = await new SoundDesignService(
    process.env.MUSIC_LIBRARY_DIR,
    process.env.SFX_LIBRARY_DIR,
    join(outDir, episodeSlug, 'sfx-cache'),
  ).plan(script);

  // ---------------------------------------------------------------------------
  // 9. Render — cinematic camera moves, xfade transitions, color grade
  // ---------------------------------------------------------------------------
  console.log(`🎬  Rendering video…`);
  const renderer = new VideoRenderer(join(outDir, episodeSlug));
  const result = await renderer.render({
    audio,
    visuals: visualAssets,
    subtitles: { cues: [], assPath },
    ...(soundDesign.musicPath ? { musicPath: soundDesign.musicPath } : {}),
    sfxCues: soundDesign.sfxCues,
    outputBaseName: episodeSlug,
  });

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------
  console.log(`\n✅  Episode rendered!`);
  console.log(`   📹  ${result.path}`);
  console.log(`   ⏱   ${result.durationSec.toFixed(1)}s  |  ${result.width}×${result.height}`);
  console.log(`\n   Next: npm run upload-video -- --file "${result.path}"`);
  console.log(`   Or:   copy to your phone and upload to YouTube Shorts manually.\n`);
}

main().catch((e) => {
  console.error('\n❌  Episode generation failed:', e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exitCode = 1;
});
