"""CPU-only contracts for prompt-only background studios."""
import copy
import importlib.util
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
DIRECTOR = runpy.run_path(str(ROOT / 'scripts/director-brief.py'))
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
REFINE = load('refine-prompts')
RENDER = load('render-any-local')
PRESETS = sorted(p for p in (ROOT / 'data/studios').glob('*.json') if p.stem != 'luxury-kitchen')

class BackgroundTests(unittest.TestCase):
    def test_all_everyday_studios_load_validate_and_reach_director_command(self):
        self.assertEqual(len(PRESETS), 31)  # 16 everyday + 15 worldwide
        for path in PRESETS:
            with self.subTest(studio=path.stem):
                studio = json.loads(path.read_text())
                brief = DIRECTOR['validate']({**DIRECTOR['studio_defaults'](path.stem),
                    'topic':'An adult lifts a note, then smiles.', 'seconds':'10', 'audio':'asmr'})
                command = DIRECTOR['draft_command'](brief, 'cpu-test', 'gemma-local')
                self.assertEqual(command[command.index('--set') + 1], studio['set'])
                self.assertEqual(studio['id'], path.stem)
                self.assertLessEqual(len(studio['props']), 3)
    def test_prompt_only_presets_never_claim_reference_images(self):
        for path in PRESETS:
            studio = json.loads(path.read_text())
            self.assertEqual(studio['status'], 'prompt-only')
            self.assertEqual(RENDER.studio_frames(path.stem), {})
    def test_refinement_keeps_action_adds_filmable_camera_and_stays_bounded(self):
        for path in PRESETS:
            with self.subTest(studio=path.stem):
                studio = json.loads(path.read_text())
                image = REFINE.refine_image('An adult holds a note.', studio)
                motion = REFINE.refine_motion('The adult lifts the note.', studio)
                self.assertIn('An adult holds a note', image)
                self.assertIn('The adult lifts the note', motion)
                self.assertIsNotNone(REFINE.lint.LENS.search(image))
                self.assertIsNotNone(REFINE.lint.CAMERA.search(motion))
                self.assertNotRegex(motion.lower(), r'push.in|zoom|orbit')
                self.assertLessEqual(len(image), 1000)
                self.assertLessEqual(len(motion), 1000)
    def test_existing_lens_and_explicit_setting_win(self):
        for path in PRESETS:
            studio = json.loads(path.read_text())
            image = REFINE.refine_image('An adult holds a note, 85mm lens.', studio,
                                        requested_set='a purple tiled room with a brass doorway')
            self.assertIn('85mm', image)
            self.assertIn('purple tiled room', image)
            self.assertNotIn(studio['set'], image)
    def test_references_fail_closed_for_bad_ids_and_missing_plates(self):
        with self.assertRaises(SystemExit):
            RENDER.studio_frames('../outside')
        with self.assertRaises(ValueError):
            DIRECTOR['studio_defaults']('missing-studio')

if __name__ == '__main__':
    unittest.main()
