import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { RenderError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

/** Cinematic renders (supersampled camera moves, bloom, grain) are heavier; override per machine. */
const PROCESS_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS) > 0 ? Number(process.env.FFMPEG_TIMEOUT_MS) : 300_000;

/**
 * Runs the ffmpeg binary with the given args and resolves on exit code 0.
 * This is the ONLY place that shells out to ffmpeg directly; all
 * media/*Provider and VideoRenderer implementations go through this.
 */
export function runFfmpeg(args: string[], probeLabel?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (probeLabel) visualProbe(`${probeLabel} ffmpeg-before`);
    logger.debug('Running ffmpeg', { args });
    const child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new RenderError(`Failed to start ffmpeg: ${err.message}`, err));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        if (probeLabel) visualProbe(`${probeLabel} ffmpeg-after`);
        resolve();
      } else {
        reject(new RenderError(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new RenderError(`ffmpeg timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
  });
}

/**
 * Runs ffmpeg's volumedetect filter over a file's audio track and returns
 * the mean volume in dB (a rendered video whose narration+music+SFX all
 * failed to produce audible sound will read well below normal speech/music
 * levels, e.g. -90dB for true silence vs. -15 to -30dB for a normal mix).
 */
export function getMeanVolumeDb(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-i', path,
      '-af', 'volumedetect',
      '-f', 'null',
      '-',
    ]);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new RenderError(`Failed to start ffmpeg (volumedetect): ${error.message}`, error));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
      if (code === 0 && match?.[1]) {
        resolve(Number.parseFloat(match[1]));
      } else {
        reject(new RenderError(`ffmpeg volumedetect failed with code ${code}: ${stderr.slice(-1000)}`));
      }

    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new RenderError(`ffmpeg volumedetect timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
  });
}

export interface AudioQualityMetrics {
  meanVolumeDb: number;
  maxVolumeDb: number;
  integratedLoudnessLufs?: number;
  truePeakDbfs?: number;
}

/**
 * Collects inexpensive loudness and peak measurements from a rendered audio
 * track. FFmpeg writes these filter reports to stderr, so this deliberately
 * parses the stable summary lines and leaves unavailable metrics undefined.
 */
export function getAudioQualityMetrics(path: string): Promise<AudioQualityMetrics> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-i', path,
      '-af', 'volumedetect,ebur128=peak=true',
      '-f', 'null',
      '-',
    ]);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new RenderError(`Failed to start ffmpeg (audio quality): ${error.message}`, error));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const mean = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
      const max = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
      if (code !== 0 || !mean?.[1] || !max?.[1]) {
        reject(new RenderError(`ffmpeg audio quality probe failed with code ${code}: ${stderr.slice(-1000)}`));
        return;
      }

      const integrated = stderr.match(/Integrated loudness:\s*[\r\n]+\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
      const truePeak = stderr.match(/True peak:\s*[\r\n]+\s*Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/);
      resolve({
        meanVolumeDb: Number.parseFloat(mean[1]),
        maxVolumeDb: Number.parseFloat(max[1]),
        ...(integrated?.[1] ? { integratedLoudnessLufs: Number.parseFloat(integrated[1]) } : {}),
        ...(truePeak?.[1] ? { truePeakDbfs: Number.parseFloat(truePeak[1]) } : {}),
      });
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new RenderError(`ffmpeg audio quality probe timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
  });
}

/** Returns the average luma (YAVG) of a sampled video frame. */
export function getMeanLuminance(path: string, sampleAtSec = 0, probeLabel?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (probeLabel) visualProbe(`${probeLabel} ffmpeg-before`);
    const seekArgs = sampleAtSec > 0 ? ['-ss', sampleAtSec.toFixed(3)] : [];
    const child = spawn('ffmpeg', [
      '-hide_banner',
      ...seekArgs,
      '-i', path,
      '-vf', 'signalstats,metadata=print:file=-',
      '-frames:v', '1',
      '-f', 'null',
      '-',
    ]);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new RenderError(`Failed to start ffmpeg (signalstats): ${error.message}`, error));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const match = output.match(/lavfi\.signalstats\.YAVG=([0-9]+(?:\.[0-9]+)?)/);
      if (code === 0 && match?.[1]) {
        if (probeLabel) visualProbe(`${probeLabel} ffmpeg-after`);
        resolve(Number.parseFloat(match[1]));
      } else {
        reject(new RenderError(`ffmpeg signalstats failed with code ${code}: ${output.slice(-1000)}`));
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new RenderError(`ffmpeg signalstats timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
  });
}

function visualProbe(message: string): void {
  console.log(`[VISUAL-PROBE] ${message}`);
  process.stdout.write('');
}
export function getMediaDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new RenderError(`Failed to start ffprobe: ${error.message}`, error));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const rawStdout = stdout.trim();
      const duration = Number.parseFloat(rawStdout);
      if (code === 0 && Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        if (code === 0) {
          stat(path)
            .then((fileStat) => {
              reject(
                new RenderError(
                  'Local TTS produced an unreadable or empty audio file ' +
                    '(ffprobe returned no usable duration). ' +
                    `path=${path}; size=${fileStat.size} bytes; ` +
                    `stdout=${rawStdout || '<empty>'}; stderr=${stderr.slice(-500) || '<empty>'}`,
                ),
              );
            })
            .catch(() => {
              reject(
                new RenderError(
                  'Local TTS produced an unreadable or empty audio file ' +
                    '(ffprobe returned no usable duration). ' +
                    `path=${path}; size=<unavailable>; ` +
                    `stdout=${rawStdout || '<empty>'}; stderr=${stderr.slice(-500) || '<empty>'}`,
                ),
              );
            });
          return;
        }
        reject(new RenderError(`ffprobe failed with code ${code}: ${stderr.slice(-1000)}`));
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new RenderError(`ffprobe timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
  });
}
