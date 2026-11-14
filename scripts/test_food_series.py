import unittest
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


class FoodSeriesTests(unittest.TestCase):
    def test_five_distinct_series_fit_editorial_rotation(self):
        data = json.loads((ROOT / 'data/food-series.json').read_text())
        allowed = set(json.loads((ROOT / 'data/format-rotation.json').read_text())['formats'])
        series = data['series']
        self.assertEqual(len(series), 5)
        self.assertEqual(len({row['id'] for row in series}), 5)
        self.assertTrue(all(row['format'] in allowed for row in series))
        self.assertTrue(all(len(row['episodes']) >= 3 for row in series))
        self.assertTrue(all(row['storyRule'] and row['soundRule'] and row['hookPattern'] for row in series))


if __name__ == '__main__':
    unittest.main()
