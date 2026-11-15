#!/usr/bin/env python3
"""Prompt + story scorer for local scenarios (CPU only, no model calls).

Checks each shot's imagePrompt against FLUX.2 Klein guidance (docs.bfl.ai) and each motionPrompt against
LTX-2.3 guidance (ltx.io prompt guide), then scores the story as one piece (hook -> build -> payoff, continuity).
Official-guide checks are marked [G]; checks that are my own heuristics are marked [H] and are weaker evidence.

Usage: scripts/prompt-lint.py drafts/generated/A.local-scenario.json [B.json ...] [--json] [--min=90]
--min=N prints PASS/FAIL per file and exits 1 if any film scores under N (the render gate).
"""
import json, re, sys
from pathlib import Path

NEG = re.compile(r"\b(no|not|without|never)\s+(faces?|text|logos?|people|labels?|watermarks?)\b", re.I)
QUALITY_TAGS = re.compile(r"\b(8k|4k|masterpiece|ultra[- ]detailed|trending on|best quality)\b", re.I)
CAMERA = re.compile(r"\b(camera locked|static camera|tripod|dolly|camera pans|pans? (?:left|right|up|down|across)|camera tilts|tracking|handheld|push(?:es)?[- ]in|pull(?:s)? back|zoom|orbit|camera circles)\b", re.I)
CHAOS = re.compile(r"\b(splash(es|ing)?|explod\w+|shatter\w*|crash\w*|tumbl\w+|flies|flying|spray\w*|burst\w*)\b", re.I)
READ_TEXT = re.compile(r"\b(sign|logo|label|caption|lettering|written|words)\b", re.I)
LIGHT = re.compile(r"\b(key light|rim light|backlit|side light|window light|soft light|warm light|diffused|golden)\b", re.I)
LENS = re.compile(r"\b(\d{2,3}mm|f/\d|macro|shallow depth|bokeh)\b", re.I)
SEQUENCE = re.compile(r"\b(then|as|until|while|before|after)\b", re.I)
PRESENT = re.compile(r"\b\w+(s|es)\b")  # crude present-tense signal


def words(t):
    return len(re.findall(r"[A-Za-z0-9'-]+", t))


def score_image(p, subject_hint):
    c, notes = 100, []
    n = words(p)
    if n < 30:
        c -= 25; notes.append(f"[G] only {n} words; detailed shots work best at 80-300")
    elif n < 80:
        c -= 8; notes.append(f"[G] {n} words is OK for production; 80+ suits detailed food shots")
    if n > 300:
        c -= 10; notes.append("[G] over 300 words")
    first = p[:140].lower()
    if subject_hint and not any(w in first for w in subject_hint):
        c -= 15; notes.append("[G] the food subject is not in the first ~25 words (earlier words weigh more)")
    if NEG.search(p):
        c -= 10; notes.append("[G] negation ('no faces/text/logos'): describe what you want instead, e.g. 'hands only, clean surface'")
    if QUALITY_TAGS.search(p):
        c -= 10; notes.append("[G] quality tags (8k, masterpiece) add nothing; describe light and texture")
    if p.count(",") > n * 0.22:
        c -= 10; notes.append("[G] reads like a keyword list; write flowing prose")
    if not LIGHT.search(p):
        c -= 10; notes.append("[G] no lighting direction/quality named")
    if not LENS.search(p):
        c -= 6; notes.append("[G] no camera/depth-of-field cue")
    if not re.search(r"\b(macro|close|fill(?:s|ing) most of the frame)\b", p, re.I):
        c -= 6; notes.append("[H] food is not close: say the food is close and fills most of the frame")
    return max(c, 0), notes


def score_motion(p, secs):
    c, notes = 100, []
    n = words(p)
    need = max(int(secs * 8), 25)
    if n < need:
        c -= 20; notes.append(f"[G/H] {n} words for a {secs}s clip; guide says short prompts make the action rush (my target ~{need}+)")
    if not SEQUENCE.search(p):
        c -= 12; notes.append("[G] no start-to-finish sequence (then / as / until)")
    cams = {m.group(0).lower() for m in CAMERA.finditer(p)}
    if not cams:
        c -= 12; notes.append("[G] no camera instruction")
    elif len(cams) > 2:
        c -= 10; notes.append("[G] several camera behaviours; keep one")
    if CHAOS.search(p):
        c -= 15; notes.append("[G] chaotic physics words (splash/burst): risk of artifacts; prefer ribbon/pour/drip")
    if READ_TEXT.search(p):
        c -= 10; notes.append("[G] readable text/logo wording is unreliable")
    if not re.search(r"\b(push(?:es)?[- ]in|zoom|close)\b", p, re.I):
        c -= 6; notes.append("[H] motion is not close on the food: add a slow push in, or a close fixed view")
    if p.count("\n") or p.count(";") > 2:
        c -= 5; notes.append("[G] write one flowing paragraph")
    return max(c, 0), notes


