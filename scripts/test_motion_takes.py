"""Per-shot motion takes: take 1 is today's seed exactly; more takes change only the motion seed.

Run: python3 -m unittest scripts/test_motion_takes.py
"""
import json, subprocess, sys, tempfile, unittest
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

    def test_new_take_changes_only_that_shots_seed(self):
        state = mt.select(self.work, 3)
        self.assertEqual(state, {'current': 1, 'highest': 1})
        self.assertEqual(mt.seed(self.work, 3, 0), 2200 + 30 + 7919)
        self.assertEqual(mt.seed(self.work, 2, 0), 2200 + 20)
        self.assertEqual(mt.seed(self.work, 4, 1), 2200 + 40 + 1)

    def test_parts_of_one_shot_share_the_take(self):
        mt.select(self.work, 0)
        self.assertEqual(mt.seed(self.work, 0, 1) - mt.seed(self.work, 0, 0), 1)

    def test_each_take_has_a_distinct_seed(self):
        seeds = {mt.seed(self.work, 1, 0)}
        for _ in range(mt.MAX_TAKES - 1):
            mt.select(self.work, 1)
            seeds.add(mt.seed(self.work, 1, 0))
        self.assertEqual(len(seeds), mt.MAX_TAKES)

    def test_switching_back_reuses_an_earlier_seed(self):
        first = mt.seed(self.work, 1, 0)
        mt.select(self.work, 1)
        mt.select(self.work, 1, 0)
        self.assertEqual(mt.seed(self.work, 1, 0), first)
        self.assertEqual(mt.state(self.work, 1), {'current': 0, 'highest': 1})

    def test_limits_and_bad_requests_change_nothing(self):
        for _ in range(mt.MAX_TAKES - 1):
            mt.select(self.work, 0)
        before = (self.work / 'motion' / 'takes.json').read_text()
        with self.assertRaises(ValueError):
            mt.select(self.work, 0)  # all takes used
        with self.assertRaises(ValueError):
            mt.select(self.work, 0, take=mt.MAX_TAKES)  # never made
        with self.assertRaises(ValueError):
            mt.select(self.work, 5, take=1)  # shot with no takes
        self.assertEqual((self.work / 'motion' / 'takes.json').read_text(), before)

    def test_corrupt_or_hostile_state_falls_back_safely(self):
        (self.work / 'motion').mkdir()
        for text in ('not json', '[]', json.dumps({'0': {'current': 99, 'highest': -3}}), json.dumps({'0': {'current': 'x'}})):
            (self.work / 'motion' / 'takes.json').write_text(text)
            self.assertIn(mt.seed(self.work, 0, 0) - 2200, (0, 2 * 7919))  # a clamped take, never a wild seed

    def test_cli_prints_json_and_uses_exit_codes(self):
        run = lambda *a: subprocess.run([sys.executable, str(ROOT / 'scripts/motion_takes.py'), 'select', '--work', str(self.work), *a], capture_output=True, text=True)
        ok = run('--shot', '2')
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertEqual(json.loads(ok.stdout), {'shot': 2, 'current': 1, 'highest': 1, 'max': mt.MAX_TAKES})
        bad = run('--shot', '2', '--take', '2')
        self.assertEqual(bad.returncode, 3)
        self.assertIn('not been made', json.loads(bad.stdout)['error'])
        self.assertEqual(run('--shot', '0').returncode, 2)


class WiringTests(unittest.TestCase):
    def test_both_render_paths_use_the_shared_seed_and_the_old_formula_is_gone(self):
        for rel in ('scripts/render-any-local.py', 'scripts/render-studio-shot.py'):
            text = (ROOT / rel).read_text()
            self.assertIn('motion_takes.seed(work, index, part)', text, rel)
            self.assertNotIn('2200 + index * 10 + part', text, rel)

    def test_reused_clip_is_refreshed_so_the_studio_shows_the_current_take(self):
        text = (ROOT / 'scripts/render-any-local.py').read_text()
        reuse = text[text.index("print(f'Reusing motion"):]
        self.assertIn('target.touch()', reuse[:400])


if __name__ == '__main__':
    unittest.main()
