import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RenderInput, RenderedVideo, SfxCue } from '../../shared/types.js';
import { RenderError } from '../../shared/errors.js';
import { runFfmpeg } from '../shared/ffmpegExec.js';
import {
  FPS, MASTER_CHAIN, NARRATION_CHAIN, STILL_SUPERSAMPLE,
  buildCinematicGrade, escapeFilterPath, pickCameraMove, pickTransition, videoPushExpr,
  type GradeOptions, type SceneRole, type XfadeTransition,
} from './cinematic.js';

const WIDTH = 1080;
const HEIGHT = 1920;
/** Bundled caption fonts (assets/fonts) so captions look identical on every machine. */
const FONTS_DIR = fileURLToPath(new URL('../../../assets/fonts', import.meta.url));
const MUSIC_VOLUME = 0.16;
/** Crossfade length between consecutive scenes; hard cuts read as "stock footage," this reads as "produced." */
const XFADE_DURATION_SEC = 0.4;

/**
 * Composites narration audio + still/video visuals + burned-in subtitles
 * (+ optional background music) into a single vertical 1080x1920 MP4 via
 * FFmpeg. This is the only class that shells out to ffmpeg for rendering;
 * business logic never touches ffmpeg directly (docs/DECISIONS.md D1).
 */
export class VideoRenderer {
  constructor(
    private readonly outputDir: string,
    private readonly grade: GradeOptions = {
      ...(process.env.GRADE_LUT_PATH ? { lutPath: process.env.GRADE_LUT_PATH } : {}),
    },
  ) {}

