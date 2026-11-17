#!/usr/bin/env python3
"""Flag possible Arabic script mismatches using local whisper.cpp or its JSON output."""
import argparse
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unicodedata


def words(text):
    # Ignore typography and optional vowel marks for transcript comparison only.
    mapped = str.maketrans('أإآٱ', 'اااا', 'ـ')
    text = unicodedata.normalize('NFKC', text).translate(mapped)
    text = ''.join(char for char in text if not unicodedata.category(char).startswith('M'))
    return re.findall(r'[^\W_]+', text, flags=re.UNICODE)


def review(script, document):
    if document.get('result', {}).get('language') != 'ar' or document.get('params', {}).get('translate'):
        raise ValueError('Use the Arabic transcription from a multilingual Whisper model')
    if document.get('model', {}).get('multilingual') is not True:
        raise ValueError('Whisper must use a multilingual model')
    expected = words(script)
    if not expected:
        raise ValueError('Expected script is empty')
    segments, recognized, locations = [], [], []
    previous_start = 0
    for segment in document['transcription']:
        start, end = segment['offsets']['from'], segment['offsets']['to']
        if not (type(start) is int and type(end) is int and previous_start <= start < end):
            raise ValueError('Invalid or unordered segment timestamps')
        previous_start = start
        tokens = words(segment['text'])
        if tokens:
            segments.append({'startMs': start, 'endMs': end, 'text': segment['text'].strip()})
            locations.extend([len(segments) - 1] * len(tokens))
            recognized.extend(tokens)
    flags = []
    if not recognized:
        status = 'no-speech-recognized'
    else:
        for operation, i, j, k, l in SequenceMatcher(None, expected, recognized, autojunk=False).get_opcodes():
            if operation == 'equal':
                continue
            first = locations[k] if k < len(locations) else locations[-1]
            last = locations[l - 1] if l > k else first
            flags.append({'kind': operation, 'scriptWords': expected[i:j], 'recognizedWords': recognized[k:l],
                          'reviewWindowMs': [segments[first]['startMs'], max(row['endMs'] for row in segments[first:last + 1])]})
        status = 'review-flags' if flags else 'normalized-script-match'
    return {'schemaVersion': 1, 'language': 'ar', 'targetDialect': 'ar-JO',
            'status': status, 'segments': segments, 'flags': flags,
            'pronunciationVerdict': 'pending-native-listen',
            'timingPrecision': 'segment review windows, not word alignment'}


def transcribe(voice, cli, model):
    with tempfile.TemporaryDirectory(prefix='arabic-transcript-') as directory:
        stem = Path(directory) / 'take'
        wave = stem.with_suffix('.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(voice), '-vn', '-ac', '1', '-ar', '16000',
                        '-c:a', 'pcm_s16le', str(wave)], check=True)
        subprocess.run([cli, '-m', str(model), '-f', str(wave), '-l', 'ar', '-oj', '-of', str(stem)],
                       stdout=subprocess.DEVNULL, check=True)
        return json.loads(stem.with_suffix('.json').read_text(encoding='utf-8'))


def transcribe_mlx(voice, model_path):
    # Keep the optional runtime out of the normal Whisper.cpp environment.
    try:
        from mlx_audio.stt.utils import load
    except ImportError as exc:
        raise ValueError(f'Run the MLX check with a working MLX Audio Python environment: {exc}') from exc
    # Some MLX conversions include auxiliary alignment heads for word timings.
    # This check uses segment timestamps and can load those checkpoints.
    model = load(model_path)
    if not model.is_multilingual:
        raise ValueError('Use a multilingual Whisper checkpoint for Arabic')
    result = model.generate(str(voice), language='ar', task='transcribe',
                            verbose=None, condition_on_previous_text=False)
    duration_ms = round(float(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', str(voice)
    ], text=True).strip()) * 1000)
    # Whisper can estimate overlapping segments or continue beyond a short clip.
    # Discard segments outside the recording and bound the remaining windows.
    rows = []
    for row in result.segments or []:
        start = max(0, round(row['start'] * 1000))
        end = min(duration_ms, round(row['end'] * 1000))
        if end <= start:
            continue
        rows.append({'text': row['text'], 'offsets': {'from': start, 'to': end}})
    rows.sort(key=lambda row: row['offsets']['from'])
    return {'model': {'multilingual': True}, 'result': {'language': result.language},
            'params': {'translate': False}, 'transcription': rows}


