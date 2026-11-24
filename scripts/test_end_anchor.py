"""endStill: a shot may require its clip to finish on a given still."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('render_any_local', Path(__file__).with_name('render-any-local.py'))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)


def make_png(path, color):
    import subprocess
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=64x96', '-frames:v', '1', str(path)], check=True)


class Stop(Exception):
    pass


class EndAnchorTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.work = Path(self.dir.name)
        self.ref = self.work / 'first.png'
        self.end = self.work / 'last.png'
        make_png(self.ref, 'red')
        make_png(self.end, 'blue')

    def tearDown(self):
        self.dir.cleanup()

    def command(self, shot):
        captured = {}
        real = render.subprocess.Popen

        def fake(cmd, *a, **kw):
            if 'generate' not in [str(c) for c in cmd]:  # let the ffmpeg crop run for real
                return real(cmd, *a, **kw)
            captured['cmd'] = [str(c) for c in cmd]
            raise Stop

        with patch.object(render.subprocess, 'Popen', fake), self.assertRaises(Stop):
            render.clip(self.work, 0, 0, shot, 2200, self.ref, 64, 96, 'm', 'g', lambda *a: '')
        return captured['cmd']

    def test_no_end_still_keeps_one_anchor_and_the_old_cache_name(self):
        cmd = self.command({'motionPrompt': 'A spoon rises'})
        self.assertEqual(cmd.count('--image'), 1)
        prompt = 'A spoon rises' + ' One continuous camera take with coherent physical movement, stable subject identity and lighting.'
        old_key = render.digest({'prompt': prompt, 'seed': 2200, 'referenceHash': render.file_hash(self.ref),
                                 'model': 'm', 'gemma': 'g', 'frames': 97, 'width': 64, 'height': 96})
        self.assertIn(f'shot-00-part-00-{old_key}.mp4', cmd[cmd.index('-o') + 1])

    def test_end_still_adds_a_second_anchor_on_the_last_frame(self):
        cmd = self.command({'motionPrompt': 'A spoon rises', 'endStill': str(self.end)})
        self.assertEqual(cmd.count('--image'), 2)
        second = cmd.index('--image', cmd.index('--image') + 1)
        self.assertTrue(cmd[second + 1].endswith('.png') and 'end-' in cmd[second + 1])
        self.assertEqual(cmd[second + 2:second + 4], ['96', '1.0'])

    def test_end_still_changes_the_cache_name(self):
        plain = self.command({'motionPrompt': 'A spoon rises'})[-1]
        anchored = self.command({'motionPrompt': 'A spoon rises', 'endStill': str(self.end)})[-1]
        self.assertNotEqual(plain, anchored)

    def test_missing_end_still_stops_before_ltx(self):
        with self.assertRaisesRegex(RuntimeError, 'endStill not found'):
            render.clip(self.work, 0, 0, {'motionPrompt': 'x', 'endStill': str(self.work / 'nope.png')},
                        2200, self.ref, 64, 96, 'm', 'g', lambda *a: '')


class EndStillPlanTests(unittest.TestCase):
    def test_explicit_end_still_is_used_as_is(self):
        self.assertEqual(render.end_still_for(Path('/w'), 0, {'endStill': '/x/end.png'}, 1, Path('f.png'), 64, 96), '/x/end.png')

    def test_no_end_prompt_means_no_end_still(self):
        self.assertIsNone(render.end_still_for(Path('/w'), 0, {'imagePrompt': 'a'}, 1, Path('f.png'), 64, 96))

    def test_end_prompt_is_edited_from_the_first_still_so_framing_is_shared(self):
        with patch.object(render, 'still', return_value=Path('/w/refs/end.png')) as made:
            got = render.end_still_for(Path('/w'), 2, {'endImagePrompt': ' The tomato lies in two halves. '}, 1202, Path('first.png'), 64, 96)
        self.assertEqual(got, Path('/w/refs/end.png'))
        work, index, shot, seed, source, width, height, cache_only = made.call_args.args[:7] + (made.call_args.args[7] if len(made.call_args.args) > 7 else False,)
        self.assertEqual(source, Path('first.png'))
        self.assertEqual(shot['imagePrompt'], 'The tomato lies in two halves.')
        self.assertNotEqual(seed, 1202)


if __name__ == '__main__':
    unittest.main()
