import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import still_lessons as sl

MACRO = 'Macro close-up of a crackly golden crust on a toasted bun, serrated knife on the crust.'
OVERHEAD = 'Overhead top-down view of a bottom bun on slate.'


class StillLessonsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['STILL_LESSONS_DIR'] = self.tmp.name

    def tearDown(self):
        os.environ.pop('STILL_LESSONS_DIR', None)
        self.tmp.cleanup()

    def test_shot_type(self):
        self.assertEqual(sl.shot_type(MACRO), 'macro-close-up')
        self.assertEqual(sl.shot_type(OVERHEAD), 'overhead')
        self.assertEqual(sl.shot_type('ingredients hang in mid-air'), 'mid-air')
        self.assertEqual(sl.shot_type('a plate'), 'general')

    def test_rejection_is_logged_with_both_prompts(self):
        sl.record_rejection(MACRO, MACRO + ' fixed', 'No patty visible', 'garlic.json')
        row = json.loads((Path(self.tmp.name) / 'still-rejections.jsonl').read_text().splitlines()[0])
        self.assertEqual((row['shotType'], row['reason'], row['promptBefore'], row['promptAfter']),
                         ('macro-close-up', 'No patty visible', MACRO, MACRO + ' fixed'))

    def test_lessons_are_per_shot_type_and_deduplicated(self):
        for _ in range(2):
            sl.record_rejection(MACRO, MACRO, 'No patty visible')
        sl.record_rejection(OVERHEAD, OVERHEAD, 'Top bun already on')
        found = sl.lessons_for(MACRO)
        self.assertEqual(found['rejected'], ['No patty visible'])
        self.assertEqual(sl.lessons_for(OVERHEAD)['rejected'], ['Top bun already on'])

    def test_clean_recipe_preferred_over_repaired(self):
        sl.record_recipe(MACRO + ' clean recipe')
        sl.record_recipe(MACRO + '\n\nAutomatic frame correction 2: the subject is x')
        self.assertTrue(sl.lessons_for(MACRO)['recipe'].endswith('clean recipe'))
        self.assertIsNone(sl.lessons_for('a plate')['recipe'])

    def test_empty_store_and_bad_lines(self):
        self.assertEqual(sl.lessons_for(MACRO), {'shotType': 'macro-close-up', 'rejected': [], 'recipe': None})
        (Path(self.tmp.name) / 'still-rejections.jsonl').write_text('not json\n')
        self.assertEqual(sl.lessons_for(MACRO)['rejected'], [])

    def test_lint_shows_lessons_without_changing_scores(self):
        scenario = Path(self.tmp.name) / 's.json'
        shot = {'seconds': 2, 'narration': 'x', 'imagePrompt': MACRO, 'motionPrompt': 'The knife presses into the crust.'}
        scenario.write_text(json.dumps({'plan': {'title': 'Crunch Burger', 'shots': [shot]}, 'settings': {}}))
        lint = [sys.executable, str(Path(__file__).resolve().parent / 'prompt-lint.py'), '--json', str(scenario)]
        before = json.loads(subprocess.run(lint, capture_output=True, text=True, env=os.environ).stdout)[0]
        sl.record_rejection(MACRO, MACRO, 'No patty visible')
        sl.record_recipe(MACRO)
        after = json.loads(subprocess.run(lint, capture_output=True, text=True, env=os.environ).stdout)[0]
        self.assertEqual((before['overall'], before['shots'][0]['image']), (after['overall'], after['shots'][0]['image']))
        notes = ' '.join(after['shots'][0]['notes'])
        self.assertIn('rejected before: No patty visible', notes)
        self.assertIn('passed with', notes)
        self.assertNotIn('[L]', ' '.join(before['shots'][0]['notes']))


if __name__ == '__main__':
    unittest.main()
