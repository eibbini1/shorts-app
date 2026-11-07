"""Store a human-reviewed local shot as reusable prompt experience."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG = ROOT / 'storage/learning/shot-reviews.jsonl'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset', type=Path, required=True)
    parser.add_argument('--subject', required=True)
    parser.add_argument('--image-prompt', required=True)
    parser.add_argument('--motion-prompt', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--score-action', type=int, required=True)
    parser.add_argument('--score-continuity', type=int, required=True)
    parser.add_argument('--score-appeal', type=int, required=True)
    parser.add_argument('--notes', default='')
    parser.add_argument('--approve-for-reuse', action='store_true')
    parser.add_argument('--log', type=Path, default=DEFAULT_LOG)
    args = parser.parse_args()
    asset = args.asset.expanduser().resolve()
    if not asset.is_file(): parser.error('asset must exist')
    for label in ('score_action', 'score_continuity', 'score_appeal'):
        if not 0 <= getattr(args, label) <= 5:
            parser.error(f'{label} must be 0–5')
    for label in ('subject', 'image_prompt', 'motion_prompt', 'model', 'notes'):
        if len(getattr(args, label)) > (1000 if 'prompt' in label else 500):
            parser.error(f'{label} is too long')
    log = args.log.expanduser().resolve()
    record = {'reviewedAt': datetime.now(timezone.utc).isoformat(),
              'asset': str(asset), 'sha256': sha256(asset), 'subject': args.subject,
              'imagePrompt': args.image_prompt, 'motionPrompt': args.motion_prompt,
              'model': args.model, 'scores': {'action': args.score_action,
              'continuity': args.score_continuity, 'appeal': args.score_appeal},
              'notes': args.notes, 'approvedForReuse': args.approve_for_reuse}
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a') as target:
        target.write(json.dumps(record, ensure_ascii=False) + '\n')
    print(f'Recorded reviewed shot in {log}')

if __name__ == '__main__': main()
