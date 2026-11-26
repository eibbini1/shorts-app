"""Unit tests for scripts/look_profiles.py and parity with data/looks.json."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import look_profiles as lp  # noqa: E402


class LookProfilesTests(unittest.TestCase):
    def test_default_fallback_matches_data_looks_json_exactly(self):
        on_disk = json.loads((ROOT / 'data/looks.json').read_text(encoding='utf-8'))
        self.assertEqual(on_disk, lp.DEFAULT_LOOKS_CONFIG)
        self.assertEqual(lp.load_looks_config(ROOT / 'data/missing-looks.json'), lp.DEFAULT_LOOKS_CONFIG)

    def test_allow_list_and_profile_fields(self):
        self.assertEqual(lp.LOOK_IDS, ('food', 'cartoon', 'night', 'custom'))
        for look in lp.LOOK_IDS:
            self.assertTrue(lp.is_valid_look(look))
            self.assertEqual(lp.resolve_look_id(look), look)
        for bad in (None, '', 'sci-fi', 123, '__class__'):
            self.assertFalse(lp.is_valid_look(bad))
            self.assertEqual(lp.resolve_look_id(bad), 'food')
        self.assertIn('sizzle', lp.FOOD_ONLY_AUDIO_CUES)
        self.assertNotIn('whoosh', lp.FOOD_ONLY_AUDIO_CUES)

    def test_food_detection_respects_explicit_look_then_falls_back_to_keywords(self):
        food_scn = {'settings': {'look': 'food'}, 'topic': 'Abstract study', 'plan': {'shots': []}}
        cartoon_scn = {'settings': {'look': 'cartoon'}, 'topic': 'A cartoon chef baking pizza', 'plan': {'shots': []}}
        custom_food = {'settings': {'look': 'custom'}, 'topic': 'Garlic bread crust tear', 'plan': {'shots': []}}
        custom_non_food = {'settings': {'look': 'custom'}, 'topic': 'A red fox walking in snow', 'plan': {'shots': []}}
        legacy_non_food = {'topic': 'A paper boat floating down a stream', 'plan': {'shots': [{'imagePrompt': 'Small paper boat on calm water'}]}}

        self.assertTrue(lp.is_food_scenario(food_scn))
        self.assertFalse(lp.is_food_scenario(cartoon_scn))
        self.assertTrue(lp.is_food_scenario(custom_food))
        self.assertFalse(lp.is_food_scenario(custom_non_food))
        self.assertFalse(lp.is_food_scenario(legacy_non_food))
        self.assertTrue(lp.is_food_text('Crispy golden halloumi'))
        self.assertTrue(lp.is_food_text('وصفة حلوم في المقلاة'))

    def test_min_prompt_score_and_env_override_precedence(self):
        food_scn = {'settings': {'look': 'food'}, 'plan': {'shots': []}}
        cartoon_scn = {'settings': {'look': 'cartoon'}, 'plan': {'shots': []}}
        custom_scn = {'settings': {'look': 'custom'}, 'topic': 'Paper boat', 'plan': {'shots': []}}

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('SHORTS_MIN_PROMPT_SCORE', None)
            self.assertEqual(lp.min_prompt_score_for(food_scn), 85)
            self.assertEqual(lp.min_prompt_score_for(cartoon_scn), 0)
            self.assertEqual(lp.min_prompt_score_for(custom_scn), 0)
            self.assertEqual(lp.min_prompt_score_for(None), 85)
            self.assertEqual(lp.min_prompt_score_for(food_scn, env_override='0'), 0)
            self.assertEqual(lp.min_prompt_score_for(food_scn, env_override='auto'), 85)
            self.assertEqual(lp.min_prompt_score_for(cartoon_scn, env_override='auto'), 0)
            self.assertEqual(lp.min_prompt_score_for(cartoon_scn, env_override='70'), 70)

    def test_default_studio_and_continuity_question(self):
        food_scn = {'settings': {'look': 'food'}, 'plan': {'shots': []}}
        night_scn = {'settings': {'look': 'night'}, 'plan': {'shots': []}}
        self.assertEqual(lp.default_studio_for(food_scn), 'luxury-kitchen')
        self.assertIsNone(lp.default_studio_for(night_scn))
        self.assertIn('cooking video', lp.continuity_question_for(food_scn))
        self.assertIn('main character or object', lp.continuity_question_for(night_scn))


if __name__ == '__main__':
    unittest.main()
