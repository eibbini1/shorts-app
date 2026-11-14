"""Cache-only rendering must fail before either local model starts."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('render_any_local', Path(__file__).with_name('render-any-local.py'))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)


class CacheOnlyTests(unittest.TestCase):
    def test_missing_still_stops_before_flux(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'missing approved still'):
                render.still(Path(folder), 0, {'imagePrompt': 'A glass jar'}, 1200,
                             None, 384, 640, cache_only=True)

    def test_missing_clip_stops_before_ltx(self):
        with tempfile.TemporaryDirectory() as folder:
            reference = Path(folder) / 'still.png'
            reference.write_bytes(b'reference')
            with self.assertRaisesRegex(RuntimeError, 'missing valid motion'):
                render.clip(Path(folder), 0, 0, {'motionPrompt': 'A spoon rises'}, 2200,
                            reference, 384, 640, 'model', 'gemma', lambda: '', cache_only=True)


if __name__ == '__main__':
    unittest.main()
