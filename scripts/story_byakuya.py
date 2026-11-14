#!/usr/bin/env python3
"""Story film: Cellato 'Byakuya', Guinness World Records most expensive ice cream (JP 873,400 yen, about $6,696, announced 18 May 2023).
Facts: Guinness World Records release via UPI, Mental Floss, KTVU/Fox, Daily Hive, Straits Times. Writes drafts/generated/byakuya.local-scenario.json.
Narration is sized to the story gate (2.5 words/s) so the silence gate does not trip."""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from template_to_scenario import STYLE, CONTINUITY

ITEM = 'a small glass jar of pale gelato dusted with shaved white truffle and edible gold leaf, a small metal spoon beside it'
BEATS = [
    ("One jar, yet 18 months to perfect. Guess the price?",
     f'Macro hero close-up of {ITEM}, on a black slate beside a copper pan, cold mist drifting',
     'The camera pushes in slowly on the jar while cold mist drifts and the gold leaf glints'),
    ("It starts with white truffle from Alba, Italy, worth fifteen thousand dollars a kilo.",
     f'White-gloved hand shaves a pale white truffle over {ITEM}',
     'The gloved hand pulls the truffle across a fine shaver and thin shavings drop'),
    ("Then Parmigiano Reggiano, sake lees, and edible gold leaf.",
     f'Tweezers lay a flake of gold leaf beside a wedge of Parmigiano Reggiano next to {ITEM}',
     'The tweezers lower the gold leaf flake slowly toward the gelato'),
    ("A chef from Osaka helped blend Italy with Japan.",
     f'A small white sake cup and a white truffle sit beside {ITEM} on black slate',
     'The camera glides sideways across the sake cup, the truffle and the jar'),
    ("It arrives in a tiny glass jar, with a handcrafted metal spoon.",
     f'A handcrafted metal spoon rests beside {ITEM} on black slate',
     'The camera glides slowly along the metal spoon toward the jar'),
    ("Three. Two. One.",
     f'White-gloved hand holds a metal spoon just above {ITEM}',
     'The spoon lowers slowly toward the gelato and stops just above it'),
    ("Six thousand, six hundred ninety-six dollars. A Guinness record.",
     f'Hero shot of {ITEM} glowing with warm gold light, gold flakes sparkling',
     'The camera pulls back slowly while the gold leaf sparkles in the warm light'),
    ("Would you taste it? Comment your guess.",
     f'A white-gloved hand presents {ITEM} toward the camera on a black slate',
     'The gloved hand pushes the jar gently toward the camera and holds it still, inviting viewers to comment their guess'),
]
shots = [{'seconds': max(2, math.ceil(len(t.split()) / 2.5)), 'narration': t,
          'imagePrompt': f'{i}. Visual style: {STYLE}. {CONTINUITY}'[:1000], 'motionPrompt': f'{m}. One continuous take, no cuts.'[:1000],
          'sound': 'soft kitchen ambience, gentle chime of glass'} for t, i, m in BEATS]
total = sum(s['seconds'] for s in shots)
ending = 'Would you taste it? Comment your guess.'
topic = 'Byakuya ice cream: the $6,696 gelato'
ideas = [{'title': f'Byakuya: angle {n}', 'angle': a} for n, a in enumerate(
    ['A year and a half to perfect', 'White truffle from Alba', 'Italy meets Japan', 'Guinness record ice cream', 'The tiny jar and metal spoon'], 1)]
plan = {'ideas': ideas, 'title': topic, 'hook': BEATS[0][0], 'payoff': ending, 'shots': shots,
        'claimsToCheck': ['price JP 873,400 yen = about $6,696 (Guinness World Records, 18 May 2023; UPI; Fox)', 'over 1.5 years to develop (Cellato via Guinness)',
                          'Alba white truffle about $15,192/kg (Guinness)', 'Parmigiano Reggiano, sake lees, edible gold leaf (Guinness; UPI)',
                          'Osaka chef Tadayoshi Yamada of RiVi helped (Guinness; Mental Floss)', '130 ml glass jar, handcrafted metal spoon (Fox/KTVU; Cellato)',
                          'record may have been beaten since 2023: re-check Guinness before upload']}
scenario = {'status': 'review-required', 'settings': {'brand': 'Billionaire Bites', 'format': 'short', 'seconds': total, 'voice': 'af_heart'},
            'model': 'hand-written', 'topic': topic, 'style': STYLE, 'requestedEnding': ending, 'totalSeconds': total, 'template': 'story', 'plan': plan}
out = Path('drafts/generated/byakuya.local-scenario.json'); out.write_text(json.dumps(scenario, indent=2))
print(f'Wrote {out}: {len(shots)} shots, {total} s')
for n, s in enumerate(shots, 1): print(n, s['seconds'], 's |', s['narration'])