def shoot_gate(report, native_review):
    errors = []
    if report['inputKind'] != 'recording':
        errors.append('The recognizer must process the actual recording on this run.')
    if report['status'] == 'no-speech-recognized':
        errors.append('No speech was recognized in the recording.')
    if not isinstance(native_review, dict):
        native_review = {}
    bound = (native_review.get('audioSha256') == report['inputSha256']
             and native_review.get('scriptSha256') == report['scriptSha256'])
    if not bound:
        errors.append('An independent Arabic listen must be tied to this exact recording and script.')
    if not str(native_review.get('reviewer') or '').strip():
        errors.append('Name the Arabic-speaking reviewer.')
    if not all(native_review.get(field) is True for field in (
            'listenedFullTake', 'checkedJordanianPronunciation', 'checkedSentenceDelivery')):
        errors.append('Confirm a full listen, Jordanian pronunciation, and sentence delivery.')
    if native_review.get('verdict') != 'pass':
        errors.append('The Arabic listener has not approved this take.')
    if report['flags'] and not str(native_review.get('transcriptFlagResolution') or '').strip():
        errors.append('Resolve the transcription flags against the recording.')
    return {'passed': not errors, 'blockers': errors}


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script', required=True, type=Path, help='Exact spoken Arabic script in UTF-8')
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument('--voice', type=Path, help='Source audio. Requires --model and an installed whisper-cli.')
    inputs.add_argument('--whisper-json', type=Path, help='Existing whisper.cpp JSON transcript')
    parser.add_argument('--whisper-cli', default='whisper-cli')
    parser.add_argument('--model', type=Path)
    parser.add_argument('--mlx-model', type=Path, help='Optional local multilingual Whisper MLX directory')
    parser.add_argument('--before-shoot', action='store_true', help='Exit nonzero until audio and pronunciation are cleared')
    parser.add_argument('--native-review', type=Path, help='Hash-bound Arabic listening review JSON')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.output.exists():
            raise ValueError('Choose a new report path')
        if args.mlx_model and (not args.voice or args.model or not args.mlx_model.is_dir()):
            raise ValueError('Use --mlx-model with an existing local model directory and --voice')
        if args.voice:
            if args.mlx_model:
                document = transcribe_mlx(args.voice, args.mlx_model)
            else:
                if not shutil.which(args.whisper_cli) or not args.model or not args.model.is_file():
                    raise ValueError('Supply an installed whisper-cli and a local multilingual --model file')
                document = transcribe(args.voice, args.whisper_cli, args.model)
        else:
            document = json.loads(args.whisper_json.read_text(encoding='utf-8'))
        report = review(args.script.read_text(encoding='utf-8-sig'), document)
        report['scriptSha256'] = sha(args.script)
        report['inputSha256'] = sha(args.voice or args.whisper_json)
        report['inputKind'] = 'recording' if args.voice else 'transcript'
        if args.before_shoot:
            approval = json.loads(args.native_review.read_text(encoding='utf-8')) if args.native_review else None
            report['shootGate'] = shoot_gate(report, approval)
            if report['shootGate']['passed']:
                report['pronunciationVerdict'] = 'approved-by-native-listener'
        with args.output.open('x', encoding='utf-8') as target:
            json.dump(report, target, ensure_ascii=False, indent=2)
            target.write('\n')
        print(f"{report['status']}: {len(report['flags'])} possible script mismatch(es). {report['pronunciationVerdict']}.")
        if args.before_shoot:
            if not report['shootGate']['passed']:
                for reason in report['shootGate']['blockers']:
                    print(f'BLOCKED: {reason}')
                return 3
            print('PASS: this recording is cleared for the shoot.')
        return 0
    except (OSError, ValueError, TypeError, KeyError, subprocess.CalledProcessError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    raise SystemExit(main())
