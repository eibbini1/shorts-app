import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from select_still_local import select
import select_still_local


class StillSelectorTests(unittest.TestCase):
    def run_review(self, rows, selected):
        payload = json.dumps({'selectedIndex': selected, 'candidates': rows, 'reason': 'test'})
        response = io.BytesIO(json.dumps({'message': {'content': payload}}).encode())
        with tempfile.TemporaryDirectory() as folder:
            images = [Path(folder) / f'{i}.png' for i in range(3)]
            for image in images:
                image.write_bytes(b'test image')
            with patch('select_still_local.check_still', return_value=None), patch('select_still_local.urllib.request.urlopen', return_value=response):
                return select(images, 'one hand holding one spoon')

    def test_selects_candidate_that_passes_all_checks(self):
        rows = [
            {'index': 1, 'handsPlausible': False, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'issues': ['extra finger']},
            {'index': 2, 'handsPlausible': True, 'toolContactPlausible': True, 'foodAndSetMatch': True, 'issues': []},
            {'index': 3, 'handsPlausible': True, 'toolContactPlausible': False, 'foodAndSetMatch': True, 'issues': ['floating spoon']},
        ]
        self.assertEqual(self.run_review(rows, 2)[0], 2)
        with self.assertRaisesRegex(ValueError, 'failed its own checks'):
            self.run_review(rows, 1)

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
