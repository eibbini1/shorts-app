import os
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = Path(os.environ.get('SHORTS_MEDIA_PY') or (ROOT / 'storage/tools/ComfyUI/.venv/bin/python'))
SCRIPT = ROOT / 'scripts/sound-any-local.py'
SCENARIO = ROOT / 'examples/local-scenarios/red-curry-dumpling-bake-30.local-scenario.json'


class LicensedMusicTests(unittest.TestCase):
    def test_actual_track_is_rendered_and_missing_track_blocks(self):
        data = json.loads(SCENARIO.read_text())
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            scenario = folder / 'scenario.json'
            scenario.write_text(json.dumps(data))
            ok = subprocess.run([str(PYTHON), str(SCRIPT), str(scenario), str(folder / 'ok')],
                                capture_output=True, text=True)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            self.assertTrue((folder / 'ok/soundtrack.wav').stat().st_size > 1000000)
            data['audioPlan']['musicFile'] = 'assets/music/missing-track.ogg'
            scenario.write_text(json.dumps(data))
            blocked = subprocess.run([str(PYTHON), str(SCRIPT), str(scenario), str(folder / 'bad')],
                                     capture_output=True, text=True)
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn('missing or outside', blocked.stderr)


if __name__ == '__main__':
    unittest.main()
