import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('render-any-local.py')
SPEC = importlib.util.spec_from_file_location('render_any_local', SCRIPT)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


class StillReviewRetryTests(unittest.TestCase):
    def run_rejected_review(self, allow_pending_review):
        reviewed = []

        def review(reference, prompt):
            reviewed.append(reference)
            return 'review-required', 'missing required ingredient'

        def generate(prompt, seed):
            return f'repaired-{seed}'

        return renderer.review_still_with_retries(
            'initial', 'pizza prompt', 'pizza', 'pineapple', 1200,
            review, generate, attempts=2, allow_pending_review=allow_pending_review)

    def test_rejected_frame_remains_blocked_by_default(self):
        with self.assertRaisesRegex(RuntimeError, 'still rejects'):
            self.run_rejected_review(False)

    def test_attended_review_can_keep_last_rejected_candidate_for_human_approval(self):
        reference, prompt = self.run_rejected_review(True)
        self.assertEqual(reference, 'repaired-9119')
        self.assertIn('pineapple', prompt)

    def test_attended_review_does_not_spend_repair_generations_when_vision_is_unavailable(self):
        reviewed = []

        def review(reference, prompt):
            reviewed.append(reference)
            return 'unavailable', 'Ollama is offline'

        def generate(prompt, seed):
            self.fail('Vision outage should not trigger a repair generation')

        reference, prompt = renderer.review_still_with_retries(
            'initial', 'pizza prompt', 'pizza', 'pineapple', 1200,
            review, generate, attempts=2, allow_pending_review=True)
        self.assertEqual((reference, prompt), ('initial', 'pizza prompt'))
        self.assertEqual(reviewed, ['initial', 'initial'])


if __name__ == '__main__':
    unittest.main()
