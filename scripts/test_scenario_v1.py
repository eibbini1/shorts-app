"""Unit tests for scripts/scenario_v1.py and Scenario v1 parity with data/schemas/scenario-v1.schema.json."""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import scenario_v1  # noqa: E402


def valid_scenario():
    return {
        'schemaVersion': 1,
        'status': 'review-required',
        'settings': {
            'brand': 'Local Studio',
            'format': 'short',
            'seconds': 10,
            'presentationMode': 'asmr',
            'look': 'food',
            'quality': 'standard',
        },
        'plan': {
            'ideas': [{'title': 'Glazed pear tart', 'angle': 'Warm caramel pour'}],
            'title': 'Caramel Pear Tart',
            'hook': 'Warm amber caramel pours over sliced pear tart.',
            'payoff': 'One glossy wedge lifts cleanly onto a plate.',
            'shots': [
                {
                    'seconds': 5,
                    'narration': 'Warm caramel pours over the pear tart.',
                    'imagePrompt': 'Macro shot of a golden pear tart on a dark stone counter.',
                    'motionPrompt': 'A chef pours warm amber caramel across the sliced pear tart.',
                    'sound': 'soft caramel pour',
                    'sceneState': {
                        'before': 'Baked pear tart rests unglazed on stone',
                        'action': 'Chef pours warm caramel over the tart',
                        'after': 'Glossy caramel coats the sliced pear tart',
                    },
                    'visualChecks': {
                        'mustShow': ['pear tart', 'caramel pour'],
                        'mustNotShow': ['text overlay'],
                        'questions': ['Does warm caramel coat the pear tart?'],
                    },
                },
                {
                    'seconds': 5,
                    'narration': 'A glossy wedge lifts onto a plate.',
                    'imagePrompt': 'Close-up of a glazed pear tart wedge lifted with a server.',
                    'motionPrompt': 'A pastry server lifts one glossy caramel pear tart wedge.',
                    'sound': 'gentle plate clink',
                    'sceneState': {
                        'before': 'Glossy caramel coats the sliced pear tart',
                        'action': 'Pastry server lifts one wedge upward',
                        'after': 'One glazed pear tart wedge rests on a small plate',
                    },
                    'visualChecks': {
                        'mustShow': ['glazed tart wedge'],
                        'mustNotShow': [],
                        'questions': ['Is one wedge lifted cleanly?'],
                    },
                },
            ],
            'claimsToCheck': [],
        },
    }


class ScenarioV1Tests(unittest.TestCase):
    def test_valid_scenario_passes(self):
        self.assertEqual(scenario_v1.validate_scenario(valid_scenario()), [])

    def test_legacy_scenario_without_schema_version_or_ideas_passes(self):
        data = valid_scenario()
        data.pop('schemaVersion')
        data['plan'].pop('ideas')
        for shot in data['plan']['shots']:
            shot.pop('sceneState')
            shot.pop('visualChecks')
        self.assertEqual(scenario_v1.validate_scenario(data), [])

    def test_rejects_bad_schema_version_look_and_format(self):
        data = valid_scenario()
        data['schemaVersion'] = 99
        data['settings']['look'] = 'unknown'
        data['settings']['format'] = 'square'
        issues = scenario_v1.validate_scenario(data)
        self.assertTrue(any('schemaVersion' in issue for issue in issues))
        self.assertTrue(any('settings.look' in issue for issue in issues))
        self.assertTrue(any('settings.format' in issue for issue in issues))

    def test_rejects_duration_mismatch_and_broken_scene_state_chain(self):
        data = valid_scenario()
        data['settings']['seconds'] = 20
        issues = scenario_v1.validate_scenario(data)
        self.assertTrue(any('sum of shot durations' in issue for issue in issues))

        broken = valid_scenario()
        broken['plan']['shots'][1]['sceneState']['before'] = 'A completely different kitchen'
        chain_issues = scenario_v1.validate_scenario(broken)
        self.assertTrue(any('must continue shot 1' in issue for issue in chain_issues))

        unchanged = valid_scenario()
        unchanged['plan']['shots'][0]['sceneState']['after'] = unchanged['plan']['shots'][0]['sceneState']['before']
        same_issues = scenario_v1.validate_scenario(unchanged)
        self.assertTrue(any('must change from before to after' in issue for issue in same_issues))

    def test_rejects_partial_scene_state_or_visual_checks(self):
        partial = valid_scenario()
        partial['plan']['shots'][1].pop('sceneState')
        partial['plan']['shots'][0].pop('visualChecks')
        issues = scenario_v1.validate_scenario(partial)
        self.assertTrue(any('every shot must include sceneState' in issue for issue in issues))
        self.assertTrue(any('every shot must include visualChecks' in issue for issue in issues))

    def test_every_example_local_scenario_validates(self):
        examples = sorted((ROOT / 'examples/local-scenarios').glob('*.local-scenario.json'))
        self.assertGreaterEqual(len(examples), 10)
        for path in examples:
            _, issues = scenario_v1.load_and_validate(path)
            self.assertEqual(issues, [], f'{path.name} failed Scenario v1: {issues}')

    def test_json_schema_file_matches_constants(self):
        schema = json.loads((ROOT / 'data/schemas/scenario-v1.schema.json').read_text(encoding='utf-8'))
        self.assertEqual(schema['properties']['schemaVersion']['const'], scenario_v1.SCENARIO_SCHEMA_VERSION)
        self.assertEqual(tuple(schema['$defs']['settings']['properties']['format']['enum']), scenario_v1.ALLOWED_FORMATS)
        self.assertEqual(tuple(schema['$defs']['settings']['properties']['look']['enum']), scenario_v1.ALLOWED_LOOKS)
        self.assertEqual(tuple(schema['$defs']['settings']['properties']['presentationMode']['enum']), scenario_v1.ALLOWED_PRESENTATION_MODES)
        self.assertEqual(tuple(schema['$defs']['settings']['properties']['quality']['enum']), scenario_v1.ALLOWED_QUALITIES)

    def test_cli_main_exits_zero_for_examples_and_nonzero_for_missing(self):
        example = str(ROOT / 'examples/local-scenarios/first-cold-night-10.local-scenario.json')
        self.assertEqual(scenario_v1.main([example]), 0)
        self.assertEqual(scenario_v1.main([str(ROOT / 'examples/local-scenarios/does-not-exist.json')]), 1)


if __name__ == '__main__':
    unittest.main()
