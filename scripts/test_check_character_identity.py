import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'character_identity', Path(__file__).with_name('check-character-identity.py'))
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class CalibrationTest(unittest.TestCase):
    def test_only_large_drops_get_an_advisory(self):
        baseline = {'floor': 0.70}
        self.assertFalse(identity.apply_baseline({'score': 0.60}, baseline)['largeDropAdvisory'])
        self.assertTrue(identity.apply_baseline({'score': 0.54}, baseline)['largeDropAdvisory'])
        self.assertNotIn('largeDropAdvisory', identity.apply_baseline({'score': None}, baseline))

    @unittest.skipUnless((identity.MODELS / 'SHA256SUMS').exists(), 'local models required')
    def test_existing_wrong_character_controls(self):
        folder = identity.ROOT / 'storage/claude-experiments/identity-across-studios-20261124'
        if not folder.exists():
            self.skipTest('local cross-studio stills required')
        try:
            checker = identity.Checker()
        except ModuleNotFoundError as exc:
            if exc.name != 'cv2':
                raise
            self.skipTest('run in the face-check environment')
        report = identity.calibrate(checker, folder)
        controls = [row for row in report['rows'] if not row['same']]
        self.assertEqual(len(controls), 66)
        self.assertEqual(sum(row['slot'] == 'cross-studio' for row in controls), 18)
        self.assertIsNone(report['threshold'])
        self.assertTrue(all(row['passed'] is None for row in report['rows']))
        studio = [row for row in report['rows'] if row['same'] and row['slot'] == 'cross-studio']
        cafe = next(row for row in studio if row['image'].endswith('--std-hanoi-tube-cafe.png'))
        self.assertLess(cafe['faceHeightPx'], 112)
        self.assertEqual(cafe['status'], 'cannot-judge')
        self.assertIsNone(cafe['score'])
        self.assertEqual(sum(row['score'] is not None for row in studio), 5)
        self.assertEqual([b['count'] for b in report['baselines'].values()], [7, 7, 7])


if __name__ == '__main__':
    unittest.main()
