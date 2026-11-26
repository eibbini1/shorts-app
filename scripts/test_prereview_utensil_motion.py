"""Regression checks for ordered-frame utensil screening."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name('prereview-local-video.py')
SPEC = importlib.util.spec_from_file_location('prereview_local_video', MODULE)
prereview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prereview)


class UtensilMotionTest(unittest.TestCase):
    def setUp(self):
        self.shot = {
            'imagePrompt': 'A fork on the counter behind a dessert.',
            'motionPrompt': 'The teaspoon presses the crust and leaves a fracture.',
        }

    def test_sampler_covers_entry_and_exit_without_crossing_cuts(self):
        samples = prereview.utensil_timeline(5, 10)
        self.assertEqual(samples, [5.15, 5.9, 6.9, 7.9, 8.95, 9.85])
        self.assertEqual(prereview.utensil_for(self.shot), 'teaspoon')
        self.assertIsNone(prereview.utensil_for({'motionPrompt': 'The fox leaps.'}))

    def test_questions_include_tool_path_and_visible_change(self):
        path, contact = prereview.utensil_questions(self.shot, 'teaspoon')
        self.assertIn('read left to right', path)
        self.assertIn('duplicating', path)
        self.assertIn('leaves a fracture', contact)
        self.assertIn('contact', contact)

    def test_fault_is_preserved_and_skipped_check_is_unavailable(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            with patch.object(prereview, 'grab', side_effect=lambda _v, _t, output, **_kw: output) as grab, \
                 patch.object(prereview, 'contact_sheet', return_value=work / 'sheet.png') as sheet, \
                 patch.object(prereview, 'ask', return_value={'status': 'review-required', 'issues': ['spoon jumps']}) as ask:
                result = prereview.check_utensil_motion('test.mp4', [(0, 5)], [self.shot], work, object())
            self.assertEqual(grab.call_count, 6)
            self.assertEqual(len(sheet.call_args.args[0]), 6)
            self.assertEqual(len(ask.call_args.args[2]), 2)
            self.assertEqual(result[0]['status'], 'review-required')
            self.assertEqual(result[0]['issues'], ['spoon jumps'])
            unchecked = prereview.check_utensil_motion('test.mp4', [(0, 5)], [self.shot], work)
            self.assertEqual(unchecked[0]['status'], 'unavailable')
