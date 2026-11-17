#!/usr/bin/env python3
"""Compare an owner-provided narration take with and without SoundCraft processing."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
module = importlib.util.spec_from_file_location('artcraft_finish', ROOT / 'scripts/artcraft-finish.py')
artcraft = importlib.util.module_from_spec(module)
module.loader.exec_module(artcraft)


def ffmpeg(*args):
    artcraft.run(['ffmpeg', '-n', '-v', 'error', *args])


def measure(path):
    integrated, peak = artcraft.loudness(path)
    if not all(math.isfinite(value) for value in (integrated, peak)):
        raise ValueError('Audio is silent or too short for a meaningful loudness measurement')
    return {'lufs': integrated, 'truePeakDb': peak}


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def duration(file, stream=None):
    command = ['ffprobe', '-v', 'error']
    if stream:
        command += ['-select_streams', stream, '-show_entries', 'stream=duration']
    else:
        command += ['-show_entries', 'format=duration']
    command += ['-of', 'csv=p=0', str(file)]
    value = float(subprocess.check_output(command, text=True).strip())
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f'Cannot determine duration for {file}')
    return value


def compare(args):
    if args.output.exists():
        raise ValueError('Choose a new output directory')
    if (not all(math.isfinite(value) for value in (args.trim_start, args.bed_db, args.at))
            or not 0 <= args.trim_start < 120 or not 0 <= args.at <= 120
            or not -60 <= args.bed_db <= 0):
        raise ValueError('Check trim, placement, or bed level')
    if args.video and duration(args.video, 'v:0') > 120:
        raise ValueError('Choose a review clip of at most 120 seconds')
    with tempfile.TemporaryDirectory(prefix='arabic-voice-') as temp:
        work = Path(temp)
        raw, processed = work / 'take.wav', work / 'processed.wav'
        ffmpeg('-ss', str(args.trim_start), '-i', args.voice, '-vn', '-ac', '1', '-ar', '48000',
               '-t', '121', '-c:a', 'pcm_s24le', raw)
        with wave.open(str(raw), 'rb') as source:
            take_length = source.getnframes() / source.getframerate()
        if not 1 <= take_length <= 120:
            raise ValueError('Use a take between 1 and 120 seconds after trimming')
        length = duration(args.video, 'v:0') if args.video else args.at + take_length
        if args.at + take_length > length + 0.005:
            raise ValueError(f'The {take_length:.2f}s take needs more picture time at {args.at:.2f}s')
        unprocessed = measure(raw)
        bounce = work / 'soundcraft.wav'
        chain = artcraft.soundcraft_voice(raw, bounce)
        # Match loudness after both candidates are in the final mono layout.
        ffmpeg('-i', bounce, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', processed)
        processed_stats = measure(processed)
        if abs(duration(processed) - take_length) > 0.05:
            raise ValueError('SoundCraft changed take length by over 50 ms')
        stats = [unprocessed, processed_stats]
        target = min(-19, *(row['lufs'] - row['truePeakDb'] - 4 for row in stats))
        variants = []
        args.output.mkdir(parents=True)
        position_ms = round(args.at * 1000)
        for label, source, levels in zip(('raw', 'processed'), (raw, processed), stats):
            matched = work / f'{label}-matched.wav'
            gain = target - levels['lufs']
            ffmpeg('-i', source, '-af', f'volume={gain:.6f}dB,apad,atrim=duration={take_length}',
                   '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', matched)
            matched_stats = measure(matched)
            mix = args.output / f'{label}.wav'
            voice_filter = f'adelay={position_ms}:all=1,apad,atrim=duration={length}'
            if args.bed:
                filters = (
                    f'[0:a]{voice_filter}[v];'
                    f'[1:a]aformat=sample_rates=48000:channel_layouts=mono,volume={args.bed_db}dB[b];'
                    '[v][b]amix=inputs=2:duration=first:normalize=0[a]'
                )
                ffmpeg('-i', matched, '-i', args.bed, '-filter_complex', filters, '-map', '[a]',
                       '-c:a', 'pcm_s24le', mix)
            else:
                ffmpeg('-i', matched, '-af', voice_filter, '-c:a', 'pcm_s24le', mix)
            final = mix
            if args.video:
                final = args.output / f'{label}.mp4'
                ffmpeg('-i', args.video, '-i', mix, '-map', '0:v:0', '-map', '1:a:0',
                       '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final)
            variants.append({'name': label, 'file': str(final), 'sha256': digest(final),
                             'gainDb': round(gain, 3), 'voice': matched_stats, 'export': measure(final)})
        difference = abs(variants[0]['voice']['lufs'] - variants[1]['voice']['lufs'])
        checks = {'voiceMatchWithinHalfLufs': difference <= 0.5,
                  'mixMatchWithinHalfLufs': abs(variants[0]['export']['lufs'] - variants[1]['export']['lufs']) <= 0.5,
                  'differentExportBytes': variants[0]['sha256'] != variants[1]['sha256'],
                  'exportTruePeakBelowMinusOneDbtp': all(row['export']['truePeakDb'] <= -1 for row in variants)}
        report = {'sourceSha256': digest(args.voice), 'videoSha256': digest(args.video) if args.video else None,
                  'bedSha256': digest(args.bed) if args.bed else None, 'bedGainDb': args.bed_db if args.bed else None,
                  'trimStartSeconds': args.trim_start, 'voicePositionMs': position_ms,
                  'sourceLevels': unprocessed, 'chain': chain['chain'], 'targetVoiceLufs': target, 'variants': variants, 'checks': checks,
                  'editorialReview': 'pending', 'captionTiming': 'pending'}
        (args.output / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
        return 0 if all(checks.values()) else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voice', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--video', type=Path, help='Optional review MP4; its original audio is replaced')
    parser.add_argument('--bed', type=Path, help='Optional local kitchen sound bed shared by both cuts')
    parser.add_argument('--bed-db', type=float, default=-15, help='Fixed bed gain in dB')
    parser.add_argument('--trim-start', type=float, default=0, help='Seconds to remove from the original take')
    parser.add_argument('--at', type=float, default=0, help='Seconds into the comparison to place the take')
    args = parser.parse_args()
    for name in ('voice', 'video', 'bed', 'output'):
        if (path := getattr(args, name)) is not None:
            setattr(args, name, path.expanduser().resolve())
    try:
        return compare(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    raise SystemExit(main())
