"""Unit tests for scripts/output_spec.py and exact parity with data/output-spec.json."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import output_spec as ospec  # noqa: E402


class OutputSpecTests(unittest.TestCase):
    def test_default_fallback_matches_data_output_spec_json_exactly(self):
        on_disk = json.loads((ROOT / 'data/output-spec.json').read_text(encoding='utf-8'))
        self.assertEqual(on_disk, ospec.DEFAULT_OUTPUT_SPEC)
        self.assertEqual(ospec.load_output_spec(ROOT / 'data/missing-output-spec.json'), ospec.DEFAULT_OUTPUT_SPEC)

    def test_check_video_spec_accepts_valid_vertical_and_wide_streams(self):
        vertical = {
            'width': 1080, 'height': 1920, 'fps': 24.0,
            'videoCodec': 'h264', 'pixelFormat': 'yuv420p',
            'hasAudio': True, 'audioCodec': 'aac', 'audioSampleRateHz': 48000,
            'durationSeconds': 10.02,
        }
        wide = {**vertical, 'width': 1920, 'height': 1080, 'fps': 30.0}
        self.assertTrue(ospec.check_video_spec(vertical, orientation='vertical', expected_seconds=10)['ok'])
        self.assertTrue(ospec.check_video_spec(wide, orientation='wide', expected_seconds=10)['ok'])

    def test_check_video_spec_rejects_wrong_orientation_codec_fps_and_missing_audio(self):
        bad = {
            'width': 1920, 'height': 1080, 'fps': 12.0,
            'videoCodec': 'vp9', 'pixelFormat': 'yuv444p',
            'hasAudio': False, 'audioCodec': None, 'audioSampleRateHz': None,
            'durationSeconds': 8.0,
        }
        result = ospec.check_video_spec(bad, orientation='vertical', expected_seconds=10)
        self.assertFalse(result['ok'])
        text = '\n'.join(result['issues'])
        self.assertIn('vertical orientation', text)
        self.assertIn('frame rate', text)
        self.assertIn('video codec', text)
        self.assertIn('pixel format', text)
        self.assertIn('audio stream is missing', text)
        self.assertIn('duration', text)

    def test_check_output_file_probes_real_ffmpeg_mp4(self):
        with tempfile.TemporaryDirectory() as tmp:
            mp4 = Path(tmp) / 'sample.mp4'
            subprocess.run(
                ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                 '-f', 'lavfi', '-i', 'color=c=0x223344:s=384x640:r=24:d=2',
                 '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
                 '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(mp4)],
                check=True,
            )
            result = ospec.check_output_file(mp4, orientation='vertical', expected_seconds=2.0)
            self.assertTrue(result['ok'], result['issues'])
            self.assertEqual(result['metrics']['width'], 384)
            self.assertEqual(result['metrics']['height'], 640)
            self.assertEqual(result['metrics']['videoCodec'], 'h264')


if __name__ == '__main__':
    unittest.main()
