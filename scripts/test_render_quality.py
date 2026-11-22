"""Quality presets: standard stays the default; high is opt-in; every render path uses the same sizes.

Run: python3 -m unittest scripts/test_render_quality.py
"""
import importlib.util, json, os, sys, unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import render_quality as rq  # noqa: E402


class PresetTests(unittest.TestCase):
    def setUp(self):
        self._env = patch.dict(os.environ, {}, clear=False)
        self._env.start()
        os.environ.pop('SHORTS_RENDER_QUALITY', None)

    def tearDown(self):
        self._env.stop()

    def test_default_is_the_fast_standard_size(self):
        self.assertEqual(rq.dimensions({'format': 'short'}), (384, 640))
        self.assertEqual(rq.dimensions({'format': 'wide'}), (640, 384))

    def test_high_matches_the_bench_clips(self):
        self.assertEqual(rq.dimensions({'format': 'short', 'quality': 'high'}), (704, 1280))
        self.assertEqual(rq.dimensions({'format': 'wide', 'quality': 'high'}), (1280, 704))

    def test_environment_selects_quality_and_settings_win(self):
        os.environ['SHORTS_RENDER_QUALITY'] = 'high'
        self.assertEqual(rq.dimensions({'format': 'short'}), (704, 1280))
        self.assertEqual(rq.dimensions({'format': 'short', 'quality': 'standard'}), (384, 640))

    def test_unknown_values_fall_back_to_standard(self):
        for value in (None, '', 'ultra', 5, 'HIGH '):
            expected = 'high' if str(value).strip().lower() == 'high' else 'standard'
            self.assertEqual(rq.normalize(value), expected)

    def test_sizes_are_valid_for_ltx_and_clip_length_is_unchanged(self):
        for sizes in rq.QUALITIES.values():
            for w, h in sizes.values():
                self.assertEqual((w % 32, h % 32), (0, 0))  # LTX two-stage needs multiples of 32
        self.assertEqual(rq.FRAMES, 97)  # 8k+1; assembly and caching assume it


class CachedClipCheckTests(unittest.TestCase):
    """render-any-local.valid_video must accept clips from either quality, and still reject wrong ones."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('render_any_local', ROOT / 'scripts/render-any-local.py')
        cls.renderer = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(cls.renderer)
        except ImportError as error:  # sandbox without the Mac-only render dependencies
            raise unittest.SkipTest(f'render-any-local import needs Mac deps: {error}')

    def probe(self, **stream):
        data = {'streams': [{'nb_frames': '97', 'width': 384, 'height': 640, 'r_frame_rate': '24/1', **stream}]}
        with patch.object(self.renderer.subprocess, 'check_output', return_value=json.dumps(data).encode()), \
             patch.object(Path, 'is_file', return_value=True):
            return self.renderer.valid_video(Path('clip.mp4'))

    def test_accepts_both_qualities_and_orientations(self):
        for w, h in sorted(rq.known_sizes()):
            self.assertTrue(self.probe(width=w, height=h), (w, h))

    def test_rejects_wrong_size_frame_count_or_rate(self):
        self.assertFalse(self.probe(width=500, height=500))
        self.assertFalse(self.probe(nb_frames='121'))
        self.assertFalse(self.probe(r_frame_rate='30/1'))


class WiringTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text()

    def test_every_render_path_uses_the_shared_sizes(self):
        for rel in ('scripts/render-any-local.py', 'scripts/render-studio-shot.py', 'scripts/preview-local-stills.py'):
            text = self.read(rel)
            self.assertIn('render_quality.dimensions(', text, rel)
            self.assertNotIn('(384, 640) if', text, rel)

    def test_server_passes_the_choice_to_every_render_process(self):
        server = self.read('scripts/studio-server.mjs')
        self.assertIn("SHORTS_RENDER_QUALITY: x.options?.quality === 'high' ? 'high' : 'standard'", server)
        self.assertIn("quality: b.quality === 'high'", server)

    def test_ui_sends_and_restores_quality(self):
        app = self.read('studio/src/App.jsx')
        self.assertIn("post('/api/draft', { prompt, seconds, orientation, quality,", app)
        self.assertIn("setQuality(j.options?.quality === 'high' ? 'high' : 'standard')", app)


if __name__ == '__main__':
    unittest.main()