def story_score(plan, style, mode="voiced"):
    shots = plan['shots']
    c, notes = 100, []
    narr = [s['narration'] for s in shots]
    asmr = mode == 'asmr'
    if asmr:
        if re.search(r'sits? still|hangs? still', shots[0]['motionPrompt'], re.I):
            c -= 10; notes.append('[R] sound-led film: shot 1 must move from the first frame (references start mid-action); drop "sits still, then"')
    elif not re.search(r"\?|yet|but|\bhow\b|\bwhy\b", narr[0], re.I):
        c -= 10; notes.append("[H] hook has no contrast/question: add 'yet' or a question to line 1")
    end = plan.get('payoff', '')
    last = shots[-1]['motionPrompt'].lower()
    common = {w for w in re.findall(r"[a-z]{4,}", end.lower())} & set(re.findall(r"[a-z]{4,}", last))
    if len(common) < 2:
        c -= 15; notes.append("[H] last motion shot barely matches the promised ending")
    # continuity: nouns shared by all image prompts
    sets = [set(re.findall(r"[a-z]{5,}", s['imagePrompt'].lower())) for s in shots]
    shared = set.intersection(*sets) if sets else set()
    if len(shared) < 8:
        c -= 15; notes.append(f"[H] only {len(shared)} shared descriptor words across shots; repeat set/prop/lighting words for continuity")
    if len(shots) >= 4 and not any(re.search(r'top-down|overhead|straight down|flat lay|looking down', s['imagePrompt'], re.I) for s in shots):
        c -= 10; notes.append('[H] no top-down shot: recipe films need at least one overhead view of the food')
    first = set(re.findall(r'[a-z]{4,}', (shots[0]['imagePrompt'] + ' ' + shots[0]['motionPrompt']).lower()))
    if not asmr and len({w for w in re.findall(r'[a-z]{4,}', end.lower())} & first) < 2:
        c -= 10; notes.append('[H] shot 1 does not show the finished dish: open on the payoff as the hook')
    if len(shots) < 4 and sum(s['seconds'] for s in shots) >= 12:
        c -= 8; notes.append('[H] fewer than 4 shots in 12+ s: cuts every ~3 s hold attention better than 5 s shots')
    ends = [w for w in re.findall(r"[a-z]{4,}", narr[-1].lower())]
    # [R] = learned from the owner's reference Shorts (FnQTdwVznEs fixed-view build; zkfsqqcFN08 fast top-down assembly)
    avg = sum(s['seconds'] for s in shots) / len(shots)
    if avg > 4:
        c -= 10; notes.append(f'[R] shots average {avg:.1f} s: references cut every 1.5-4 s; split long shots')
    noact = [i + 1 for i, s in enumerate(shots) if not re.search(r'\b(hands?|fingers?|chopsticks|fork|spoon|tongs|spatula|skewer)\b', s['motionPrompt'], re.I)]
    if noact:
        c -= 8; notes.append(f'[R] shots {noact} show no hand or utensil acting on the food: every shot needs one visible action')
    far = [i + 1 for i, s in enumerate(shots) if not re.search(r'\b(macro|close|fill(?:s|ing) most of the frame)\b', s['imagePrompt'], re.I)]
    if far:
        c -= 8; notes.append(f'[R] shots {far} are not framed close: the food must fill most of the frame in every shot')
    if not re.search(r'toward the camera|lifts?|slides?|pours?|stretch|twirl|breaks? open|cut', shots[-1]['motionPrompt'], re.I):
        c -= 8; notes.append('[R] final shot has no reveal action (lift toward camera, cut open, pour, stretch)')
    if not asmr and not any(k in narr[-1].lower() for k in ("save", "follow", "try", "next", "tonight", "?")):
        c -= 5; notes.append("[H] final line has no save/follow/try call to action")
    return max(c, 0), notes


def lint(path):
    d = json.load(open(path))
    plan = d['plan']
    title = plan.get('title', Path(path).stem)
    subj = [w for w in re.findall(r"[a-z]{3,}", title.lower()) if w not in ('and', 'the', 'with')]
    rows, total = [], []
    for i, s in enumerate(plan['shots'], 1):
        ic, inotes = score_image(s['imagePrompt'], subj)
        mc, mnotes = score_motion(s['motionPrompt'], s['seconds'])
        rows.append(dict(shot=i, image=ic, motion=mc, notes=inotes + mnotes))
        total += [ic, mc]
    sc, snotes = story_score(plan, d.get('style', ''), d.get('settings', {}).get('presentationMode', 'voiced'))
    avg = sum(total) / len(total)
    return dict(file=Path(path).name, title=title, prompt_avg=round(avg), story=sc, overall=round(0.7 * avg + 0.3 * sc), shots=rows, story_notes=snotes)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    results = [lint(a) for a in args]
    if '--json' in sys.argv:
        print(json.dumps(results, indent=2)); sys.exit()
    mins = [int(a.split('=')[1]) for a in sys.argv if a.startswith('--min=')]
    gate = mins[0] if mins else None
    for r in results:
        print(f"\n== {r['file']}  overall {r['overall']}  (prompts {r['prompt_avg']}, story {r['story']})")
        for s in r['shots']:
            print(f"  shot {s['shot']}: image {s['image']}  motion {s['motion']}")
            for n in s['notes'][:4]:
                print(f"     - {n}")
        for n in r['story_notes']:
            print(f"  story: {n}")
        if gate is not None:
            print(f"  GATE {'PASS' if r['overall'] >= gate else 'FAIL'}: {r['overall']} vs minimum {gate}" + ('' if r['overall'] >= gate else ' -> fix the lines above, then rerun'))
    if gate is not None and any(r['overall'] < gate for r in results):
        sys.exit(1)
