import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bench = load_script('bench-topic-packs')
renderer = load_script('render-any-local')


class PilotTimingTest(unittest.TestCase):
    def test_real_clip_wrapper_reports_fresh_render_and_cache_hit(self):
        with TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / 'motion').mkdir()
            ref = work / 'reference.png'
            ref.write_bytes(b'same reference')
            args = (work, 0, 0, {'motionPrompt': 'One slow rotation'}, 2200, ref, 384, 640, 'model', 'gemma')
            fresh = bench.Progress()
            with patch.object(renderer, 'valid_video', side_effect=[False, True]), patch.object(renderer.subprocess, 'Popen') as engine:
                engine.return_value.wait.return_value = 0
                path = renderer.clip(*args, fresh)
                engine.assert_called_once()
            self.assertEqual(len(fresh.observed), 1)
            path.touch()
            replay = bench.Progress()
            with patch.object(renderer, 'valid_video', return_value=True), patch.object(renderer.subprocess, 'Popen') as engine:
                self.assertEqual(renderer.clip(*args, replay), path)
                engine.assert_not_called()
            self.assertEqual(replay.observed, [])


if __name__ == '__main__':
    unittest.main()
