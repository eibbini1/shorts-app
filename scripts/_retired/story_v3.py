"""v3 film format (15 s, five 3-second shots, hard cuts): 1 payoff tease as the hook, 2 top-down ingredients, 3 top-down prep,
4 45-degree cooking, 5 side-macro payoff. Prompts follow the FLUX.2 Klein / LTX-2.3 guides: dish first, one hand, at most one
utensil, positive wording, one slow push in. Writes drafts/generated/<slug>-v3.local-scenario.json.
Usage: python3 scripts/story_v3.py [slug ...]"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
base = json.load(open(ROOT / 'drafts/generated/nine-course-table.local-scenario.json'))
STYLE = ('photoreal luxury designer kitchen, navy cabinetry with brass fixtures, polished black and gold marble counter, copper cookware, '
         'gold utensils, one emerald green enamel accent, warm key light with bright rim light, macro food close-ups, hands only, vertical framing')
SETTING = ('It sits on a polished black and gold marble counter in a luxury designer kitchen, navy cabinetry and brass fixtures softly blurred behind, '
           'with one emerald green enamel accent in the background.')
LIGHT = 'Warm key light from camera-left with a bright rim light along the glossy highlights and deep soft shadows.'
ANGLES = {
 'side': 'Photorealistic macro food photograph from a low side angle at counter height, 100mm macro lens at f/2.8, shallow depth of field, creamy bokeh, the food filling most of the frame.',
 'top': 'Photorealistic overhead food photograph, the camera pointing straight down at the counter in a true top-down flat lay, 50mm lens at f/4, everything in sharp focus, the food centred and filling most of the frame.',
 '45': 'Photorealistic food photograph from a 45-degree angle, 85mm lens at f/2.8, shallow depth of field, the food filling most of the frame.',
}
HANDS = 'Only one hand enters the frame, holding at most one utensil that touches the food, and every surface is clean and unmarked.'
PUSH = 'The camera makes one slow push in toward {x} until {end}.'

DISHES = {
 'spicy-peanut-noodles': dict(title='Spicy Peanut Noodles',
  ending='Chopsticks lift glossy peanut noodles and the sauce clings and shines.',
  shots=[
   ('Ten minutes, yet noodles this creamy?', 'side',
    'gold chopsticks lifting a thick twirl of glossy spicy peanut noodles above an emerald enamel bowl, sauce clinging to every strand, scallions, sesame seeds and crushed peanuts on top',
    'Extreme close-up on the emerald enamel bowl of peanut noodles. The noodles hang still on the gold chopsticks, then the chopsticks lift glossy peanut noodles higher as the sauce clings and shines and drips back in a thin ribbon. ' + PUSH.format(x='the lifted noodles', end='they hold still'),
    'chopstick lift, soft sauce drip'),
   ('Peanut butter, soy, garlic and chili oil.', 'top',
    'five small copper bowls arranged in a neat circle holding creamy peanut butter, dark soy sauce, minced garlic, red chili oil and a nest of fresh noodles',
    'Top-down view of the small copper bowls on the marble counter. The bowls sit still, then a hand sets the bowl of red chili oil gently into place as the oil ripples and settles. ' + PUSH.format(x='the bowls', end='the hand lifts away'),
    'small bowls set on marble, soft kitchen tone'),
   ('Whisk it smooth with hot noodle water.', 'top',
    'one copper bowl of creamy peanut sauce seen from directly above, a gold spoon resting in it, red chili oil swirled in a spiral on the surface',
    'Top-down view of the copper bowl of peanut sauce. The sauce sits still, then a hand stirs the peanut sauce slowly with the gold spoon as the red chili oil swirls into a spiral and the sauce turns glossy. ' + PUSH.format(x='the swirl', end='the stirring slows to a stop'),
    'spoon against bowl, thick sauce stir'),
   ('Toss the hot noodles until they shine.', '45',
    'hot noodles held in gold tongs above an emerald enamel bowl of glossy dark peanut sauce, steam rising',
    'Close-up on the hot noodles above the emerald enamel bowl. The noodles hang still, then the gold tongs lower and toss the hot noodles gently in the glossy peanut sauce as the sauce coats every strand and steam rises. ' + PUSH.format(x='the noodles', end='the tongs rest'),
    'tongs toss, wet noodles, soft steam'),
   ('Scallions, peanuts, then slurp. Save this one.', 'side',
    'an emerald enamel bowl of glossy spicy peanut noodles topped with sliced scallions, sesame seeds and crushed peanuts, gold chopsticks lifting a twirl of noodles',
    'Extreme close-up on the emerald enamel bowl of noodles topped with scallions and crushed peanuts. The bowl sits still, then chopsticks lift glossy peanut noodles slowly and the sauce clings and shines as steam rises. ' + PUSH.format(x='the glossy noodles', end='they hold still'),
    'chopstick lift, soft slurp, peanut crunch')]),
 'charcoal-lamb-kebab': dict(title='Charcoal Lamb Kebab',
  ending='A hand slides the charred lamb kebab off the skewer onto warm flatbread and the juices glisten.',
  shots=[
   ('Juicy charcoal kebab, yet only five ingredients?', 'side',
    'two long minced lamb kebabs on wide flat gold skewers resting over glowing orange charcoal in a brass grill, the meat charred at the edges and glistening with juices, thin smoke rising',
    'Extreme close-up on the lamb kebabs over the glowing charcoal. The skewers sit still, then a hand turns one skewer slowly as the juices glisten and thin smoke rises and drifts. ' + PUSH.format(x='the charred kebab', end='the skewer rests'),
    'charcoal crackle, meat sizzle'),
   ('Lamb, onion, parsley, sumac and chili.', 'top',
    'a copper bowl of fresh minced lamb in the centre with four small copper bowls around it holding grated onion, chopped parsley, deep red sumac and chili flakes',
    'Top-down view of the copper bowl of minced lamb and the small bowls around it. The bowls sit still, then a hand sprinkles deep red sumac over the minced lamb as the spice falls softly and settles. ' + PUSH.format(x='the lamb', end='the hand lifts away'),
    'spice sprinkle, soft kitchen tone'),
   ('Knead it well, then press onto skewers.', 'top',
    'a wide flat gold skewer lying on the marble counter with seasoned minced lamb pressed along it in an even kebab shape with finger ridges, flecks of parsley and chili visible',
    'Top-down view of the gold skewer on the marble counter. The kebab sits still, then a hand presses the seasoned minced lamb gently along the skewer as soft finger ridges form in the meat. ' + PUSH.format(x='the kebab', end='the hand lifts away'),
    'soft meat press, light tap on marble'),
   ('Grill over hot charcoal, turning until charred.', '45',
    'three minced lamb kebabs on gold skewers lined across a brass charcoal grill with glowing orange coals beneath, the meat browning with dark char marks, thin smoke rising',
    'Close-up on the lamb kebabs across the brass charcoal grill. The skewers sit still, then a hand turns the middle skewer slowly as the meat browns and sizzles over the glowing coals and thin smoke rises. ' + PUSH.format(x='the browning kebab', end='the skewer rests'),
    'steady sizzle, charcoal crackle'),
   ('Slide onto warm bread. Save this one.', 'side',
    'a charred minced lamb kebab on a gold skewer laid across warm flatbread on a gold-rimmed plate with a grilled tomato and sumac onions beside it, juices glistening',
    'Extreme close-up on the charred lamb kebab over the warm flatbread. The kebab sits still, then a hand slides the charred lamb kebab off the skewer onto the warm flatbread as the juices glisten and steam rises. ' + PUSH.format(x='the kebab', end='the skewer lifts away'),
    'skewer slide, soft steam')]),
}
ANGLE_IDEAS = ['payoff tease as the hook', 'top-down ingredients', 'top-down prep', 'cooking close-up', 'side-macro payoff']

for slug in (sys.argv[1:] or DISHES):
    d = DISHES[slug]
    s = json.loads(json.dumps(base))
    s['settings'].update(seconds=15, presentationMode='voiced')
    s['topic'] = f"{d['title']}: a quick recipe in five fast shots"
    s['style'] = STYLE
    s['requestedEnding'] = d['ending']
    s['totalSeconds'] = 15
    s['sourceReview'] = {'checkedAt': '2026-11-14', 'trendLabel': 'format modelled on common recipe-Short structure (hook, top-down steps, payoff); not a verified view trend', 'sources': ['https://www.youtube.com/shorts/bkUpOMCZ9GQ']}
    shots = []
    for line, ang, scene, motion, sound in d['shots']:
        shots.append({'seconds': 3, 'narration': line,
                      'imagePrompt': f"{d['title']}: {scene}. {SETTING} {LIGHT} {ANGLES[ang]} {HANDS}",
                      'motionPrompt': motion, 'sound': sound})
    p = s['plan']
    p.update(title=d['title'], hook=d['shots'][0][0], payoff=d['ending'], shots=shots,
             claimsToCheck=['Original recipe wording; confirm quantities before publishing a written recipe', 'AI-generated original footage; no reference footage, audio or branding reused'],
             ideas=[{'title': d['title'] if k == 0 else f"{d['title']} idea {k+1}", 'angle': a} for k, a in enumerate(ANGLE_IDEAS)])
    for k in ('storyArc', 'qualityChecks'):
        s.pop(k, None)
    out = ROOT / f"drafts/generated/{slug}-v3.local-scenario.json"
    out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    print(out.name, [len(x[0].split()) for x in d['shots']])
