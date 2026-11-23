import json, pathlib, shutil, subprocess, tempfile, unittest, copy, importlib.util
here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('planner_endings', here / 'planner_endings.py')
pe = importlib.util.module_from_spec(spec); spec.loader.exec_module(pe)

def load(key):
    return json.loads((here / 'fixtures' / 'planner-endings' / f'{key}.json').read_text())['plan']

# Requested endings from bench-nonfood-planning.py: (ending text passed as --ending, end-state regex groups).
CASES = {
    'animal': ('The fox drops the pinecone beside a lantern.',
               {'after': [[r'pinecone'], [r'beside (the|a) lantern']]}),
    'character': ('The robot opens the greenhouse door and steps inside.',
                  {'after': [[r'door', r'opens?\b'], [r'steps?\b|inside']]}),
    'gadget': ('The gadget opens one large panel and the lamp inside lights up.',
               {'after': [[r'panel', r'open']]}),
    'object': ('A polished brass compass catches a band of light as it turns.',
               {'after': [[r'polished'], [r'compass']]}),
    'travel': ('The paper plane lands on the wooden dock.',
               {'after': [[r'plane', r'(rests?|lands?|landed|settl)', r'dock']]}),
}

class PlannerEndings(unittest.TestCase):
    def problems(self, key, plan=None):
        return pe.ending_problems(plan or load(key), CASES[key][1])

    # Frozen plans from bench run 20261122-213927 (gemma-local), generated BEFORE commit
    # dfb7953 added lockRequestedEnding. They record what the older planner produced.
    def test_older_animal_plan_reached_its_ending(self):
        self.assertEqual(self.problems('animal'), [])

    def test_older_object_and_gadget_plans_reached_their_endings(self):
        self.assertEqual(self.problems('object'), [])
        self.assertEqual(self.problems('gadget'), [])

    def test_older_character_plan_stopped_before_the_door_opened(self):
        self.assertEqual(self.problems('character'), ['ending-not-reached'])

    def test_older_travel_plan_wrote_its_checks_as_questions(self):
        self.assertEqual(self.problems('travel'), ['check-written-as-question'])

    def test_corrected_character_plan_passes(self):
        plan = copy.deepcopy(load('character'))
        plan['shots'][-1]['sceneState']['after'] = 'The greenhouse door swings open and Rusty steps inside.'
        self.assertEqual(self.problems('character', plan), [])

    def test_a_plan_that_stops_short_of_the_landing_is_caught(self):
        plan = copy.deepcopy(load('travel'))
        plan['shots'][-1]['sceneState']['after'] = 'The paper plane drifts over the water.'
        self.assertIn('ending-not-reached', self.problems('travel', plan))

    def test_empty_plan_is_reported(self):
        self.assertEqual(pe.ending_problems({'shots': []}, CASES['animal'][1]), ['no-shots'])

    @unittest.skipUnless(shutil.which('node'), 'node not available')
    def test_current_ending_lock_makes_every_frozen_plan_reach_its_ending(self):
        # Applies the real lockRequestedEnding from scripts/story-draft-utils.mjs to each frozen
        # final shot, so this fails if that function stops setting sceneState.after.
        script = ("import fs from 'node:fs';"
                  "import {lockRequestedEnding} from process.argv[1];").replace('process.argv[1]', json.dumps((here / 'story-draft-utils.mjs').as_uri()))
        script += ("const [plan, ending] = JSON.parse(fs.readFileSync(0, 'utf8'));"
                   "const last = plan.shots.at(-1); last.motionPrompt = 'placeholder';"
                   "lockRequestedEnding(last, ending); console.log(JSON.stringify(plan));")
        for key, (ending, spec_) in CASES.items():
            out = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps([load(key), ending]),
                                 capture_output=True, text=True, check=True).stdout
            self.assertEqual(pe.ending_problems(json.loads(out), spec_).count('ending-not-reached'), 0, key)


if __name__ == '__main__':
    unittest.main()
