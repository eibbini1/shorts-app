import importlib.util
import unittest
from unittest.mock import Mock
from pathlib import Path


SCRIPT = Path(__file__).with_name('render-any-local.py')
SPEC = importlib.util.spec_from_file_location('render_any_local', SCRIPT)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


class StillReviewRetryTests(unittest.TestCase):
    def test_locked_rolling_checks_include_both_states(self):
        before = 'An irregular chocolate mound and separate zest rest on the board.'
        after = 'A round formed truffle rests on the board.'
        checks = renderer.fixed_stage_checks({'sceneState': {'before': before, 'after': after}},
                                             {'questions': ['Is chocolate visible?']})
        self.assertEqual(checks['mustShow'], [before])
        self.assertEqual(checks['mustNotShow'], [after])
        self.assertEqual(checks['questions'], ['Is chocolate visible?'])

    def test_explicit_locked_checks_keep_visible_facts_without_dish_inference(self):
        shot = {'sceneState': {'before': 'Orange zest sits beside the bowl.',
                               'after': 'Chocolate has been scooped out.'}}
        checks = {'mustShow': ['Thin orange strands'], 'mustNotShow': ['A chocolate mound on the board']}
        self.assertEqual(renderer.fixed_stage_checks(shot, checks, explicit=True), checks)
        with self.assertRaisesRegex(ValueError, 'required and forbidden'):
            renderer.fixed_stage_checks(shot, {'mustShow': ['Orange strands']}, explicit=True)

    def test_uncertain_final_review_blocks_motion(self):
        generate = Mock(return_value='retake')
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            renderer.review_still_with_retries(
                'first', 'roll chocolate', 'truffle', 'an irregular mound', 1200,
                lambda *_: ('review-required', 'uncertain visual match'), generate)
        generate.assert_called_once()

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
