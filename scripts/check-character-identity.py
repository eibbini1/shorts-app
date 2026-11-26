"""Measure identity consistency for fictional Studio characters using approved references."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'storage/tools/face-check-models'
MIN_FACE_HEIGHT = 112
LARGE_DROP = 0.15
REFS = ROOT / 'storage/studio-characters'


class Checker:
    def __init__(self, min_face_height=MIN_FACE_HEIGHT):
        import cv2

        self.min_face_height = min_face_height
        self.cv = cv2
        cv2.setNumThreads(1)
        self.detector = cv2.FaceDetectorYN.create(
            str(MODELS / 'face_detection_yunet_2023mar.onnx'), '', (320, 320))
        self.matcher = cv2.FaceRecognizerSF.create(
            str(MODELS / 'face_recognition_sface_2021dec.onnx'), '')
        self.cache = {}

    def feature(self, path):
        if path not in self.cache:
            self.cache[path] = self.extract(path)
        return self.cache[path]

    def extract(self, path):
        image = self.cv.imread(str(path))
        if image is None:
            return 'unreadable-image', None, None
        self.detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = self.detector.detect(image)
        if faces is None or len(faces) == 0:
            return 'no-face', None, None
        if len(faces) != 1:
            return 'multiple-faces', None, None
        height = float(faces[0][3])
        if height < self.min_face_height:
            return 'tiny-face', None, height
        aligned = self.matcher.alignCrop(image, faces[0])
        return None, self.matcher.feature(aligned).copy(), height

    def score(self, path, references):
        reason, feature, height = self.feature(path)
        result = dict(image=str(path), faceFound=reason in (None, 'tiny-face', 'multiple-faces'),
                      reason=reason, faceHeightPx=height, score=None, passed=None,
                      status='cannot-judge')
        if reason:
            return result
        scores = {}
        for slot, ref in references.items():
            ref_reason, ref_feature, _ = self.feature(ref)
            if ref_reason:
                continue
            scores[slot] = self.matcher.match(feature, ref_feature, self.cv.FaceRecognizerSF_FR_COSINE)
        if not scores:
            return dict(result, reason='no-usable-reference')
        score = max(scores.values())
        return dict(result, status='scored', score=score, referenceScores=scores)


def approved_views(character):
    views = {}
    for slot, entry in character.get('referenceSheet', {}).items():
        if entry is None:
            continue
        ref_id = entry.get('refId', '')
        if not re.fullmatch(r'[0-9a-f]{32}', ref_id):
            raise ValueError(f'Invalid reference ID for {slot}')
        path = REFS / f'{ref_id}.png'
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry.get('sha256'):
            raise ValueError(f'Approved reference hash mismatch: {slot}')
        views[slot] = path
    return views


def characters():
    return json.loads((ROOT / 'data/characters.json').read_text())['characters']


def apply_baseline(row, baseline):
    if row['score'] is not None and baseline:
        drop = max(0, baseline['floor'] - row['score'])
        row.update(belowSheetFloorBy=drop, largeDropAdvisory=drop >= LARGE_DROP)
    return row


def sheet_baseline(checker, views):
    scores = []
    for slot, path in views.items():
        if slot == 'hands':
            continue
        refs = {key: views[key] for key in ('front', 'three-quarter') if views[key] != path}
        score = checker.score(path, refs)['score']
        if score is not None:
            scores.append(score)
    return dict(count=len(scores), floor=min(scores), maximum=max(scores)) if scores else None


def calibrate(checker, folder):
    sheets = {c['id']: approved_views(c) for c in characters() if c.get('referenceSheet')}
    sheets = {key: views for key, views in sheets.items() if {'front', 'three-quarter'} <= views.keys()}
    rows = []
    for owner, views in sheets.items():
        candidates = list(views.items())
        candidates += [('cross-studio', p) for p in sorted(folder.glob(f'{owner}--*.png'))]
        for slot, path in candidates:
            for target, target_views in sheets.items():
                references = {k: v for k, v in target_views.items()
                              if k in ('front', 'three-quarter') and v != path}
                rows.append(dict(checker.score(path, references), slot=slot,
                                 owner=owner, target=target, same=owner == target))
    baselines = {owner: sheet_baseline(checker, views) for owner, views in sheets.items()}
    for row in rows:
        if row['same'] and row['slot'] == 'cross-studio':
            apply_baseline(row, baselines[row['owner']])
    return dict(threshold=None, minFaceHeightPx=checker.min_face_height,
                largeDropMargin=LARGE_DROP, baselines=baselines, rows=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character')
    parser.add_argument('--min-face-height', type=int, default=MIN_FACE_HEIGHT)
    parser.add_argument('--calibrate', type=Path)
    parser.add_argument('images', nargs='*', type=Path)
    args = parser.parse_args()
    if args.calibrate is None and (not args.character or not args.images):
        parser.error('provide --calibrate or a --character and images')
    if args.min_face_height < MIN_FACE_HEIGHT:
        parser.error(f'minimum face height must be at least {MIN_FACE_HEIGHT} px')
    checker = Checker(args.min_face_height)
    if args.calibrate is not None:
        result = calibrate(checker, args.calibrate)
    else:
        character = next((c for c in characters() if c['id'] == args.character), None)
        if character is None:
            parser.error('unknown catalogue character')
        views = approved_views(character)
        if not {'front', 'three-quarter'} <= views.keys():
            parser.error('both approved face views are required')
        refs = {slot: views[slot] for slot in ('front', 'three-quarter')}
        baseline = sheet_baseline(checker, views)
        result = [apply_baseline(checker.score(
            path, {slot: ref for slot, ref in refs.items() if ref.resolve() != path.resolve()}),
            baseline) for path in args.images]
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
