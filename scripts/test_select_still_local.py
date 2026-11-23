import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from select_still_local import select
import select_still_local


class StillSelectorTests(unittest.TestCase):
    def run_review(self, rows, selected, checks=None):
        payload = json.dumps({'selectedIndex': selected, 'candidates': rows, 'reason': 'test'})
        response = io.BytesIO(json.dumps({'message': {'content': payload}}).encode())
        with tempfile.TemporaryDirectory() as folder:
            images = [Path(folder) / f'{i}.png' for i in range(3)]
            for image in images:
                image.write_bytes(b'test image')
            with patch('select_still_local.check_still', return_value=None), patch('select_still_local.urllib.request.urlopen', return_value=response):
                return select(images, 'one hand holding one spoon', checks=checks)

    def test_selects_candidate_that_passes_all_checks(self):
        rows = [
            {'index': 1, 'handsPlausible': False, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': True, 'issues': ['extra finger']},
            {'index': 2, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': True, 'issues': []},
            {'index': 3, 'handsPlausible': True, 'toolContactPlausible': False, 'foodAndSetMatch': True, 'visualChecksPass': True, 'issues': ['floating spoon']},
        ]
        self.assertEqual(self.run_review(rows, 2)[0], 2)
        with self.assertRaisesRegex(ValueError, 'failed its own checks'):
            self.run_review(rows, 1)

    def test_explicit_visual_checks_disqualify_a_candidate_even_if_other_checks_pass(self):
        rows = [
            {'index': 1, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': False, 'issues': ['pineapple missing']},
            {'index': 2, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': True, 'issues': []},
            {'index': 3, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': False, 'issues': ['forbidden olives']},
        ]
        checks = {'mustShow': ['pineapple'], 'mustNotShow': ['olives'], 'questions': []}
        self.assertEqual(self.run_review(rows, 2, checks)[0], 2)
        with self.assertRaisesRegex(ValueError, 'failed its own checks'):
            self.run_review(rows, 1, checks)

    def test_no_candidate_passes_selects_least_flagged_for_review_not_approval(self):
        rows = [
            {'index': 1, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': False, 'visualChecksPass': False, 'issues': ['missing pineapple', 'extra topping']},
            {'index': 2, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': False, 'issues': ['missing pineapple']},
            {'index': 3, 'handsPlausible': False, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'visualChecksPass': False, 'issues': ['extra finger', 'missing pineapple']},
        ]
        chosen, review = self.run_review(rows, 1, {'mustShow': ['pineapple']})
        self.assertEqual(chosen, 2)
        self.assertEqual(review['status'], 'review-required')

    def test_mixed_picture_checks_offer_only_survivors_for_manual_review(self):
        images = [Path(f'{i}.png') for i in range(3)]
        with patch('select_still_local.check_still', side_effect=['too dark', None, 'blank']), \
                patch('select_still_local.urllib.request.urlopen') as vision:
            chosen, review = select(images, 'woman in a red dress at night')
        self.assertEqual(chosen, 2)
        self.assertEqual(review['status'], 'unverified')
        self.assertEqual(review['rejectedCandidates'], {1: 'too dark', 3: 'blank'})
        vision.assert_not_called()

    def test_all_bad_pictures_require_regeneration(self):
        images = [Path(f'{i}.png') for i in range(3)]
        with patch('select_still_local.check_still', return_value='blank'):
            with self.assertRaisesRegex(ValueError, 'All three still candidates'):
                select(images, 'woman in a red dress at night')

    def test_empty_vision_reply_is_provisional_and_does_not_retry(self):
        response = io.BytesIO(json.dumps({'message': {'content': ''}, 'done_reason': 'length'}).encode())
        with tempfile.TemporaryDirectory() as folder:
            images = [Path(folder) / f'{i}.png' for i in range(3)]
            for image in images:
                image.write_bytes(b'test image')
            with patch('select_still_local.check_still', return_value=None), patch('select_still_local.urllib.request.urlopen', return_value=response) as call:
                select_still_local.VISION_UNAVAILABLE = False
                chosen, review = select(images, 'one burger')
                self.assertEqual(chosen, 1)
                self.assertEqual(review['status'], 'unverified')
                select(images, 'another burger')
                self.assertEqual(call.call_count, 1)
        select_still_local.VISION_UNAVAILABLE = False


if __name__ == '__main__':
    unittest.main()
