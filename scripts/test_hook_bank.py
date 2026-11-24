import re
import unittest

import hook_bank


class HookBankTests(unittest.TestCase):
    def test_every_pattern_mechanism_is_known(self):
        bank = hook_bank.load_bank()
        for pattern in bank['patterns']:
            self.assertIn(pattern['mechanism'], bank['mechanisms'])

    def test_each_pattern_spoken_line_matches_its_own_mechanism(self):
        bank = hook_bank.load_bank()
        misses = [p['id'] for p in bank['patterns'] if p['mechanism'] not in hook_bank.detect_mechanisms(re.sub(r'\{number\}', '5', re.sub(r'\{(?!number)\w+\}', 'thing', p['spoken'])), bank)]
        self.assertEqual(misses, [], f'detector misses own patterns: {misses}')

    def test_detects_known_lines(self):
        self.assertIn('question', hook_bank.detect_mechanisms('Will this crust hold the cheese?'))
        self.assertIn('specificity', hook_bank.detect_mechanisms('Three things on the counter.'))
        self.assertIn('contrarian', hook_bank.detect_mechanisms('You can skip the flour and still win.'))
        self.assertEqual(hook_bank.detect_mechanisms('Beautiful golden light.'), [])

    def test_anti_pattern_hit(self):
        self.assertEqual(hook_bank.anti_pattern_hit('The secret nobody tells you about eggs'), 'the secret nobody')
        self.assertIsNone(hook_bank.anti_pattern_hit('Three eggs, one pan.'))

    def test_patterns_for_food_includes_any(self):
        ids = {p['id'] for p in hook_bank.patterns_for('food')}
        self.assertIn('tr-raw-to-glossy', ids)
        self.assertIn('cg-before-it-changes', ids)


if __name__ == '__main__':
    unittest.main()
