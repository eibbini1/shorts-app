"""Exact first-frame selections shared by the renderer and Studio."""
import hashlib
import json
from pathlib import Path


def sha256(file):
    with Path(file).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def write_manifest(work, scenario, references):
    work = Path(work).resolve()
    data = {
        'schemaVersion': 1,
        'scenarioSha256': sha256(scenario),
        'frames': [{'shot': i + 1, 'file': str(Path(file).resolve().relative_to(work)),
                    'sha256': sha256(file)} for i, file in enumerate(references)],
    }
    target = work / 'first-frames.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(target)


def read_manifest(work, scenario, count):
    work = Path(work).resolve()
    data = json.loads((work / 'first-frames.json').read_text())
    if data.get('schemaVersion') != 1 or data.get('scenarioSha256') != sha256(scenario):
        raise ValueError('The story changed. Make and review first frames again.')
    if len(data.get('frames', [])) != count:
        raise ValueError('The first-frame set is incomplete.')
    references = []
    for i, frame in enumerate(data['frames']):
        file = (work / frame['file']).resolve()
        if not file.is_relative_to(work) or frame.get('shot') != i + 1 or sha256(file) != frame.get('sha256'):
            raise ValueError('A reviewed frame changed. Make first frames again.')
        references.append(file)
    return references
