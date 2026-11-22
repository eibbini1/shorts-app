"""Original opening-hook bank (data/hook-bank.json): classify a line by mechanism and list patterns.

Heuristic only. Classification never changes a hook score; it labels which mechanism a line uses so the
preflight output can say what gap the hook opens.
"""
import json
import re
from pathlib import Path

BANK_PATH = Path(__file__).resolve().parents[1] / 'data' / 'hook-bank.json'
# A line that matches only these loose mechanisms is reported as weak evidence.
_LOOSE = {'specificity', 'question'}


def load_bank(path=BANK_PATH):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def detect_mechanisms(line, bank=None):
    """Mechanism names whose detector matches the line, strongest (non-loose) first."""
    bank = bank or load_bank()
    found = [name for name, spec in bank['mechanisms'].items() if re.search(spec['detect'], line or '', re.I)]
    return sorted(found, key=lambda name: (name in _LOOSE, name))


def patterns_for(fit, bank=None):
    """Patterns usable for a subject kind: 'food', 'object' or 'any'."""
    bank = bank or load_bank()
    return [p for p in bank['patterns'] if fit in p['fit'] or 'any' in p['fit']]


def anti_pattern_hit(line, bank=None):
    """Return the banned template phrase the line reproduces, if any."""
    bank = bank or load_bank()
    low = (line or '').lower()
    for phrase in ('the secret nobody', "you won't believe", 'you wont believe', 'nobody tells you', 'number one trick'):
        if phrase in low:
            return phrase
    return None