  async render(input: RenderInput): Promise<RenderedVideo> {
    if (input.visuals.length === 0) {
      throw new RenderError('Cannot render a video with zero visual assets.');
    }

    const outPath = `${this.outputDir}/${input.outputBaseName}.mp4`;
    await mkdir(dirname(outPath), { recursive: true });

    const durationSec = input.audio.durationSec;
    const sceneCount = input.visuals.length;
    const requestedSceneDurations = input.visuals.map(
      (visual) => visual.durationSec ?? durationSec / sceneCount,
    );
    const requestedVisualDuration = requestedSceneDurations.reduce((total, sceneDuration) => total + sceneDuration, 0);
    const durationScale =
      requestedVisualDuration > 0 && Number.isFinite(requestedVisualDuration)
        ? durationSec / requestedVisualDuration
        : 1;
    // Visual sections are planned from the script's nominal timeline, while
    // real TTS providers return the measured narration duration. Scale the
    // complete visual timeline to that measured duration so `-shortest` does
    // not truncate narration when speech runs slightly longer than planned.
    const sceneDurations = requestedSceneDurations.map((sceneDuration) => sceneDuration * durationScale);

    // Consecutive scenes crossfade into each other (see XFADE_DURATION_SEC).
    // This works for any per-scene durations (e.g. hook/body/cta sections of
    // different lengths, or real B-roll clips), not just N equal-length
    // scenes — see buildCrossfadeChain. Each transition shortens the total
    // timeline by xfadeDur, so that total shrink is added back onto the
    // final scene's on-screen duration to keep the overall video exactly as
    // long as the narration (captions/SFX are timed independently off the
    // audio clock, so this doesn't desync anything).
    const canCrossfade = sceneCount >= 2;
    const xfadeDur = canCrossfade
      ? Math.min(XFADE_DURATION_SEC, Math.min(...sceneDurations) * 0.3)
      : 0;
    const totalShrink = canCrossfade ? (sceneCount - 1) * xfadeDur : 0;
    const renderDurations = sceneDurations.slice();
    if (totalShrink > 0) {
      renderDurations[renderDurations.length - 1] =
        (renderDurations[renderDurations.length - 1] ?? 0) + totalShrink;
    }

    const args: string[] = [];

    // Feed one frame per still into zoompan; the filter expands it to the
    // scene duration at 30 FPS while adding a subtle cinematic push-in. Real
    // video clips are passed through as-is and trimmed to the scene duration
    // in the filter graph below (they already carry their own motion).
    for (const visual of input.visuals) {
      if (visual.type === 'image') {
        args.push('-loop', '1', '-framerate', '1', '-t', '1', '-i', visual.path);
      } else {
        args.push('-i', visual.path);
      }
    }

    // Narration audio input.
    const audioInputIndex = input.visuals.length;
    args.push('-i', input.audio.path);

    // Optional background music input, mixed under the narration.
    const hasMusic = Boolean(input.musicPath);
    const musicInputIndex = audioInputIndex + 1;
    if (input.musicPath) {
      args.push('-stream_loop', '-1', '-t', durationSec.toFixed(3), '-i', input.musicPath);
    }

    // Optional SFX cues (whoosh on a cut, riser before the CTA, etc), each a
    // separate short input mixed in at its own timestamp via adelay.
    const sfxCues = input.sfxCues ?? [];
    const sfxInputBaseIndex = musicInputIndex + (hasMusic ? 1 : 0);
    for (const cue of sfxCues) {
      args.push('-i', cue.path);
    }

    const roleOf = (i: number): SceneRole => (i === 0 ? 'hook' : i === sceneCount - 1 ? 'cta' : 'body');
    const scaleFilters = input.visuals
      .map((visual, i) => {
        const visualDuration = renderDurations[i] ?? durationSec / sceneCount;
        const visualFrames = Math.max(2, Math.ceil(visualDuration * FPS));
        if (visual.type === 'image') {
          // Stills get a per-scene "operated camera" move (see cinematic.ts). The image
          // is supersampled first so slow zoompan moves stay smooth instead of jittering
          // on integer pixel steps — the #1 tell of a cheap Ken Burns effect.
          const move = pickCameraMove(i, sceneCount, visualFrames, roleOf(i));
          const ssW = Math.round(WIDTH * STILL_SUPERSAMPLE);
          const ssH = Math.round(HEIGHT * STILL_SUPERSAMPLE);
          return `[${i}:v]scale=${ssW}:${ssH}:force_original_aspect_ratio=increase:flags=lanczos,` +
            `crop=${ssW}:${ssH},setsar=1,` +
            `zoompan=z='${move.zoom}':x='${move.x}':y='${move.y}':` +
            `d=${visualFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},` +
            `settb=1/${FPS},setpts=N/(${FPS}*TB),fps=${FPS}[v${i}]`;
        }
        // Real B-roll clip: cover-crop, add a subtle continuous dolly push (so even static
        // stock clips feel intentional), normalize fps and trim/pad to this scene's slot.
        // Some provider clips are shorter than the slot, so the final frame is held.
        const push = videoPushExpr(visualDuration);
        return `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,` +
          `crop=${WIDTH}:${HEIGHT},setsar=1,fps=${FPS},settb=1/${FPS},` +
          `trim=duration=${visualDuration.toFixed(3)},` +
          `tpad=stop_mode=clone:stop_duration=${visualDuration.toFixed(3)},` +
          `trim=duration=${visualDuration.toFixed(3)},setpts=N/(${FPS}*TB),` +
          `scale=w='${push.w}':h='${push.h}':eval=frame:flags=bicubic,` +
          `crop=${WIDTH}:${HEIGHT},setsar=1,settb=1/${FPS},setpts=N/(${FPS}*TB),fps=${FPS}[v${i}]`;
      })
      .join(';');

    const { filter: joinFilter, outputLabel: joinedLabel } = canCrossfade
      ? buildCrossfadeChain(
          renderDurations,
          xfadeDur,
          Array.from({ length: sceneCount - 1 }, (_, t) => pickTransition(t, sceneCount - 1)),
        )
      : buildConcatChain(sceneCount);

    const joinedFilter = `${scaleFilters};${joinFilter}`;

    // One uniform cinematic grade over the whole joined timeline (not per scene): this
    // is what makes footage from different stock searches read as ONE produced video.
    // Applied before captions are burned in so text stays crisp and untinted.
    const gradedLabel = 'vgraded';
    const g = buildCinematicGrade(this.grade);
    let gradeFilter = `;[${joinedLabel}]${g.pre}`;
    if (g.bloomSplit) {
      // Highlight bloom ("halation"): blurred copy screen-blended at low opacity.
      gradeFilter += `,split[gbase][gglow];[gglow]scale=270:480,gblur=sigma=7,eq=brightness=-0.12:contrast=1.3,scale=${WIDTH}:${HEIGHT}:flags=bicubic[gblurred];` +
        `[gbase][gblurred]blend=all_mode=screen:all_opacity=${g.bloom.toFixed(2)},${g.post}[${gradedLabel}]`;
    } else {
      gradeFilter += `,${g.post}[${gradedLabel}]`;
    }

    // .ass carries its own embedded [V4+ Styles] (per-word emphasis colour,
    // pop-in animation) via the `ass` filter, which respects them as-is.
    // .srt has no styling of its own, so it goes through `subtitles` with an
    // explicit force_style. .ass (word-level, dynamic) is preferred whenever
    // both are present.
    let subtitlesPart: string;
    if (input.subtitles.assPath) {
      subtitlesPart = `;[${gradedLabel}]ass=filename='${escapeForFilter(input.subtitles.assPath)}':fontsdir='${escapeFilterPath(FONTS_DIR)}'[vout]`;
    } else if (input.subtitles.srtPath) {
      subtitlesPart =
        `;[${gradedLabel}]subtitles=filename='${escapeForFilter(input.subtitles.srtPath)}':` +
        `force_style='FontName=DejaVu Sans,FontSize=16,PrimaryColour=&HFFFFFF&,` +
        `OutlineColour=&H000000&,BorderStyle=1,Outline=2,Alignment=2,MarginV=140'[vout]`;
    } else {
      subtitlesPart = `;[${gradedLabel}]null[vout]`;
    }

    let filterComplex = joinedFilter + gradeFilter + subtitlesPart;
    const audioMix = buildAudioMixFilter({
      audioInputIndex,
      musicInputIndex,
      sfxInputBaseIndex,
      hasMusic,
      sfxCues,
    });
    // Master the final mix to ~-14 LUFS / -1.5 dBTP (YouTube's playback target).
    const mixOut = audioMix.filter ? '[aout]' : `[${audioInputIndex}:a]`;
    filterComplex += `${audioMix.filter ? `;${audioMix.filter}` : ''};${mixOut}aresample=48000,${MASTER_CHAIN}[amaster]`;

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[amaster]',
      '-c:v', 'libx264',
      '-preset', process.env.RENDER_PRESET ?? 'medium',
      '-crf', '20',
      // Grain is high-entropy noise: without a rate cap it can balloon to 50+ Mbps.
      '-maxrate', '14M',
      '-bufsize', '28M',
      '-movflags', '+faststart',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-shortest',
      outPath,
    );

