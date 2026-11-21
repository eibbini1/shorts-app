import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pre = load('prereview', 'prereview-local-video.py')
rec = load('record_review', 'record-editorial-review.py')
PASS = {'status': 'pass', 'issues': []}
FAIL = {'status': 'review-required', 'issues': ['wrong food']}
DOWN = {'status': 'unavailable', 'issues': ['no verdict']}


class PrereviewTests(unittest.TestCase):
    def test_shot_windows_follow_plan(self):
        scenario = {'plan': {'shots': [{'seconds': 3}, {'seconds': 4}, {'seconds': 5}]}}
        self.assertEqual(pre.shot_windows(scenario), [(0.0, 3.0), (3.0, 7.0), (7.0, 12.0)])

    def test_start_middle_end_samples_stay_inside_each_shot(self):
        timeline = pre.sample_timeline([(0.0, 3.0), (3.0, 4.0)])
        self.assertEqual(timeline, [
            {'shot': 1, 'startSeconds': 0.12, 'middleSeconds': 1.5, 'endSeconds': 2.88},
            {'shot': 2, 'startSeconds': 3.12, 'middleSeconds': 3.5, 'endSeconds': 3.88},
        ])
        for item, (start, end) in zip(timeline, [(0, 3), (3, 4)]):
            self.assertTrue(start < item['startSeconds'] < item['middleSeconds'] < item['endSeconds'] < end)

    def test_audio_flags_loudness_peak_and_silent_shot(self):
        self.assertEqual(pre.audio_flags(-15.4, -1.8, [-17, -18, -18]), [])
        flags = pre.audio_flags(-22.0, -0.2, [-17, -18, -40])
        self.assertEqual(len(flags), 3)
        self.assertIn('shot 3', flags[2])

    def test_failed_middle_frame_is_realism_and_final_frame_is_payoff(self):
        flags, unchecked = pre.categorize([PASS, FAIL, PASS], FAIL, PASS, [])
        self.assertEqual(len(flags['realism']), 1)
        self.assertEqual(len(flags['payoff']), 1)
        self.assertEqual(flags['continuity'], [])
        self.assertEqual(unchecked, [])

    def test_unavailable_check_is_unchecked_not_a_failure(self):
        flags, unchecked = pre.categorize([PASS, DOWN], PASS, DOWN, [])
        self.assertFalse(any(flags.values()))
        self.assertEqual(len(unchecked), 2)

    def test_scenario_questions_preferred_over_prompt_fallback(self):
        scenario = {'plan': {'shots': [{'imagePrompt': 'A golden tart on a board. Warm light.'}]}}
        self.assertEqual(pre.shot_questions(scenario, [{'questions': ['Is it a tart?']}], 0), ['Is it a tart?'])
        self.assertEqual(pre.shot_questions(scenario, [{}], 0), ['Does this image show A golden tart on a board?'])

    def test_payoff_question_uses_the_planned_ending_not_first_frame_checks(self):
        scenario = {
            'plan': {
                'payoff': 'A golden pineapple pizza rests on a wooden board',
                'shots': [{'sceneState': {'after': 'The finished pizza rests on the board.'}}],
            },
            'visualChecks': [{'questions': ['Is the pizza inside the glowing oven?']}],
        }
        self.assertIn('"A golden pineapple pizza rests on a wooden board"',
                      pre.ending_question(scenario))

    def test_payoff_question_falls_back_to_last_scene_state(self):
        scenario = {'plan': {'shots': [{'sceneState': {'after': 'The sauce coats the pasta.'}}]}}
        self.assertIn('"The sauce coats the pasta."', pre.ending_question(scenario))

    def test_missing_planned_ending_is_left_unchecked(self):
        self.assertIsNone(pre.ending_question({'plan': {'shots': [{}]}}))

    def test_middle_frame_question_checks_the_action_not_the_initial_state(self):
        scenario = {
            'plan': {'shots': [{
                'imagePrompt': 'A pizza inside an oven.',
                'sceneState': {'action': 'A hand slides the pizza onto a wooden board.'},
            }]},
        }
        checks = [{'questions': ['Is the pizza fully inside the oven?']}]
        self.assertEqual(pre.motion_questions(scenario, checks, 0), [
            'Does this frame plausibly show the planned action underway: "A hand slides the pizza onto a wooden board."?'])

    def test_middle_frame_falls_back_when_no_scene_action_is_available(self):
        scenario = {'plan': {'shots': [{'imagePrompt': 'A pizza inside an oven.'}]}}
        checks = [{'questions': ['Is the pizza inside the oven?']}]
        self.assertEqual(pre.motion_questions(scenario, checks, 0), ['Is the pizza inside the oven?'])


class RecordReviewTests(unittest.TestCase):
    FACTS = {key: True for key in rec.FACTS}

    def test_parse_scores_in_category_order(self):
        self.assertEqual(rec.parse_scores('4,4,5,3,4.5'),
                         {'continuity': 4, 'realism': 4, 'story': 5, 'audio': 3, 'payoff': 4.5})
        for bad in ('4,4,4', '4,4,4,4,6', '4,4,4,4,x'):
            with self.assertRaises(ValueError):
                rec.parse_scores(bad)

    def test_record_matches_scorer_evidence_format(self):
        scores = rec.parse_scores('4,4,4,4,4')
        record = rec.build_record(scores, self.FACTS, ' Essam ', 'abc', 'fix shot 5')
        evidence = record['reviewEvidence']
        self.assertTrue(all(evidence[key] is True for key in rec.FACTS))
        self.assertEqual((evidence['reviewer'], evidence['videoSha256']), ('Essam', 'abc'))
        self.assertEqual(rec.projected_score(scores), 90)

    def test_incomplete_review_or_missing_reviewer_is_refused(self):
        scores = rec.parse_scores('5,5,5,5,5')
        with self.assertRaises(ValueError):
            rec.build_record(scores, {**self.FACTS, 'listenedFullAudio': False}, 'Essam', 'abc')
        with self.assertRaises(ValueError):
            rec.build_record(scores, self.FACTS, '  ', 'abc')

    def test_record_satisfies_score_local_video_checks(self):
        scorer = load('scorer', 'score-local-video.py')
        record = rec.build_record(rec.parse_scores('4,4,4,4,4'), self.FACTS, 'Essam', 'abc')
        self.assertEqual(scorer.review_evidence_problems(record['reviewEvidence'], 'abc'), [])
        self.assertTrue(scorer.review_evidence_problems(record['reviewEvidence'], 'other'))


if __name__ == '__main__':
    unittest.main()
