"""Attach measured source and delivery dimensions to an exact final export."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def sha256(file):
    with Path(file).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def dimensions(file):
    result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                             '-show_entries', 'stream=width,height', '-of', 'json', str(file)],
                            capture_output=True, text=True, check=True)
    stream = json.loads(result.stdout)['streams'][0]
    return {'width': stream['width'], 'height': stream['height']}


def record(manifest, video):
    data = json.loads(manifest.read_text())
    sources = []
    for shot in data['shots']:
        file = Path(shot['file'])
        if not file.is_absolute():
            file = manifest.parent / file
        sources.append({'file': str(file.resolve()), 'sha256': sha256(file), **dimensions(file)})
    report = {'schemaVersion': 1, 'outputSha256': sha256(video),
              'nativeSources': sources, 'delivery': dimensions(video)}
    target = video.with_suffix('.provenance.json')
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(target)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--video', required=True, type=Path)
    args = parser.parse_args()
    record(args.manifest.resolve(), args.video.resolve())
