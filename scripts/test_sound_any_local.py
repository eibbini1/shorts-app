import json
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from runtime_env import media_python  # noqa: E402

VENVPY = media_python(ROOT)


class SoundtrackIntentTests(unittest.TestCase):
    @unittest.skipUnless(VENVPY.is_file(), 'local soundtrack environment is unavailable')
    def test_explicit_no_music_produces_exact_silent_track(self):
        scenario = {'audioPlan': {'music': 'none'},
                    'plan': {'shots': [{'seconds': 2}, {'seconds': 3}]}}
        with tempfile.TemporaryDirectory() as folder:
            scenario_path = Path(folder) / 'scenario.json'
            scenario_path.write_text(json.dumps(scenario))
            subprocess.run([str(VENVPY), str(ROOT / 'scripts/sound-any-local.py'),
                            str(scenario_path), folder], check=True, capture_output=True)
            with wave.open(str(Path(folder) / 'soundtrack.wav')) as sound:
                self.assertEqual(sound.getnframes(), 5 * sound.getframerate())
                self.assertEqual(set(sound.readframes(sound.getnframes())), {0})


if __name__ == '__main__':
    unittest.main()
