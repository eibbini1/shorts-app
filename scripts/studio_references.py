"""Validated local per-shot reference images for Studio renders."""
import hashlib
import json
import re
from pathlib import Path


REFERENCE_FILE = re.compile(r'^references/shot-(\d+)-[0-9a-f]{16}\.(?:png|jpg)$', re.I)


def sha256(file):
    digest = hashlib.sha256()
    with Path(file).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def manifest_sha256(work):
    manifest = Path(work).resolve() / 'references.json'
    return sha256(manifest) if manifest.is_file() else None


def load_reference_manifest(work, scenario, shot_count):
    work = Path(work).resolve()
    manifest = work / 'references.json'
    if not manifest.is_file():
        return {}
    data = json.loads(manifest.read_text())
    if data.get('schemaVersion') != 1 or data.get('scenarioSha256') != sha256(scenario):
        raise ValueError('Reference images belong to an older version of this story. Upload them again.')
    rows = data.get('references')
    if not isinstance(rows, list):
        raise ValueError('The reference-image manifest is invalid.')
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('The reference-image manifest is invalid.')
        shot = row.get('shot')
        name = row.get('file')
        if not isinstance(shot, int) or isinstance(shot, bool) or not 1 <= shot <= shot_count or shot in result:
            raise ValueError('The reference-image manifest has an invalid shot number.')
        if not isinstance(name, str) or not REFERENCE_FILE.fullmatch(name):
            raise ValueError(f'The reference image for shot {shot} has an invalid path.')
        match = REFERENCE_FILE.fullmatch(name)
        if not match or int(match.group(1)) != shot:
            raise ValueError(f'The reference image path does not match shot {shot}.')
        file = (work / name).resolve()
        if not file.is_relative_to(work) or not file.is_file() or sha256(file) != row.get('sha256'):
            raise ValueError(f'The reference image for shot {shot} changed. Upload it again.')
        result[shot] = file
    return result
