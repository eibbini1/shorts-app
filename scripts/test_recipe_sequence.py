import sys
import importlib.util
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('audit_local_story', Path(__file__).with_name('audit-local-story.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
recipe_sequence_problems = audit.recipe_sequence_problems


class RecipeSequenceTests(unittest.TestCase):
    def test_ingredient_and_vessel_checks(self):
        data = {
            'plan': {'shots': [
                {'imagePrompt': 'finished dumpling in cream dish', 'motionPrompt': 'lift dumpling'},
                {'imagePrompt': 'red curry paste in cream dish', 'motionPrompt': 'add red curry paste'},
                {'imagePrompt': 'cooked dumpling in cream dish', 'motionPrompt': 'serve dumpling'},
            ]},
            'recipeSequence': [
                {'phase': 'teaser', 'vessel': 'cream dish', 'adds': []},
                {'phase': 'prep', 'vessel': 'cream dish', 'adds': ['red curry paste']},
                {'phase': 'serve', 'vessel': 'second dish', 'adds': ['lime']},
            ],
        }
        problems = recipe_sequence_problems(data)
        self.assertTrue(any('cooking-time cut' in item for item in problems))
        self.assertTrue(any('hero vessel' in item for item in problems))
        self.assertTrue(any('does not visibly add lime' in item for item in problems))


if __name__ == '__main__':
    unittest.main()
