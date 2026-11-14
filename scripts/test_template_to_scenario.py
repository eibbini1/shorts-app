import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import shorts_templates as T
import template_to_scenario as B


def slots_for(template):
    return {name: ('$100' if T.is_price_slot(name) else f'test {name}') for name in template['slots']}


class TemplateToScenario(unittest.TestCase):
    def test_every_template_builds_consistent_shots(self):
        for tid, template in T.load_all().items():
            scenario = B.build(tid, slots_for(template))
            shots = scenario['plan']['shots']
            self.assertLessEqual(len(shots), len(template['beats']), tid)
            self.assertEqual(sum(s['seconds'] for s in shots), template['beats'][-1]['end'], tid)
            self.assertEqual(scenario['totalSeconds'], template['beats'][-1]['end'], tid)
            self.assertEqual(len(scenario['plan']['ideas']), 5, tid)
            for shot in shots:
                self.assertIn(B.CONTINUITY, shot['imagePrompt'], tid)
                self.assertLessEqual(len(shot['imagePrompt']), 1000)
                self.assertNotIn('{', shot['narration'], f'{tid}: unfilled slot')

    def test_missing_optional_slot_is_never_spoken(self):
        template = T.load_all()['banned-foods']
        scenario = B.build('banned-foods', slots_for(template))
        for shot in scenario['plan']['shots']:
            self.assertNotRegex(shot['narration'], r'[{}]')
            self.assertNotRegex(shot['narration'], r'\btwist\b')

    def test_prices_must_be_us_dollars(self):
        template = T.load_all()['guess-the-price']
        bad = {**slots_for(template), 'price': '95 euros'}
        with self.assertRaises(ValueError):
            B.build('guess-the-price', bad)

    def test_unknown_template(self):
        with self.assertRaises(ValueError):
            B.build('nope', {})

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_existing_validator_accepts_output(self):
        template = T.load_all()['countdown']
        scenario = B.build('countdown', slots_for(template))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'x.local-scenario.json'
            path.write_text(json.dumps(scenario))
            done = subprocess.run(['node', str(HERE / 'bb-local-scenario.mjs'), '--validate', str(path)], capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr[-300:])


if __name__ == '__main__':
    unittest.main()
