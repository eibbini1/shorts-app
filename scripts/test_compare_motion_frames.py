import importlib.util
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest


spec = importlib.util.spec_from_file_location('frame_comparison', Path(__file__).with_name('compare-motion-frames.py'))
frame_comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frame_comparison)


class MotionComparisonTest(unittest.TestCase):
    def test_midpoint_change_is_visible_when_endpoints_match(self):
        with TemporaryDirectory() as tmp:
            clip = Path(tmp) / 'temporary-change.mkv'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=96x96:r=10:d=3',
                            '-vf', "drawbox=color=white:t=fill:enable='between(t,1,2)'",
                            '-c:v', 'ffv1', str(clip)], check=True)
            report = frame_comparison.compare(clip)
        self.assertEqual(report['measurementVersion'], 'frame-comparison-v2')
        self.assertEqual(report['midpointSeconds'], 1.5)
        self.assertEqual(report['midpointVsFirst']['histogramOverlap'], 0)
        self.assertLess(report['midpointVsFirst']['ssim'], .1)
        self.assertEqual(report['histogramOverlap'], 1)
        self.assertEqual(report['ssim'], 1)


if __name__ == '__main__':
    unittest.main()
