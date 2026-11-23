import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('preflight', ROOT / 'scripts/preflight-short.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class HardMotionTest(unittest.TestCase):
    def test_pack_warnings_are_specific_to_the_selected_pack(self):
        pack = preflight.motion_pack('gadgets-product-reveals')
        self.assertIn('tiny buttons', preflight.pack_motion_warning(pack, 'A hand presses tiny buttons'))
        self.assertIsNone(preflight.pack_motion_warning(pack, 'A device rotates in warm light'))
        self.assertIsNone(preflight.pack_motion_warning(preflight.motion_pack('unknown'), 'tiny buttons'))

    def test_all_pack_patterns_compile_and_find_a_risk(self):
        examples = {
            'single-object-transformation': 'disassembling',
            'solo-challenge-comparison': 'collisions',
            'practical-how-to': 'tying a knot',
            'stylized-character-mini-story': 'crowds',
            'animals': 'sprinting',
            'gadgets-product-reveals': 'tiny buttons',
            'travel-scenic-reveal': 'whip pan',
            'realistic-fast-sports-fights': 'tackling',
            'realistic-hand-heavy-cooking': 'flipping',
        }
        for pack_id, action in examples.items():
            with self.subTest(pack_id=pack_id):
                self.assertIn(action, preflight.pack_motion_warning(preflight.motion_pack(pack_id), action))

    def test_flags_contact_actions(self):
        self.assertEqual(preflight.hard_motion('A hand flips the patty while slicing the bun'), ['flips', 'slicing'])

    def test_ignores_safe_motion_and_word_fragments(self):
        self.assertEqual(preflight.hard_motion('Cheese melts, jalapeno slices drop, crust crackles, hard cut to plate'), [])
        self.assertEqual(preflight.hard_motion('Cheese melts, steam rises, the camera pushes in'), [])
        self.assertEqual(preflight.hard_motion('a cutting board rests; a whisked sauce shines'), [])
        self.assertEqual(preflight.hard_motion(None), [])

    def test_warning_is_printed_and_never_blocks(self):
        shot = {'narration': '', 'seconds': 5, 'motionPrompt': 'A hand lifts the spatula and flips the patty'}
        data = {'topic': 'burger', 'plan': {'title': 'Burger test', 'shots': [shot]},
                'settings': {'seconds': 15}, 'presentation': {'mode': 'asmr'}}
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / 's.json'
            f.write_text(json.dumps(data))
            r = subprocess.run([sys.executable, str(ROOT / 'scripts/preflight-short.py'), str(f)], capture_output=True, text=True, cwd=ROOT)
        self.assertIn('hand-tool contact action (flips)', r.stdout + r.stderr)
        self.assertNotIn('BLOCKED: shot 1: hand-tool', r.stdout)


if __name__ == '__main__':
    unittest.main()
