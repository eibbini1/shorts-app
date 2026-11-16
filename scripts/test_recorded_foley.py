import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('add_sfx', Path(__file__).with_name('add-sfx.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RecordedFoleyTests(unittest.TestCase):
    def test_missing_real_action_and_room_block_asmr(self):
        data = {'settings': {'presentationMode': 'asmr', 'seconds': 3},
                'plan': {'shots': [{'seconds': 3, 'sound': 'loud sizzle', 'motionPrompt': 'beef sizzles'}]},
                'audioPlan': {'sfxPolicy': 'recordings-only', 'foleySamples': {}}}
        problems = module.audit_cues(data)
        self.assertTrue(any('sizzle needs a matching field recording' in item for item in problems))
        self.assertTrue(any('real room ambience' in item for item in problems))


if __name__ == '__main__':
    unittest.main()
