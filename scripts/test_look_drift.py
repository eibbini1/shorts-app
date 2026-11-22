import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import look_drift


class DriftIssueTests(unittest.TestCase):
    def test_similar_frames_are_clear(self):
        self.assertIsNone(look_drift.drift_issue('a', {'luma': 60, 'sat': 40}, 'b', {'luma': 70, 'sat': 45}))

    def test_night_to_sunset_is_flagged(self):
        issue = look_drift.drift_issue('shot 1', {'luma': 55, 'sat': 30}, 'shot 2', {'luma': 120, 'sat': 90})
        self.assertIn('brightness changes', issue)
        self.assertIn('saturation changes', issue)


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg not installed')
class MeasureTests(unittest.TestCase):
    def make(self, folder, name, colour):
        path = Path(folder) / name
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c={colour}:s=64x64',
                        '-frames:v', '1', str(path)], check=True)
        return path

    def test_dark_vs_bright_frames_measure_apart(self):
        with tempfile.TemporaryDirectory() as folder:
            dark = look_drift.frame_stats(self.make(folder, 'dark.png', '0x101830'))
            bright = look_drift.frame_stats(self.make(folder, 'bright.png', '0xffb060'))
        self.assertGreater(bright['luma'] - dark['luma'], 100)
        self.assertIsNotNone(look_drift.drift_issue('dark', dark, 'bright', bright))


if __name__ == '__main__':
    unittest.main()
