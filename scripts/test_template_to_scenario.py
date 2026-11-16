import io, json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

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
            self.assertLessEqual(sum(s['seconds'] for s in shots), template['beats'][-1]['end'], tid)
            self.assertEqual(scenario['totalSeconds'], sum(s['seconds'] for s in shots), tid)
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

    def test_hook_line_overrides_hook_beat(self):
        template = T.load_all()['guess-the-price']
        scenario = B.build('guess-the-price', {**slots_for(template), 'hook_line': 'One hot dog, yet a world record. Guess the price?'})
        self.assertEqual(scenario['plan']['shots'][0]['narration'], 'One hot dog, yet a world record. Guess the price?')
        self.assertEqual(scenario['plan']['hook'], 'One hot dog, yet a world record. Guess the price?')

    def test_unknown_template(self):
        with self.assertRaises(ValueError):
            B.build('nope', {})

    def test_templates_use_distinct_sets_and_owner_override(self):
        templates = T.load_all()
        process = B.build('process-reveal', slots_for(templates['process-reveal']))
        price = B.build('guess-the-price', slots_for(templates['guess-the-price']))
        self.assertNotEqual(process['creativeSignature']['set'], price['creativeSignature']['set'])
        self.assertIn('walnut board', process['plan']['shots'][0]['imagePrompt'])
        custom = B.build('process-reveal', {**slots_for(templates['process-reveal']),
                                            'visual_set': 'sunlit garden kitchen',
                                            'surface': 'ceramic serving board', 'pan': 'cast-iron skillet',
                                            'hand': 'bare hand', 'visual_style': 'warm daylight food film'})
        first = custom['plan']['shots'][0]['imagePrompt']
        self.assertIn('sunlit garden kitchen', first)
        self.assertIn('ceramic serving board', first)
        self.assertNotIn('black slate', first)
        self.assertNotIn('copper pan', first)

    def test_unsourced_template_prices_are_blocked_by_evidence_gate(self):
        templates = T.load_all()
        price_templates = {'countdown', 'guess-the-price', 'same-item-two-prices', 'would-you-rather-menu'}
        for tid in price_templates:
            with self.subTest(template=tid), tempfile.TemporaryDirectory() as folder:
                scenario = B.build(tid, slots_for(templates[tid]))
                path = Path(folder) / 'scenario.json'
                path.write_text(json.dumps(scenario))
                result = subprocess.run(['python3', str(HERE / 'evidence_gate.py'), str(path)],
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('visible price', result.stdout)

    def test_local_refinement_preserves_template_facts_and_timing(self):
        template = T.load_all()['process-reveal']
        original = B.build('process-reveal', slots_for(template))
        before = [(shot['seconds'], shot['narration']) for shot in original['plan']['shots']]
        rows = [{'imagePrompt': 'Fresh image: ' + shot['imagePrompt'],
                 'motionPrompt': 'Fresh motion: ' + shot['motionPrompt'],
                 'sound': 'quiet kitchen room tone'} for shot in original['plan']['shots']]
        response = io.BytesIO(json.dumps({'message': {'content': json.dumps({'shots': rows})}}).encode())
        with patch.object(B.urllib.request, 'urlopen', return_value=response):
            revised = B.refine_with_ollama(original, 'qwen3:8b')
        self.assertEqual(before, [(shot['seconds'], shot['narration']) for shot in revised['plan']['shots']])
        self.assertEqual(revised['model'], 'template+ollama/qwen3:8b')
        self.assertIn('Fresh image:', revised['plan']['shots'][0]['imagePrompt'])

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_existing_validator_accepts_output(self):
        template = T.load_all()['countdown']
        scenario = B.build('countdown', slots_for(template))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'x.local-scenario.json'
            path.write_text(json.dumps(scenario))
            done = subprocess.run(['node', str(HERE / 'bb-local-scenario.mjs'), '--validate', str(path)], capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr[-300:])

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_every_template_passes_render_gates(self):
        for tid, template in T.load_all().items():
            with self.subTest(template=tid), tempfile.TemporaryDirectory() as folder:
                scenario = B.build(tid, slots_for(template))
                path = Path(folder) / 'x.local-scenario.json'
                path.write_text(json.dumps(scenario))
                for command in (
                    ['node', str(HERE / 'bb-local-scenario.mjs'), '--validate', str(path)],
                    ['python3', str(HERE / 'preflight-short.py'), str(path), '--strict', '--allow'],
                    ['python3', str(HERE / 'audit-local-story.py'), str(path)],
                ):
                    done = subprocess.run(command, capture_output=True, text=True)
                    self.assertEqual(done.returncode, 0, (done.stdout + done.stderr)[-700:])
                self.assertEqual(sum(s['seconds'] for s in scenario['plan']['shots']), scenario['settings']['seconds'])


if __name__ == '__main__':
    unittest.main()
