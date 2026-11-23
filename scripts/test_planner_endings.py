import json, pathlib, unittest, copy, importlib.util
here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('planner_endings', here / 'planner_endings.py')
pe = importlib.util.module_from_spec(spec); spec.loader.exec_module(pe)

def load(key):
    return json.loads((here / 'fixtures' / 'planner-endings' / f'{key}.json').read_text())['plan']

# What the owner asked for, per bench-nonfood-planning.py case, as observable end states.
ENDINGS = {
    'animal': {'after': [[r'pinecone', r'(rests?|lies|sits?|lays?|dropped).*lantern|beside the lantern']],
               'visible': [[r'pinecone'], [r'lantern']]},
    'character': {'after': [[r'door', r'(opens?|open|opened)'], [r'(inside|steps?|enters?|stepp)']],
                  'visible': [[r'door'], [r'robot|rusty']]},
    'gadget': {'after': [[r'panel', r'open']], 'visible': [[r'panel', r'open'], [r'lamp|glow|light']]},
    'object': {'after': [[r'polished'], [r'compass']], 'visible': [[r'compass'], [r'polished|gleam|bright']]},
    'travel': {'after': [[r'plane', r'(rests?|lands?|landed|settl)', r'dock']],
               'visible': [[r'plane'], [r'dock']]},
}

class PlannerEndings(unittest.TestCase):
    def problems(self, key, plan=None):
        return pe.ending_problems(plan or load(key), ENDINGS[key])

    # Frozen Gemma plans from bench run 20261122-213927. These record today's observed
    # behaviour; if the planner improves, update the expected list and say why.
    def test_animal_plan_reaches_its_ending(self):
        self.assertEqual(self.problems('animal'), [])

    def test_object_final_frame_check_never_requires_the_polished_face(self):
        # The story text reaches "polished"; mustShow lists brass, needle and rose only, so a
        # clip that stays tarnished would still pass the final-frame check. (First guess was
        # that this case passed; the run showed the gap.)
        self.assertEqual(self.problems('object'), ['final-frame-check-omits-ending'])

    def test_character_plan_stops_before_the_door_opens_and_forbids_it(self):
        # Payoff says "opens the greenhouse door and steps inside"; the last shot ends
        # with the latch unlocked and mustNotShow forbids an open door and a walking robot.
        self.assertEqual(self.problems('character'),
                         ['ending-not-reached', 'rejects-the-ending'])

    def test_gadget_final_frame_check_never_requires_the_open_panel(self):
        self.assertEqual(self.problems('gadget'), ['final-frame-check-omits-ending'])

    def test_travel_checks_are_questions_not_observable_statements(self):
        self.assertEqual(self.problems('travel'), ['check-written-as-question'])

    # The checker must also be able to pass a correct plan and catch a regression.
    def test_corrected_character_plan_passes(self):
        plan = copy.deepcopy(load('character'))
        last = plan['shots'][-1]
        last['sceneState']['after'] = 'The greenhouse door swings open and Rusty steps inside, key in hand.'
        last['visualChecks'] = {'mustShow': ['Rusty the teal robot is inside the doorway', 'Greenhouse door is open'],
                                'mustNotShow': ['Greenhouse door is closed'], 'questions': []}
        self.assertEqual(self.problems('character', plan), [])

    def test_removing_the_landing_from_a_good_plan_is_caught(self):
        plan = copy.deepcopy(load('travel'))
        plan['shots'][-1]['sceneState']['after'] = 'The paper plane drifts over the water.'
        plan['shots'][-1]['visualChecks'] = {'mustShow': ['Paper plane in flight', 'Wooden dock below'], 'mustNotShow': []}
        self.assertEqual(self.problems('travel', plan), ['ending-not-reached'])

    def test_empty_plan_is_reported(self):
        self.assertEqual(pe.ending_problems({'shots': []}, ENDINGS['animal']), ['no-shots'])


if __name__ == '__main__':
    unittest.main()