    await runFfmpeg(args);

    return { path: outPath, durationSec, width: WIDTH, height: HEIGHT };
  }

}

interface AudioMixOptions {
  audioInputIndex: number;
  musicInputIndex: number;
  sfxInputBaseIndex: number;
  hasMusic: boolean;
  sfxCues: SfxCue[];
}

export function buildAudioMixFilter(options: AudioMixOptions): { filter: string; mapArgs: string[] } {
  const { audioInputIndex, musicInputIndex, sfxInputBaseIndex, hasMusic, sfxCues } = options;
  if (!hasMusic && sfxCues.length === 0) {
    return { filter: '', mapArgs: ['-map', `${audioInputIndex}:a`] };
  }

  const audioParts: string[] = [];
  const mixLabels = ['[narration]'];
  if (hasMusic) {
    // Split narration so it remains in the final mix while its second branch
    // drives compression of the music only when speech is present.
    audioParts.push(
      `[${audioInputIndex}:a]${NARRATION_CHAIN},asplit=2[narration][narrationSidechain]`,
      `[${musicInputIndex}:a]volume=${MUSIC_VOLUME}[music]`,
      '[music][narrationSidechain]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=250:makeup=1[musicDucked]',
    );
    mixLabels.push('[musicDucked]');
  } else {
    audioParts.push(`[${audioInputIndex}:a]${NARRATION_CHAIN}[narration]`);
  }

  sfxCues.forEach((cue, i) => {
    const inputIdx = sfxInputBaseIndex + i;
    const delayMs = Math.max(0, Math.round(cue.atSec * 1000));
    const volume = cue.volume ?? 0.5;
    const label = `sfx${i}`;
    // `all=1` applies the single delay to every channel present, so this
    // works whether the SFX source is mono or stereo.
    audioParts.push(`[${inputIdx}:a]adelay=delays=${delayMs}:all=1,volume=${volume}[${label}]`);
    mixLabels.push(`[${label}]`);
  });

  audioParts.push(
    `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`,
  );
  return { filter: audioParts.join(';'), mapArgs: ['-map', '[aout]'] };
}

