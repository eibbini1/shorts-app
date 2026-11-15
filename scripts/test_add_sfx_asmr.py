import importlib.util
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('add_sfx', ROOT / 'scripts/add-sfx.py')
add_sfx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(add_sfx)


class AsmrCoverageTests(unittest.TestCase):
    def test_room_floor_fills_gaps_between_discrete_cues(self):
        shots = [{'seconds': 5, 'sound': 'spatula scrape'}]
        quiet, _ = add_sfx.build(shots, 5, continuous_room=False)
        covered, _ = add_sfx.build(shots, 5, continuous_room=True)
        tail = slice(3 * add_sfx.RATE, 4 * add_sfx.RATE)
        self.assertEqual(float(np.max(np.abs(quiet[tail]))), 0.0)
        self.assertGreater(float(np.sqrt(np.mean(covered[tail] ** 2))), 0.001)


if __name__ == '__main__':
    unittest.main()
