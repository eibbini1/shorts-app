"""Per-shot motion takes: take 1 is today's seed exactly; more takes change only the motion seed.

Run: python3 -m unittest scripts/test_motion_takes.py
"""
import importlib.util, json, sys, tempfile, unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import motion_takes as mt  # noqa: E402


class SeedTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.work = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_first_take_keeps_the_legacy_seed_so_existing_caches_stay_valid(self):
        for index in range(12):
            for part in range(4):
                self.assertEqual(mt.seed(self.work, index, part), 2200 + index * 10 + part)

    def test_explicit_seed_leaves_the_committed_take_unchanged(self):
        (self.work / 'motion').mkdir()
        registry = self.work / 'motion/takes.json'
        registry.write_text(json.dumps({'0': {'current': 1, 'highest': 2}}))
        original = registry.read_bytes()
        self.assertEqual(mt.seed(self.work, 0, 0), 10119)
        self.assertEqual(mt.seed(self.work, 0, 0, take=2), 18038)
        self.assertEqual(mt.seed(self.work, 0, 1, take=2), 18039)
        self.assertEqual(mt.seed(self.work, 1, 0), 2210)
        self.assertEqual(registry.read_bytes(), original)

    def test_corrupt_or_hostile_state_falls_back_safely(self):
        (self.work / 'motion').mkdir()
        for text in ('not json', '[]', json.dumps({'0': {'current': 99, 'highest': -3}}), json.dumps({'0': {'current': 'x'}})):
            (self.work / 'motion' / 'takes.json').write_text(text)
            self.assertIn(mt.seed(self.work, 0, 0) - 2200, (0, 2 * 7919))  # a clamped take, never a wild seed


class WorkerReportTests(unittest.TestCase):
    def test_one_worker_reports_its_seed_without_committing_the_take(self):
        spec = importlib.util.spec_from_file_location('studio_shot', ROOT / 'scripts/render-studio-shot.py')
        runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runner)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            scenario = root / 'demo.local-scenario.json'
            scenario.write_text(json.dumps({'settings': {}, 'plan': {'shots': [{'seconds': 5}]}}))
            work = root / 'storage/any-local' / scenario.stem
            motion = work / 'motion'
            motion.mkdir(parents=True)
            reference = work / 'approved.png'
            reference.write_bytes(b'approved fixture')
            for key in ('ltx-model', 'gemma-model'):
                source = root / 'storage/setup' / (key + '-dir.txt')
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text(key)
            args = ['render-studio-shot.py', '--scenario', str(scenario), '--scenario-sha256', runner.file_hash(scenario),
                    '--shot', '1', '--reference', str(reference), '--reference-sha256', runner.file_hash(reference),
                    '--technical-screen']
            calls = []

            def clip(work, index, part, shot, seed, ref, width, height, model, gemma, progress, *, cache_only):
                calls.append((seed, ref, cache_only))
                path = motion / f'{seed}.mp4'
                path.write_bytes(str(seed).encode())
                return path

            def end_frame(work, index, clip):
                path = clip.with_suffix('.png')
                path.write_bytes(clip.read_bytes())
                return path

            report = root / 'worker.report'
            with patch.dict('os.environ', {'SHORTS_STUDIO_TAKE_REPORT': str(report), 'SHORTS_STUDIO_TAKE_INDEX': '2'}), \
                    patch.object(runner, 'ROOT', root), patch.object(sys, 'argv', args), \
                    patch.object(runner.renderer, 'run'), patch.object(runner.renderer, 'clip', side_effect=clip), \
                    patch.object(runner.renderer, 'extract_end_frame', side_effect=end_frame), \
                    patch.object(runner.render_quality, 'dimensions', return_value=(384, 640)), \
                    patch.object(runner, 'check_clip', return_value='frozen'):
                runner.main()
            self.assertEqual(calls, [(18038, reference, False)])
            self.assertFalse((work / 'motion/takes.json').exists())
            row, = json.loads(report.read_text())
            self.assertEqual(row['take'], 2)
            self.assertEqual(row['segments'][0]['seed'], 18038)
            self.assertEqual(row['technicalFlags'], ['frozen'])



class WiringTests(unittest.TestCase):
    def test_both_render_paths_use_the_shared_seed_and_the_old_formula_is_gone(self):
        for rel in ('scripts/render-any-local.py', 'scripts/render-studio-shot.py'):
            text = (ROOT / rel).read_text()
            self.assertRegex(text, r'motion_takes\.seed\(work, index, part(?:, take=take)?\)', rel)
            self.assertNotIn('2200 + index * 10 + part', text, rel)

    def test_reused_clip_is_refreshed_so_the_studio_shows_the_current_take(self):
        text = (ROOT / 'scripts/render-any-local.py').read_text()
        reuse = text[text.index("print(f'Reusing motion"):]
        self.assertIn('target.touch()', reuse[:400])


if __name__ == '__main__':
    unittest.main()