/**
 * Chains ffmpeg's `xfade` filter across N pre-scaled [v0..vN-1] streams so
 * consecutive scenes crossfade into each other instead of hard-cutting.
 * Works for scenes of different durations (e.g. a 3s hook next to an 8s
 * body): transition i (1-indexed, combining the running chain with scene i)
 * needs offset = (sum of scene durations before it) - i * xfadeDur, which
 * reduces to the simpler `i * (sceneDur - xfadeDur)` in the equal-duration
 * case. See PHASE6-QUALITY-PLAN.md §3.
 */
export function buildCrossfadeChain(
  sceneDurations: number[],
  xfadeDur: number,
  transitions?: XfadeTransition[],
): { filter: string; outputLabel: string } {
  const sceneCount = sceneDurations.length;
  if (sceneCount <= 1) {
    return { filter: '[v0]null[vjoined]', outputLabel: 'vjoined' };
  }

  const parts: string[] = [];
  let previousLabel = 'v0';
  let cumulative = sceneDurations[0] ?? 0;

  for (let i = 1; i < sceneCount; i++) {
    const offset = cumulative - i * xfadeDur;
    const outputLabel = i === sceneCount - 1 ? 'vjoined' : `x${i}`;
    const rawOutputLabel = `${outputLabel}Raw`;
    parts.push(
      `[${previousLabel}][v${i}]xfade=transition=${transitions?.[i - 1] ?? 'fade'}:duration=${xfadeDur.toFixed(3)}:` +
        `offset=${Math.max(0, offset).toFixed(3)}[${rawOutputLabel}];` +
        `[${rawOutputLabel}]fps=30,settb=1/30[${outputLabel}]`,
    );
    previousLabel = outputLabel;
    cumulative += sceneDurations[i] ?? 0;
  }

  return { filter: parts.join(';'), outputLabel: 'vjoined' };
}

function buildConcatChain(sceneCount: number): { filter: string; outputLabel: string } {
  if (sceneCount === 1) {
    return { filter: '[v0]null[vjoined]', outputLabel: 'vjoined' };
  }

  const inputs = Array.from({ length: sceneCount }, (_, index) => `[v${index}]`).join('');
  return {
    filter: `${inputs}concat=n=${sceneCount}:v=1:a=0,format=yuv420p[vjoined]`,
    outputLabel: 'vjoined',
  };
}

/** Escapes characters that break the ffmpeg subtitles filter's quoted filename arg. */
function escapeForFilter(path: string): string {
  return escapeFilterPath(path);
}
