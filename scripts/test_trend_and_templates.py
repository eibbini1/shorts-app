import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import shorts_templates as st
import trend_signals as ts

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('topic_check', ROOT / 'scripts/topic-check.py')
tc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tc)


class SignalTest(unittest.TestCase):
    def test_duration(self):
        self.assertEqual(ts.parse_duration('PT1M5S'), 65)
        self.assertEqual(ts.parse_duration('PT45S'), 45)
        self.assertEqual(ts.parse_duration('PT1H'), 3600)
        self.assertIsNone(ts.parse_duration('bad'))

    def test_velocity_and_spike(self):
        now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
        self.assertEqual(ts.velocity(1000, datetime(2026, 11, 8, 2, tzinfo=timezone.utc), now), 100)
        self.assertEqual(ts.velocity(50, now, now), 50)
        self.assertEqual(ts.spike_ratio([100] * 7 + [300]), 3)
        self.assertIsNone(ts.spike_ratio([100] * 5))

    def test_scoring(self):
        wiki = {'Wagyu': 3.0, 'Saffron': 1.0, 'Caviar': 2.0}
        videos = [{'title': 'Wagyu burger $1000 vs $1', 'velocity': 500}, {'title': 'Caviar tasting', 'velocity': 100}]
        by = {e['topic']: e for e in ts.score_topics(wiki, videos, ['A5 wagyu steak'], tc.subject)}
        self.assertEqual(set(by['Wagyu']['sources']), {'wikipedia', 'youtube'})
        self.assertTrue(by['Wagyu']['covered'])
        self.assertFalse(by['Caviar']['covered'])
        self.assertNotIn('Saffron', by)

    def test_covered_needs_all_words(self):
        self.assertFalse(ts.covered('Kobe beef', ['Wagyu steak'], tc.subject))


class TemplateTest(unittest.TestCase):
    def setUp(self):
        self.t = st.load_all()

    def test_six_valid(self):
        self.assertEqual(len(self.t), 6)

    def test_fill_and_dollar_rule(self):
        t = self.t['same-item-two-prices']
        slots = dict(item='A5 wagyu', price_a='$120', price_b='$12', difference='the grade', source='x', detail_a='marbled', detail_b='plain')
        self.assertIn('$120 versus $12', st.fill(t, slots, allow_repeat=True)['hook'])
        with self.assertRaises(ValueError):
            st.fill(t, {**slots, 'price_a': '1,000 dirhams'}, allow_repeat=True)
        with self.assertRaises(ValueError):
            st.fill(t, {k: v for k, v in slots.items() if k != 'item'}, allow_repeat=True)

    def test_repeat_item_blocked(self):
        t = self.t['guess-the-price']
        slots = dict(item='Zzz test item', price='$5', rarity_fact='rare', source='x')
        old = st.LOG
        with tempfile.TemporaryDirectory() as d:
            st.LOG = Path(d) / 'log.jsonl'
            st.LOG.write_text(json.dumps({'date': 'x', 'template': 'guess-the-price', 'item': 'zzz test item'}) + '\n')
            with self.assertRaises(ValueError):
                st.fill(t, slots)
            self.assertTrue(st.fill(t, slots, allow_repeat=True))
        st.LOG = old

    def test_pick(self):
        self.assertEqual(st.pick('Banned cheese', self.t)[0], 'banned-foods')
        self.assertEqual(st.pick('Gold burger vs normal burger', self.t)[0], 'same-item-two-prices')


if __name__ == '__main__':
    unittest.main()
