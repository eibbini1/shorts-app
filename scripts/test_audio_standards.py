"""Contract tests verifying shared audio loudness targets across pipeline scripts."""
import importlib.util
import unittest
from pathlib import Path

from audio_standards import (
    PREREVIEW_MAX_TP_DB,
    PREREVIEW_TOLERANCE_LUFS,
    QA_MAX_LUFS,
    QA_MAX_TP_DB,
    QA_MIN_LUFS,
    TARGET_LRA,
    TARGET_LUFS,
    TARGET_TP_DB,
    loudnorm_filter,
    qa_loudness_ok,
)

HERE = Path(__file__).resolve().parent


def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AudioStandardsTests(unittest.TestCase):
    def test_loudnorm_filter_formats_cleanly(self):
        self.assertEqual(loudnorm_filter(), 'loudnorm=I=-15:TP=-1.5:LRA=11')
        self.assertEqual(
            loudnorm_filter(print_json=True),
            'loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json',
        )
        self.assertEqual((TARGET_LUFS, TARGET_TP_DB, TARGET_LRA), (-15.0, -1.5, 11.0))

    def test_qa_and_prereview_windows_align_around_target(self):
        prereview_low = TARGET_LUFS - PREREVIEW_TOLERANCE_LUFS
        prereview_high = TARGET_LUFS + PREREVIEW_TOLERANCE_LUFS
        self.assertGreaterEqual(prereview_low, QA_MIN_LUFS)
        self.assertLessEqual(TARGET_LUFS, prereview_high)
        self.assertLessEqual(TARGET_TP_DB, PREREVIEW_MAX_TP_DB)
        self.assertLessEqual(PREREVIEW_MAX_TP_DB, QA_MAX_TP_DB)
        # Single-pass loudnorm drift around -15 LUFS (-16.8 to -13.6 LUFS) passes both QA and pre-review
        pre = load_script('prereview_audio_contract', 'prereview-local-video.py')
        for lufs in (-16.8, -15.0, -13.6):
            self.assertTrue(qa_loudness_ok(lufs, -1.2), f'QA rejected {lufs} LUFS')
            self.assertEqual(pre.audio_flags(lufs, -1.2, [-16.0, -16.5]), [])

    def test_qa_rejects_out_of_band_loudness_and_clipping(self):
        self.assertFalse(qa_loudness_ok(-19.5, -1.5))
        self.assertFalse(qa_loudness_ok(-12.5, -1.5))
        self.assertFalse(qa_loudness_ok(-15.0, -0.2))

    def test_pipeline_scripts_import_unified_audio_standards(self):
        for filename in (
            'assemble-motion-video.py',
            'add-sfx.py',
            'qa-local-video.py',
            'prereview-local-video.py',
            'artcraft-finish.py',
        ):
            text = (HERE / filename).read_text(encoding='utf-8')
            self.assertIn('audio_standards', text, f'{filename} does not import audio_standards')


if __name__ == '__main__':
    unittest.main()
