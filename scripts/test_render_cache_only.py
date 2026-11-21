"""Cache-only rendering must fail before either local model starts."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('render_any_local', Path(__file__).with_name('render-any-local.py'))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)


class CacheOnlyTests(unittest.TestCase):
    def test_continuous_shot_uses_previous_motion_end_frame(self):
        studio_plate = Path('oven-plate.png')
        motion_end = Path('shot-one-end.png')
        source = render.select_source(2, None, None, motion_end, True, None, studio_plate)
        self.assertEqual(source, motion_end)

    def test_continuous_shot_never_falls_back_to_the_previous_opening_still(self):
        with self.assertRaisesRegex(ValueError, 'preceding motion clip final frame'):
            render.select_source(2, None, None, None, True, None, Path('oven-plate.png'))

    def test_explicit_user_reference_takes_priority_over_motion_end_frame(self):
        uploaded = Path('shot-two-reference.png')
        source = render.select_source(
            2, uploaded, None, Path('shot-one-end.png'), True, None, Path('oven-plate.png'))
        self.assertEqual(source, uploaded)

    def test_shared_identity_reference_takes_priority_over_the_previous_end_frame(self):
        identity = Path('shot-one-approved.png')
        source = render.select_source(
            2, None, Path('shot-one-end.png'), None, False, identity, Path('oven-plate.png'))
        self.assertEqual(source, identity)

    def test_explicit_chain_images_keep_using_the_previous_end_frame(self):
        identity = Path('shot-one-approved.png')
        motion_end = Path('shot-one-end.png')
        source = render.select_source(2, None, None, motion_end, True, identity, Path('oven-plate.png'))
        self.assertEqual(source, motion_end)

    def test_story_anchor_is_used_after_the_first_scene_without_an_external_anchor(self):
        first_frame = Path('shot-one-approved.png')
        source = render.select_source(2, None, None, None, False, first_frame, None)
        self.assertEqual(source, first_frame)

    def test_motion_end_frame_is_extracted_to_a_clip_hash_named_file(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            clip = work / 'shot-one.mp4'
            subprocess.run([
                'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi',
                '-i', 'color=c=red:s=64x64:r=24:d=1', '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p', str(clip),
            ], check=True)
            end_frame = render.extract_end_frame(work, 0, clip)
            self.assertTrue(end_frame.is_file())
            self.assertGreater(end_frame.stat().st_size, 0)
            self.assertEqual(render.extract_end_frame(work, 0, clip), end_frame)

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
        checks = []

        def unavailable(_reference, _prompt):
            checks.append(True)
            return ('unavailable', 'Ollama is unreachable')

        with self.assertRaisesRegex(RuntimeError, 'vision review is unavailable'):
            render.review_still_with_retries(
                Path('first-frame'), 'A halloumi slab', 'Halloumi', 'a halloumi slab', 1200,
                unavailable,
                lambda prompt, seed: generated.append((prompt, seed)))
        self.assertEqual(generated, [])
        self.assertEqual(len(checks), 2)

    def test_transient_vision_failure_retries_same_frame_before_rejecting_or_regenerating(self):
        checks = []
        generated = []

        def review(reference, _prompt):
            checks.append(reference)
            return ('unavailable', 'Ollama timed out') if len(checks) == 1 else None

        reference, _ = render.review_still_with_retries(
            Path('first-frame'), 'A pizza dough ball', 'Italian pizza', 'pizza dough', 1200,
            review, lambda prompt, seed: generated.append((prompt, seed)))

        self.assertEqual(reference, Path('first-frame'))
        self.assertEqual(checks, [Path('first-frame'), Path('first-frame')])
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
