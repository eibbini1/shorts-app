import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from select_still_local import select


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


if __name__ == '__main__':
    unittest.main()
