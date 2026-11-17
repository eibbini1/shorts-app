"""Look up an exact conversational Jordanian phrase before Sofelia phonemization."""
import json
from pathlib import Path
import re
import unicodedata

DICTIONARY = Path(__file__).resolve().parents[1] / 'data/arabic-pronunciation-ar-JO.json'


def phrase_key(text):
    text = unicodedata.normalize('NFC', text)
    letters = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return ' '.join(re.findall(r'[^\W_]+', letters)).replace('ـ', '')


def load_sofelia_dictionary():
    data = json.loads(DICTIONARY.read_text(encoding='utf-8'))
    phrases = {}
    for row in data['phrases']:
        key = phrase_key(row['text'])
        if not key or key in phrases or not row['ipa'].strip():
            raise ValueError(f'Invalid or duplicate pronunciation phrase: {row["text"]}')
        phrases[key] = row['ipa']
    return phrases
