import unittest
from flux_prompt import DOMAINS, FIELDS, build_prompt, check_prompt


class FluxPromptTest(unittest.TestCase):
    def test_order_and_defaults(self):
        text = build_prompt({'subject': 'A red Ferrari 458 Italia', 'action': 'parked on a coastal road'}, 'car')
        positions = [text.lower().index(p.lower()) for p in ('A red Ferrari', 'photorealistic', 'vertical 9:16', '35mm', 'golden-hour', 'glossy paint', 'all four wheels')]
        self.assertEqual(positions, sorted(positions))

    def test_all_domains_clean(self):
        for name in DOMAINS:
            text = build_prompt({'subject': 'A subject', 'action': 'resting'}, name)
            self.assertEqual(check_prompt(text), [], name)
            self.assertEqual(set(DOMAINS[name]), set(FIELDS) - {'subject', 'action', 'environment'}, name)

    def test_override_beats_default(self):
        text = build_prompt({'subject': 'A cake', 'action': 'on a table', 'lighting': 'candle light'}, 'food')
        self.assertIn('Candle light', text)
        self.assertNotIn('window light', text)

    def test_negation_and_repeat_flagged(self):
        self.assertTrue(check_prompt('A car with no people.'))
        self.assertTrue(check_prompt('A car. A car.'))

    def test_bad_input(self):
        with self.assertRaises(ValueError): build_prompt({'subject': 'x'}, 'car')
        with self.assertRaises(ValueError): build_prompt({'subject': 'x', 'action': 'y', 'bogus': 'z'})
        with self.assertRaises(ValueError): build_prompt({'subject': 'x', 'action': 'y'}, 'boat')


if __name__ == '__main__':
    unittest.main()
