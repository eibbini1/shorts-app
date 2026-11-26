"""Shared look & genre profile resolver for Python pipeline scripts.

Reads data/looks.json when available and falls back to an identical built-in config
so isolated temp fixtures without data/ continue to run cleanly.
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_LOOKS_CONFIG = {
    'version': 1,
    'defaultLook': 'food',
    'foodKeywords': [
        'arancini', 'bake', 'baked', 'baking', 'beef', 'bowl', 'bread', 'burger',
        'cabbage', 'cake', 'caviar', 'champagne', 'cheese', 'chef', 'chocolate',
        'coffee', 'cook', 'cooked', 'cooker', 'cooking', 'cookware', 'dessert',
        'dish', 'drink', 'dumpling', 'dumplings', 'egg', 'food', 'fries', 'garlic',
        'halloumi', 'hot dog', 'hot-dog', 'kebab', 'kitchen', 'meal', 'noodle', 'noodles',
        'pasta', 'pastry', 'pizza', 'plate', 'recipe', 'salad', 'sauce', 'scallop',
        'sear', 'seared', 'searing', 'soup', 'steak', 'sushi', 'taco', 'toast',
        'toasted', 'truffle', 'wagyu',
    ],
    'foodSubstringKeywords': ['حلوم', 'المقلاة', 'طبخ', 'وصفة'],
    'foodOnlyAudioCues': [
        'chew', 'clink', 'crunch', 'fizz', 'pour', 'scrape', 'sizzle', 'slice',
    ],
    'looks': {
        'food': {
            'label': 'Food & culinary',
            'style': 'luxury cinematic food film',
            'set': 'dark luxury kitchen',
            'defaultStudio': 'luxury-kitchen',
            'minPromptScore': 85,
            'foodDomain': True,
            'chainShotsByDefault': False,
            'continuityQuestion': (
                'The left half and the right half are two moments from one cooking video. '
                'Do both halves show the same kind of food with the same kind of topping?'
            ),
        },
        'cartoon': {
            'label': '2D cartoon',
            'style': 'hand-drawn 2D cartoon animation, bold outlines, flat vibrant colors, expressive characters',
            'set': 'a colourful storybook world that fits the story',
            'defaultStudio': None,
            'minPromptScore': 0,
            'foodDomain': False,
            'chainShotsByDefault': True,
            'continuityQuestion': (
                'The left half and the right half are two moments from one short film. '
                'Do both halves show the same main character or object, looking the same?'
            ),
        },
        'night': {
            'label': 'Night cartoon',
            'style': (
                'hand-drawn 2D cartoon animation at night, deep navy blue sky and shadows with warm creamy '
                'ivory highlights, glowing cream lights, limited navy and cream palette, bold outlines'
            ),
            'set': 'a moonlit navy-blue night scene with cream-coloured lights',
            'defaultStudio': None,
            'minPromptScore': 0,
            'foodDomain': False,
            'chainShotsByDefault': True,
            'continuityQuestion': (
                'The left half and the right half are two moments from one short film. '
                'Do both halves show the same main character or object, looking the same?'
            ),
        },
        'custom': {
            'label': 'Custom',
            'style': 'cinematic short film matching the idea',
            'set': 'a setting that fits the idea',
            'defaultStudio': None,
            'minPromptScore': 0,
            'foodDomain': False,
            'chainShotsByDefault': True,
            'continuityQuestion': (
                'The left half and the right half are two moments from one short film. '
                'Do both halves show the same main character or object, looking the same?'
            ),
        },
    },
}


def load_looks_config(path=None):
    target = Path(path) if path is not None else ROOT / 'data/looks.json'
    try:
        parsed = json.loads(target.read_text(encoding='utf-8'))
        if isinstance(parsed, dict) and isinstance(parsed.get('looks'), dict):
            return parsed
    except FileNotFoundError:
        pass
    return DEFAULT_LOOKS_CONFIG


_CONFIG = load_looks_config()
DEFAULT_LOOK = _CONFIG['defaultLook']
LOOKS = _CONFIG['looks']
LOOK_IDS = tuple(LOOKS.keys())
FOOD_ONLY_AUDIO_CUES = frozenset(_CONFIG['foodOnlyAudioCues'])
_FOOD_PARTS = [r'\b(?:' + '|'.join(re.escape(word) for word in _CONFIG['foodKeywords']) + r')\b']
if _CONFIG.get('foodSubstringKeywords'):
    _FOOD_PARTS.append('(?:' + '|'.join(re.escape(word) for word in _CONFIG['foodSubstringKeywords']) + ')')
FOOD_RE = re.compile('|'.join(_FOOD_PARTS), re.I)


def is_valid_look(value):
    return isinstance(value, str) and value in LOOKS


def resolve_look_id(value):
    return value if is_valid_look(value) else DEFAULT_LOOK


def get_look_profile(value):
    return LOOKS[resolve_look_id(value)]


def scenario_look(scenario):
    if not isinstance(scenario, dict):
        return None
    settings = scenario.get('settings')
    candidate = settings.get('look') if isinstance(settings, dict) else None
    if not is_valid_look(candidate):
        candidate = scenario.get('look')
    return candidate if is_valid_look(candidate) else None


def is_food_text(text):
    return bool(FOOD_RE.search(str(text or '')))


def is_food_scenario(scenario):
    look = scenario_look(scenario)
    if look is not None and look != 'custom':
        return bool(LOOKS[look]['foodDomain'])
    if not isinstance(scenario, dict):
        return False
    parts = [str(scenario.get('topic') or '')]
    shots = (scenario.get('plan') or {}).get('shots') or []
    for shot in shots:
        if isinstance(shot, dict):
            parts.append(str(shot.get('imagePrompt') or ''))
            parts.append(str(shot.get('motionPrompt') or ''))
    return is_food_text(' '.join(parts))


def min_prompt_score_for(scenario=None, env_override=None, look=None):
    override = os.environ.get('SHORTS_MIN_PROMPT_SCORE') if env_override is None else env_override
    if override is not None and str(override).strip() and str(override).strip().lower() != 'auto':
        return max(0, int(str(override).strip()))
    if is_valid_look(look):
        return int(LOOKS[look]['minPromptScore'])
    explicit = scenario_look(scenario)
    if explicit is not None:
        return int(LOOKS[explicit]['minPromptScore'])
    if isinstance(scenario, dict):
        return int(LOOKS['food']['minPromptScore']) if is_food_scenario(scenario) else 0
    return int(LOOKS[DEFAULT_LOOK]['minPromptScore'])


def default_studio_for(scenario=None, look=None):
    if is_valid_look(look):
        return LOOKS[look]['defaultStudio']
    explicit = scenario_look(scenario)
    if explicit is not None:
        return LOOKS[explicit]['defaultStudio']
    if isinstance(scenario, dict):
        return LOOKS['food']['defaultStudio'] if is_food_scenario(scenario) else None
    return LOOKS[DEFAULT_LOOK]['defaultStudio']


def continuity_question_for(scenario):
    explicit = scenario_look(scenario)
    if explicit is not None and explicit != 'custom':
        return LOOKS[explicit]['continuityQuestion']
    return LOOKS['food' if is_food_scenario(scenario) else 'custom']['continuityQuestion']
