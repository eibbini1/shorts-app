import copy
import json
import runpy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

ROOT = Path(__file__).resolve().parents[1]
DIRECTOR = runpy.run_path(str(Path(__file__).with_name('director-brief.py')))
draft_command, validate = DIRECTOR['draft_command'], DIRECTOR['validate']
creative_brief_problems = runpy.run_path(str(Path(__file__).with_name('audit-local-story.py')))['creative_brief_problems']


class DirectorBriefTests(unittest.TestCase):
    def test_brief_builds_model_command_and_checks_options(self):
        brief = validate({'topic': 'crispy cabbage dumplings', 'set': 'sunlit walnut kitchen',
                          'hook': 'one dumpling cracks open', 'mustShow': 'steam escapes from the crisp skirt',
                          'turn': 'pan-fry then steam', 'audio': 'asmr', 'seconds': '30'})
        command = draft_command(brief, 'test-id', 'gemma-local')
        self.assertEqual(command[command.index('--audio') + 1], 'asmr')
        self.assertEqual(command[command.index('--set') + 1], 'sunlit walnut kitchen')
        with self.assertRaisesRegex(ValueError, 'Sound must'):
            validate({'topic': 'dumplings', 'audio': 'music-only'})

    def test_requested_hook_and_action_are_real_shot_requirements(self):
        data = json.loads((ROOT / 'examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json').read_text())
        data['creativeBrief'] = {'hookImage': 'crisp crust tear', 'mustShow': 'butter sizzle'}
        self.assertEqual(creative_brief_problems(data), [])
        changed = copy.deepcopy(data)
        changed['creativeBrief']['mustShow'] = 'a purple balloon explodes'
        self.assertIn('no moving shot depicts the required physical action', creative_brief_problems(changed))


if __name__ == '__main__':
    unittest.main()
