import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MakeLocalVideoCliTests(unittest.TestCase):
    def test_attended_review_flags_reach_scenario_validation(self):
        result = subprocess.run([
            'bash', 'scripts/make-local-video.sh', '--scenario',
            'drafts/generated/not-a-real-plan.local-scenario.json',
            '--stills-only', '--best-of-3-stills', '--allow-pending-visual-review',
        ], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Missing scenario:', result.stderr)
        self.assertNotIn('Usage:', result.stderr)

    def test_pending_visual_review_requires_stills_only(self):
        result = subprocess.run([
            'bash', 'scripts/make-local-video.sh', '--scenario',
            'drafts/generated/not-a-real-plan.local-scenario.json',
            '--allow-pending-visual-review',
        ], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('--allow-pending-visual-review requires --stills-only', result.stderr)


if __name__ == '__main__':
    unittest.main()
