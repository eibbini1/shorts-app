"""The prompt refiner keeps the writer's food and actions, drops negations, and fills only missing parts."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('refine', Path(__file__).with_name('refine-prompts.py'))
refine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refine)

STUDIO = {'set': 'one warm kitchen: cream stone counter, dark walnut board, copper skillet',
          'lighting': 'Soft warm window light falls from the left side', 'camera': 'Shot close on an 85mm macro lens',
          'cameraMove': 'The camera slowly pushes in toward the food', 'style': 'photoreal food film', 'mood': 'warm'}


class RefineTests(unittest.TestCase):
    def test_image_keeps_subject_first_and_drops_negations(self):
        out = refine.refine_image('A golden baguette slice with melted Gruyere on a walnut board, no text, no logos.', STUDIO)
        self.assertTrue(out.startswith('A golden baguette slice with melted Gruyere'))
        self.assertNotRegex(out.lower(), r'\bno (text|logos)\b')
        self.assertIn('window light', out)
        self.assertIn('85mm', out)
        self.assertTrue(out.endswith('Mood: warm.'))

    def test_image_keeps_existing_lighting_and_lens(self):
        out = refine.refine_image('Macro of pistachio cream, soft warm side light from the left, 100mm lens.', STUDIO)
        self.assertNotIn('window light', out)
        self.assertNotIn('85mm', out)

    def test_motion_keeps_one_camera_move(self):
        out = refine.refine_motion('The hand slides the tray into the oven while the camera follows from the side. '
                                   'No extra fingers.', STUDIO)
        self.assertNotIn('pushes in', out)
        self.assertNotIn('No extra fingers', out)
        self.assertIn('one continuous take', out.lower())

    def test_motion_gets_camera_when_missing(self):
        out = refine.refine_motion('A spoon lifts a bite of cake as cream stretches.', STUDIO)
        self.assertIn('pushes in', out)
        self.assertGreaterEqual(refine.lint.score_motion(out, 5)[0], 85)

    def test_refined_prompt_stays_inside_renderer_schema(self):
        first = 'A chef lifts one dumpling into a dark bowl.'
        long = first + ' ' + 'A soft warm light illuminates the same bowl. ' * 25
        result = refine.refine_image(long, STUDIO)
        self.assertTrue(result.startswith(first))
        self.assertLessEqual(len(result), 1000)
        self.assertTrue(result.endswith('.'))
        with self.assertRaises(ValueError):
            refine.refine_image('A chef ' + 'stirs ' * 210, {})

    def test_refined_prompt_stays_inside_renderer_schema(self):
        first = 'A chef lifts one dumpling into a dark bowl.'
        long = first + ' ' + 'A soft warm light illuminates the same bowl. ' * 25
        result = refine.refine_image(long, STUDIO)
        self.assertTrue(result.startswith(first))
        self.assertLessEqual(len(result), 1000)
        self.assertTrue(result.endswith('.'))
        with self.assertRaises(ValueError):
            refine.refine_image('A chef ' + 'stirs ' * 210, {})

    def test_frame_choice_needs_the_action_not_just_the_word(self):
        frames = {'oven': 'o', 'pan': 'p', 'prep': 'r'}
        shot = lambda text: {'imagePrompt': text, 'motionPrompt': ''}
        self.assertEqual(refine.pick_frame(shot('Paste spooned into an oven-safe dish on the board.'), frames), 'prep')
        self.assertEqual(refine.pick_frame(shot('The hand slides the tray into the oven.'), frames), 'oven')
        self.assertEqual(refine.pick_frame(shot('Shallots soften in the copper skillet.'), frames), 'pan')
        self.assertEqual(refine.pick_frame(shot('Macro of bread; the copper skillet sits softly behind.'), frames), 'prep')


if __name__ == '__main__':
    unittest.main()
