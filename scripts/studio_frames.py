"""Exact first-frame selections shared by the renderer and Studio."""
import hashlib
import json
from pathlib import Path
from studio_references import manifest_sha256


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
    if data['frames']:
        data['sharedIdentityReference'] = dict(data['frames'][0])
    reference_hash = manifest_sha256(work)
    if reference_hash:
        data['referenceManifestSha256'] = reference_hash
    target = work / 'first-frames.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(target)


def read_manifest(work, scenario, count):
    references, _ = read_manifest_details(work, scenario, count)
    return references


def read_manifest_details(work, scenario, count):
    work = Path(work).resolve()
    data = json.loads((work / 'first-frames.json').read_text())
    if data.get('schemaVersion') != 1 or data.get('scenarioSha256') != sha256(scenario):
        raise ValueError('The story changed. Make and review first frames again.')
    if data.get('referenceManifestSha256') != manifest_sha256(work):
        raise ValueError('The reference images changed. Make and review first frames again.')
    if len(data.get('frames', [])) != count:
        raise ValueError('The first-frame set is incomplete.')
    references = []
    for i, frame in enumerate(data['frames']):
        file = (work / frame['file']).resolve()
        if not file.is_relative_to(work) or frame.get('shot') != i + 1 or sha256(file) != frame.get('sha256'):
            raise ValueError('A reviewed frame changed. Make first frames again.')
        references.append(file)
    identity = data.get('sharedIdentityReference')
    if identity is not None and not data['frames']:
        raise ValueError('The shared identity reference does not match the first reviewed frame.')
    if identity is not None:
        # Review adds fields (scenarioSha256, reviewedAt, reviewedBy) to frames, so compare identity only.
        keys = ('shot', 'file', 'sha256')
        if any(identity.get(k) != data['frames'][0].get(k) for k in keys):
            raise ValueError('The shared identity reference does not match the first reviewed frame.')
    return references, data
