"""Regression checks for the pre-motion vision gate's fail-closed behavior."""
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('check_still_vision', Path(__file__).with_name('check-still-vision.py'))
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)


class VisionGateTests(unittest.TestCase):
    def test_missing_ingredient_blocks_and_report_is_cached(self):
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / 'shot.png'
            image.write_bytes(b'fake image for mocked API')
            response = {'done_reason': 'stop', 'message': {'content': json.dumps({
                'answer': 'no', 'reason': 'whole garlic cloves, not diced shallots'})}}
            with patch.object(vision.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as call:
                report, path = vision.review(image, 'diced shallots in the pan',
                                             questions=['Is the pan full of diced shallots?'])
                self.assertEqual(report['status'], 'review-required')
                self.assertIn('whole garlic cloves', json.loads(path.read_text())['verdict']['missingOrWrong'][0])
                self.assertEqual(report['checks'][0]['kind'], 'direct')
                vision.review(image, 'diced shallots in the pan',
                              questions=['Is the pan full of diced shallots?'])
                self.assertEqual(call.call_count, 1)

    def test_empty_model_answer_fails_closed_and_is_not_cached_as_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / 'shot.png'
            image.write_bytes(b'fake image for mocked API')
            empty = {'done_reason': 'stop', 'message': {'content': ''}}
            good = {'done_reason': 'stop', 'message': {'content': json.dumps({
                'answer': 'yes', 'reason': 'a baguette slice is visible'})}}
            with patch.object(vision.urllib.request, 'urlopen', side_effect=[
                    io.BytesIO(json.dumps(empty).encode()), io.BytesIO(json.dumps(good).encode())]) as call:
                self.assertEqual(vision.review(image, 'a baguette slice')[0]['status'], 'unavailable')
                self.assertEqual(vision.review(image, 'a baguette slice')[0]['status'], 'pass')
                self.assertEqual(call.call_count, 2)

    def test_forbidden_item_must_be_absent(self):
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / 'shot.png'
            image.write_bytes(b'fake image for mocked API')
            bread = {'done_reason': 'stop', 'message': {'content': json.dumps({
                'answer': 'yes', 'reason': 'bread is visible'})}}
            potato = {'done_reason': 'stop', 'message': {'content': json.dumps({
                'answer': 'yes', 'reason': 'a halved potato is visible'})}}
            with patch.object(vision.urllib.request, 'urlopen', side_effect=[
                    io.BytesIO(json.dumps(bread).encode()), io.BytesIO(json.dumps(potato).encode())]):
                report, _ = vision.review(image, 'bread', must_show=('bread',), must_not_show=('a halved potato',))
            self.assertEqual(report['status'], 'review-required')
            self.assertEqual([c['expected'] for c in report['checks']], ['yes', 'no'])
            self.assertIn('halved potato', report['verdict']['missingOrWrong'][0])

    def test_invalid_answer_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / 'shot.png'
            image.write_bytes(b'fake image for mocked API')
            bad = {'done_reason': 'stop', 'message': {'content': json.dumps({'answer': 'maybe', 'reason': ''})}}
            with patch.object(vision.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(bad).encode())):
                self.assertEqual(vision.review(image, 'bread', questions=['Is this bread?'])[0]['status'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
