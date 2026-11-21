import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

from flux_ab import FOOD, cmd_report
from flux_prompt import build_prompt, check_prompt


class FoodPromptABTests(unittest.TestCase):
    def test_structured_raw_food_prompt_stays_specific_and_under_limit(self):
        prompt = build_prompt(FOOD['spec'], 'food')
        self.assertEqual(check_prompt(prompt), [])
        self.assertLessEqual(len(prompt.split()), 140)
        self.assertIn('before baking', prompt)
        self.assertIn('only toppings', prompt)

    def test_food_report_uses_food_specific_rubric(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            for variant in ('A', 'B'):
                (out / variant).mkdir()
                (out / variant / 'meta.json').write_text(json.dumps({
                    'preset': 'food', 'rubric': FOOD['rubric'], 'prompt': 'Raw pizza',
                    'model': 'local', 'seed': 1200, 'width': 384, 'height': 640, 'steps': 4,
                    'still': {'brightness': 100, 'contrast': 20, 'edgeEnergy': 4, 'gate': 'pass'},
                    'stillSeconds': 1,
                }))
            cmd_report(Namespace(dir=directory))
            report = (out / 'report.md').read_text()
            self.assertIn('| ingredient_match |', report)
            self.assertNotIn('| geometry |', report)


if __name__ == '__main__':
    unittest.main()
