#!/usr/bin/env python3
"""Prepare or generate whole-scene Arabic Sofelia narration at natural speed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

from arabic_pronunciation import load_sofelia_dictionary, phrase_key

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / 'data/arabic-voice-profiles/jordanian-female-recipe.json'
MODEL_DIR = ROOT / 'storage/tools/sofelia/model'


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def prepare(spec, profile):
    result = []
    scenes = spec.get('scenes', [])
    if not isinstance(scenes, list) or not scenes:
        raise ValueError('Recipe needs a scenes list')
    ids = set()
    phrases = load_sofelia_dictionary()
    flagged = {tuple(phrase_key(item).split()) for item in profile['checkForAddress']}
    for scene in scenes:
        ident = scene['id']
        if not isinstance(ident, str) or not re.fullmatch(r'[a-z0-9_-]+', ident) or ident in ids:
            raise ValueError('Scene IDs must be unique and safe for local files')
        ids.add(ident)
        line = scene['tts'].strip()
        seconds = scene['seconds']
        if not line or type(seconds) not in (int, float) or not 0 < seconds <= 60:
            raise ValueError(f'Provide narration and a valid time budget for {ident}')
        if not re.search(r'[\u0621-\u064a]', line):
            raise ValueError(f'Arabic narration is required in {ident}')
        key = phrase_key(line)
        tokens = key.split()
        flags = [' '.join(form) for form in sorted(flagged)
                 if any(tuple(tokens[i:i + len(form)]) == form for i in range(len(tokens)))]
        candidates = [phrase for phrase in phrases if f' {phrase} ' in f' {key} ']
        result.append({'id': ident, 'spokenText': line, 'budgetSeconds': seconds, 'addressFlags': flags,
                       'pronunciationNotesToReview': candidates})
    return result


def synthesize(rows, output):
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KModel
    from misaki import espeak

    sys.path.insert(0, str(MODEL_DIR))
    from sofelia_frontend import text_to_phonemes

    torch.set_num_threads(4)
    model = KModel(repo_id='hexgrad/Kokoro-82M', config=str(MODEL_DIR / 'config.json'),
                   model=str(MODEL_DIR / 'kokoro_sofelia_82M.pth')).eval()
    voice = torch.load(MODEL_DIR / 'voices/eliaa.pt', map_location='cpu', weights_only=True)
    g2p = espeak.EspeakG2P(language='ar')
    for row in rows:
        # Sentence punctuation can introduce a pause. Caption boundaries do not split speech.
        sentences = re.split(r'(?<=[.!؟?:])\s+', row['spokenText'])
        audio = []
        for text in sentences:
            phonemes = text_to_phonemes(text, g2p)
            length = len(phonemes)
            if not 0 < length <= min(len(voice), model.context_length - 2):
                raise ValueError(f"Split the long sentence in {row['id']} at a natural pause")
            with torch.inference_mode():
                speech = model(phonemes, voice[length - 1], 1.0, return_output=False)
            audio.append(speech.cpu().numpy().reshape(-1))
        samples = np.concatenate([item for i, chunk in enumerate(audio)
                                  for item in ((np.zeros(6000, dtype=np.float32), chunk) if i else (chunk,))])
        if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 0.005:
            raise ValueError(f"Unusable waveform for {row['id']}")
        file = output / f"{row['id']}.wav"
        sf.write(file, samples, 24000, subtype='PCM_24')
        duration = len(samples) / 24000
        row.update(file=file.name, sha256=digest(file), durationSeconds=round(duration, 3), speed=1,
                   timing='fits' if duration <= row['budgetSeconds'] else 'rewrite-or-extend-picture')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--generate', action='store_true',
                        help='Render WAV stems using the installed Sofelia Python environment')
    args = parser.parse_args()
    runtime = MODEL_DIR.parent / '.venv'
    if args.generate and Path(sys.prefix).resolve() != runtime.resolve():
        python = runtime / 'bin/python'
        if not python.is_file():
            parser.error('The local Sofelia Python environment is missing')
        os.execv(str(python), [str(python), str(Path(__file__).resolve()), *sys.argv[1:]])
    if args.output_dir.exists():
        parser.error('Choose a new output directory')
    profile = json.loads(PROFILE.read_text())
    try:
        rows = prepare(json.loads(args.spec.read_text()), profile)
        args.output_dir.mkdir(parents=True)
        if args.generate and not any(row['addressFlags'] for row in rows):
            synthesize(rows, args.output_dir)
        report = {'profile': profile, 'sourceSha256': digest(args.spec), 'scenes': rows,
                  'pronunciationReview': 'pending', 'captions': 'time-to-selected-take',
                  'experimentalPhrases': 'suggested for review; native frontend used for generation'}
        (args.output_dir / 'voice-preparation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f"{len(rows)} scene(s); {sum(bool(row['addressFlags']) for row in rows)} with address flags.")
        if any(row['addressFlags'] or row.get('timing') == 'rewrite-or-extend-picture' for row in rows):
            return 3
        return 0
    except (KeyError, ValueError, OSError, ImportError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    raise SystemExit(main())
