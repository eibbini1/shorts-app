import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from presentation_mode import choose


class PresentationModeTests(unittest.TestCase):
    def data(self, seconds, shots, requested='auto'):
        return {'settings': {'seconds': seconds, 'presentationMode': requested},
                'plan': {'shots': [{'sound': 'pour and crack'} for _ in range(shots)]}}

    def test_two_shot_tactile_prototype_uses_asmr(self):
        self.assertEqual(choose(self.data(10, 2))['mode'], 'asmr')

    def test_long_story_keeps_voice_and_captions(self):
        result = choose(self.data(30, 6))
        self.assertTrue(result['voice'])
        self.assertTrue(result['captions'])

    def test_missing_sound_cue_keeps_voice(self):
        data = self.data(10, 2)
        data['plan']['shots'][0]['sound'] = ''
        self.assertEqual(choose(data)['mode'], 'voiced')

    def test_explicit_override_and_invalid_value(self):
        self.assertEqual(choose(self.data(10, 2, 'voiced'))['mode'], 'voiced')
        with self.assertRaisesRegex(ValueError, 'presentationMode'):
            choose(self.data(10, 2, 'silent'))


if __name__ == '__main__':
    unittest.main()
