"""Generate or edit one local FLUX.2 Klein reference image on Apple Silicon."""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from flux_prompt import check_prompt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'storage/models/flux2-klein-4b-4bit'
BIN = ROOT / 'storage/tools/mflux/.venv/bin'


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--source', type=Path, action='append', default=[],
                        help='Existing reference image; repeat up to three times')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--width', type=int, default=384)
    parser.add_argument('--height', type=int, default=640)
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    sources = [source.expanduser().resolve() for source in args.source]
    if len(sources) > 3 or len(set(sources)) != len(sources):
        parser.error('provide at most three distinct source images')
    if any(not source.is_file() for source in sources):
        parser.error('source image does not exist')
    source = sources[0] if sources else None
    if output.exists() or output.with_suffix('.json').exists(): parser.error('output or provenance already exists')
    if args.width < 256 or args.height < 256 or args.width % 16 or args.height % 16:
        parser.error('width and height must be multiples of 16 and at least 256')
    for item in (MODEL / 'transformer/0.safetensors', MODEL / 'text_encoder/0.safetensors'):
        if not item.is_file(): parser.error(f'Model incomplete: {item}. Run bash scripts/setup-mflux-mac.sh')
    prompt_notes = check_prompt(args.prompt)
    if prompt_notes:
        print(f'FLUX prompt note: {"; ".join(prompt_notes)}', file=sys.stderr)
    command = [BIN / ('mflux-generate-flux2-edit' if source else 'mflux-generate-flux2'),
               '--model', MODEL, '--base-model', 'flux2-klein-4b', '--prompt', args.prompt,
               '--width', args.width, '--height', args.height, '--steps', 4,
               '--seed', args.seed, '--low-ram', '--output', output]
    if sources: command.extend(['--image-paths', *sources])
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(item) for item in command], cwd=ROOT, check=True)
    if not output.is_file():
        raise SystemExit('Image generator exited without creating an image. Check Mac power and Metal GPU access, then retry.')
    record = {'createdAt': datetime.now(timezone.utc).isoformat(),
              'model': 'mlx-community/flux2-klein-4b-4bit',
              'revision': '860e87183ceb29e39627c0612ebd66d8ea66e68c',
              'runtime': 'mflux==0.24.0', 'prompt': args.prompt,
              'promptNotes': prompt_notes, 'seed': args.seed,
              'width': args.width, 'height': args.height,
              'source': str(source) if source else None,
              'sourceSha256': digest(source) if source else None,
              'outputSha256': digest(output)}
    if len(sources) > 1:
        record['sources'] = [{'path': str(path), 'sha256': digest(path)} for path in sources]
    output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n')
    print(f'Local FLUX image and provenance saved: {output}')

if __name__ == '__main__': main()
