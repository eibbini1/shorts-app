import copy
import json
import unittest
from pathlib import Path

from evidence_gate import check

ROOT = Path(__file__).resolve().parents[1]
SCENARIO = json.loads((ROOT / 'examples/local-scenarios/shallot-garlic-bread-20.local-scenario.json').read_text())
PRICES = json.loads((ROOT / 'data/prices.json').read_text())


class EvidenceGateTests(unittest.TestCase):
    def fresh(self):
        return copy.deepcopy(SCENARIO)

    def test_garlic_bread_has_no_unsupported_claim(self):
        problems, notes, _ = check(self.fresh(), PRICES, {'films': []})
        self.assertEqual(problems, [])
        self.assertTrue(any('history is empty' in n for n in notes))

    def test_same_signature_as_previous_published_film_blocks(self):
        film = self.fresh()
        history = {'films': [{'creativeSignature': copy.deepcopy(film['creativeSignature'])}]}
        problems, _, _ = check(film, PRICES, history)
        self.assertTrue(any('same format' in p for p in problems))
        film['creativeSignature']['set'] = 'bright-test-kitchen'
        self.assertEqual(check(film, PRICES, history)[0], [])

    def test_price_requires_sourced_basket_and_correct_total(self):
        film = self.fresh()
        film['plan']['hook'] = 'A $5000 garlic bread?'
        self.assertTrue(check(film, PRICES, {'films': []})[0])
        film['priceBasket'] = {'currency': 'USD', 'label': 'retail package basket',
                               'lines': [{'id': 'ground-lamb-1lb', 'quantity': 1}], 'displayTotal': '10.96'}
        self.assertTrue(check(film, PRICES, {'films': []})[0])
        film['plan']['hook'] = 'A $10.96 retail ingredient basket.'
        self.assertEqual(check(film, PRICES, {'films': []})[0], [])

    def test_record_claim_requires_exact_dish_amount_and_year(self):
        film = self.fresh()
        film['plan']['hook'] = "World's most expensive pizza: $2,700 in 2017."
        self.assertEqual(check(film, PRICES, {'films': []})[0], [])
        film['plan']['hook'] = "World's most expensive pizza: $2,700."
        self.assertTrue(check(film, PRICES, {'films': []})[0])
        film['plan']['hook'] = "World's most expensive kebab: €5,000 in 2021."
        self.assertTrue(check(film, PRICES, {'films': []})[0])


if __name__ == '__main__':
    unittest.main()
