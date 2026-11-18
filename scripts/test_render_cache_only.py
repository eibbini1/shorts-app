"""Cache-only rendering must fail before either local model starts."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('render_any_local', Path(__file__).with_name('render-any-local.py'))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)


class CacheOnlyTests(unittest.TestCase):
    def test_voice_pause_needs_continuous_audio_bed(self):
        self.assertTrue(render.sound_led_pauses({'audioPlan': {'music': 'licensed-track'}}))
        self.assertTrue(render.sound_led_pauses({'audioPlan': {'music': 'none', 'foleySamples': {'room': {}}}}))
        self.assertFalse(render.sound_led_pauses({'audioPlan': {'music': 'none'}}))

    def test_missing_still_stops_before_flux(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'missing approved still'):
                render.still(Path(folder), 0, {'imagePrompt': 'A glass jar'}, 1200,
                             None, 384, 640, cache_only=True)

    def test_missing_clip_stops_before_ltx(self):
        with tempfile.TemporaryDirectory() as folder:
            reference = Path(folder) / 'still.png'
            reference.write_bytes(b'reference')
            with self.assertRaisesRegex(RuntimeError, 'missing valid motion'):
                render.clip(Path(folder), 0, 0, {'motionPrompt': 'A spoon rises'}, 2200,
                            reference, 384, 640, 'model', 'gemma', lambda: '', cache_only=True)


class StillReviewRetryTests(unittest.TestCase):
    def test_bad_frame_gets_a_specific_prompt_and_only_that_shot_is_regenerated(self):
        initial = Path('first-frame')
        generated = []
        repaired = []

        def review(reference, prompt):
            return ('review-required', 'The image looks like bread, not cheese.') if reference == initial else None

        def generate(prompt, seed):
            generated.append((prompt, seed))
            return Path('repaired-frame')

        reference, prompt = render.review_still_with_retries(
            initial, 'Cut the cheese into even slabs.', 'Golden Halloumi with Hot Honey',
            'Cut the halloumi into even slabs', 1200, review, generate,
            lambda revised, attempt, reason: repaired.append((revised, attempt, reason)))

        self.assertEqual(reference, Path('repaired-frame'))
        self.assertEqual(len(generated), 1)
        self.assertEqual(generated[0][1], 1200 + 7919)
        self.assertIn('Golden Halloumi with Hot Honey', prompt)
        self.assertIn('Cut the halloumi into even slabs', prompt)
        self.assertIn('bread, not cheese', prompt)
        self.assertEqual(len(repaired), 1)

    def test_unavailable_vision_gate_does_not_waste_more_image_generations(self):
        generated = []
        with self.assertRaisesRegex(RuntimeError, 'vision review is unavailable'):
            render.review_still_with_retries(
                Path('first-frame'), 'A halloumi slab', 'Halloumi', 'a halloumi slab', 1200,
                lambda _reference, _prompt: ('unavailable', 'Ollama is unreachable'),
                lambda prompt, seed: generated.append((prompt, seed)))
        self.assertEqual(generated, [])

    def test_exhausted_retries_keep_the_last_vision_reason(self):
        generated = []
        with self.assertRaisesRegex(RuntimeError, 'after 2 attempts: still bread'):
            render.review_still_with_retries(
                Path('first-frame'), 'Cut cheese', 'Halloumi', 'cut halloumi', 1200,
                lambda _reference, _prompt: ('review-required', 'still bread'),
                lambda prompt, seed: generated.append((prompt, seed)))
        self.assertEqual(len(generated), 1)

    def test_scenario_repair_keeps_a_pristine_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            scenario = Path(folder) / 'story.json'
            scenario.write_text('{"imagePrompt":"original"}\n', encoding='utf-8')
            render.save_repaired_scenario(scenario, {'imagePrompt': 'repaired'})
            render.save_repaired_scenario(scenario, {'imagePrompt': 'repaired again'})

            backup = Path(folder) / 'story.before-still-repair.json'
            self.assertEqual(backup.read_text(encoding='utf-8'), '{"imagePrompt":"original"}\n')
            self.assertEqual(json.loads(scenario.read_text(encoding='utf-8')), {'imagePrompt': 'repaired again'})


if __name__ == '__main__':
    unittest.main()
