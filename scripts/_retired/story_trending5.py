"""Five original 15-second home-cooking films from the November 2026 trending-dish list (food-first, hands only, voiced with subtitles).
Writes drafts/generated/<slug>.local-scenario.json. Style reference for pacing only: https://www.youtube.com/shorts/bkUpOMCZ9GQ"""
import json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
base = json.load(open(ROOT / 'drafts/generated/nine-course-table.local-scenario.json'))
STYLE = ('photoreal bright home-kitchen cooking video, soft natural window light, white marble counter, '
         'macro food close-ups with a few hands only, no faces, steam and texture visible, shallow depth of field, vertical framing')
SRC = ['https://www.bonappetit.com/gallery/best-recipes-2026', 'https://www.youtube.com/shorts/bkUpOMCZ9GQ']

DISHES = [
 dict(slug='hot-honey-salmon', title='Hot Honey Glazed Salmon', food='a crisp-skinned salmon fillet in a black skillet with a glossy hot honey glaze, chili flakes and a lime wedge',
  ending='Glossy hot honey glaze is spooned over the crisp salmon and it shines.',
  beats=[('Five minutes, one pan, yet this salmon looks restaurant glossy. Hungry?',
          'a seasoned salmon fillet skin-side down sizzling in a hot black skillet, a hand tilts the pan', 'A hand lifts the black skillet and the salmon sears and sizzles while steam rises. Camera locked.'),
         ('Warm honey, chili flakes and a splash of vinegar bubble into glaze.',
          'a small saucepan of bubbling amber hot honey with red chili flakes and a wooden spoon', 'A hand stirs the bubbling amber honey in the saucepan as chili flakes melt in. Camera locked.'),
         ('Spoon it over crisp salmon, and watch it shine. Save this dinner.',
          'the crisp salmon fillet with a glossy hot honey glaze, lime wedge and chili flakes, a spoon above it', 'A hand lifts a spoon and pours glossy hot honey glaze over the crisp salmon; the glaze shines. Camera locked.')]),
 dict(slug='bacon-gruyere-egg-bites', title='Bacon and Gruyere Egg Bites', food='soft golden egg bites with crispy bacon and melted Gruyere cheese in a muffin tin',
  ending='A fork breaks open the soft egg bite and melted Gruyere cheese stretches.',
  beats=[('One blender, yet twelve fluffy egg bites ready in minutes. Ready?',
          'a blender pouring a pale yellow egg mixture into a silicone muffin tin on a marble counter', 'Pale egg mixture pours from the blender into the muffin tin cups. Camera locked.'),
         ('Crispy bacon and grated Gruyere cheese go into every cup before they bake.',
          'a muffin tin of egg mixture, a hand sprinkling crispy bacon pieces and grated Gruyere cheese on top', 'A hand sprinkles crispy bacon and grated Gruyere over the egg cups, and the cheese begins to melt. Camera locked.'),
         ('Soft, golden and cheesy. Break one open and save the recipe.',
          'golden egg bites on a plate, one broken open showing soft egg, bacon and melted cheese', 'A fork breaks open the soft egg bite and melted Gruyere cheese stretches; steam rises. Camera locked.')]),
 dict(slug='spicy-peanut-noodles', title='Spicy Peanut Noodles', food='glossy noodles coated in spicy peanut sauce with sliced scallions, sesame seeds and crushed peanuts in a white bowl',
  ending='Chopsticks lift glossy peanut noodles and the sauce clings and shines.',
  beats=[('Ten minutes, one bowl, yet noodles this creamy. Want the sauce?',
          'a small bowl of creamy peanut sauce being whisked with a spoon, chili oil swirling in', 'A hand stirs the peanut butter sauce with a spoon while chili oil swirls in. Camera locked.'),
         ('Peanut butter, soy, garlic and chili oil, whisked until smooth.',
          'hot cooked noodles tossed in tongs above a bowl with dark glossy peanut sauce', 'Tongs lift the hot noodles and toss them in the glossy peanut sauce until coated. Camera locked.'),
         ('Top with scallions and peanuts. Slurp it. Save this one.',
          'a white bowl of glossy spicy peanut noodles with scallions, sesame seeds and crushed peanuts', 'Chopsticks lift glossy peanut noodles and the sauce clings and shines. Camera locked.')]),
 dict(slug='sticky-korean-beef-rice', title='Sticky Korean Beef and Rice', food='sticky glazed Korean-style ground beef over steamed white rice in a bowl with sesame seeds and sliced scallions',
  ending='A spoon lifts sticky Korean beef over the steaming rice and sauce glistens.',
  beats=[('Five minutes of prep, yet this beef is sticky, sweet and savory.',
          'ground beef browning and crumbling in a hot skillet with a wooden spoon', 'A hand breaks up the browning ground beef in the hot skillet with a wooden spoon. Camera locked.'),
         ('Soy, brown sugar, garlic and ginger turn the pan into glaze.',
          'dark glossy sauce bubbling around ground beef in the skillet, steam rising', 'Dark sticky sauce bubbles and a hand stirs it so it coats the browning beef; steam rises. Camera locked.'),
         ('Spoon it over rice, add sesame seeds. Dinner in twenty minutes.',
          'a white bowl of steamed rice topped with sticky glazed Korean beef, sesame seeds and sliced scallions', 'A spoon lifts sticky Korean beef over the steaming rice and sauce glistens. Camera locked.')]),
 dict(slug='cottage-cheese-pasta-sauce', title='Creamy Cottage Cheese Pasta Sauce', food='silky pale cream pasta sauce made from blended cottage cheese coating pasta, black pepper and parmesan in a white bowl',
  ending='A fork twirls the creamy pasta and the smooth sauce coats every strand.',
  beats=[('One tub of cottage cheese, but a sauce this silky. Believe it?',
          'a blender filled with cottage cheese, garlic and parmesan, creamy and pale', 'The blender spins and the cottage cheese blends into a smooth pale cream. Camera locked.'),
         ('Blend it smooth, warm it gently, and toss it with hot pasta.',
          'a pan of hot pasta with creamy pale sauce poured over it and tongs mixing', 'Creamy blended sauce pours over the hot pasta and tongs toss it until coated. Camera locked.'),
         ('Creamy, high in protein, and ready fast. Save it for tonight.',
          'a white bowl of creamy pasta with black pepper and grated parmesan, a fork twirling', 'A fork lifts and twirls the creamy pasta and the smooth sauce coats every strand. Camera locked.')]),
]

SOUNDS = {
 'hot-honey-salmon': ['loud pan sizzle, soft kitchen room tone', 'honey bubbling, wooden spoon on saucepan', 'spoon drizzle, glossy glaze, light sizzle'],
 'bacon-gruyere-egg-bites': ['blender pour, liquid into silicone tin', 'crispy bacon crumble, cheese sprinkle', 'fork crack, soft steam, cheese stretch'],
 'spicy-peanut-noodles': ['whisk against bowl, thick sauce stir', 'tongs toss, wet noodles, sauce slap', 'chopstick lift, soft slurp, crunch of peanuts'],
 'sticky-korean-beef-rice': ['beef sizzle, wooden spoon scrape', 'thick sauce bubbling, spoon stir', 'spoon into rice, soft steam, sauce drip'],
 'cottage-cheese-pasta-sauce': ['blender whirr, creamy blend', 'sauce pour, tongs toss on pasta', 'fork twirl, soft pasta rustle'],
}
IDEA_ANGLES = ['three-beat quick recipe', 'macro hero close-up', 'steam and texture payoff', 'hands only, food first', 'save-for-later dinner']

LUXE = os.environ.get('LUXE') == '1'
ONLY = [x for x in os.environ.get('SLUGS', '').split(',') if x]
LUXE_STYLE = ('photoreal luxury designer kitchen, dark navy cabinetry with brass fixtures, polished black and gold marble counter, '
              'copper cookware, gold utensils, one emerald green enamel accent, warm soft key light with window glow, '
              'macro food close-ups with a few hands only, no faces, steam and texture visible, shallow depth of field, vertical framing')
SWAPS = [('black skillet', 'copper skillet'), ('small saucepan', 'small copper saucepan'), ('saucepan', 'copper saucepan'),
         ('wooden spoon', 'gold spoon'), ('silicone muffin tin', 'gold-toned muffin tin'), ('a muffin tin', 'a gold-toned muffin tin'),
         ('white bowl', 'emerald enamel bowl'), ('white plate', 'gold-rimmed white plate'), ('the blender', 'a rose-gold blender')]
def luxe(x):
    for a, b in SWAPS:
        x = x.replace(a, b)
    return x

# MASTER=1: prompts written to the official FLUX.2 Klein / LTX-2.3 guides plus the house "food zoom" rule
# (dish named first, extreme macro, positive wording, one slow push in, still -> action -> settle). Salmon has its own script.
MASTER = os.environ.get('MASTER') == '1'
OUT_SUFFIX = os.environ.get('OUT_SUFFIX', '')
M_STYLE = ('photoreal luxury designer kitchen, navy cabinetry with brass fixtures, polished black and gold marble counter, copper cookware, '
           'gold utensils, one emerald green enamel accent, warm key light with bright rim light, extreme macro food close-ups, hands only, vertical framing')
M_SETTING = ('It sits on a polished black and gold marble counter in a luxury designer kitchen, navy cabinetry and brass fixtures softly blurred behind, '
             'with one emerald green enamel accent glowing far in the background.')
M_TEXTURE = 'Fine texture shows on the food, with glistening highlights and a thin curl of steam rising.'
M_LIGHT = 'Warm key light from camera-left with a bright rim light along the glossy highlights and deep soft shadows.'
M_CAM = ('Photorealistic macro food photograph, {angle}, 100mm macro lens at f/2.8, shallow depth of field, creamy bokeh, sharp focus on the food. '
         'Only one hand enters the frame, holding at most one utensil that touches the food, and every surface is clean and unmarked.')
M_ANGLES = ['low 30-degree angle', 'overhead 60-degree view', 'side angle at counter height']
PUSH = 'The camera makes one slow push in toward {x} until {end}.'
MASTER_MOTION = {
 'bacon-gruyere-egg-bites': [
  'Extreme close-up on the gold-toned muffin tin. The cups sit empty, then pale egg mixture pours from the rose-gold blender in a smooth steady stream and fills each cup as the surface settles flat. ' + PUSH.format(x='the filling cup', end='the pour ends'),
  'Extreme close-up on the egg cups in the gold-toned muffin tin. The mixture sits still, then a hand sprinkles crispy bacon pieces and grated Gruyere over each cup as the pieces land softly and the cheese begins to melt. ' + PUSH.format(x='the nearest cup', end='the hand lifts away'),
  'Extreme close-up on a golden egg bite on the gold-rimmed plate. The bite sits still, then a fork breaks open the soft egg bite and melted Gruyere cheese stretches in a long strand as steam rises. ' + PUSH.format(x='the stretching cheese', end='the fork rests')],
 'spicy-peanut-noodles': [
  'Extreme close-up on the small bowl of peanut sauce. The sauce sits still, then a hand stirs the peanut butter sauce slowly with a gold spoon as red chili oil swirls in and turns it glossy. ' + PUSH.format(x='the swirl', end='the stirring slows to a stop'),
  'Extreme close-up on the hot noodles above the bowl. The noodles hang still, then gold tongs lift the hot noodles and toss them gently in the glossy peanut sauce as the sauce coats every strand and steam rises. ' + PUSH.format(x='the noodles', end='the tongs rest'),
  'Extreme close-up on the emerald enamel bowl of noodles topped with scallions and crushed peanuts. The bowl sits still, then chopsticks lift glossy peanut noodles slowly and the sauce clings and shines as it drips back in a thin ribbon. ' + PUSH.format(x='the lifted noodles', end='they hold still')],
 'sticky-korean-beef-rice': [
  'Extreme close-up on the ground beef in the copper skillet. The beef sits still, then a hand breaks up the browning ground beef with a gold spoon as it crumbles and sizzles and steam rises. ' + PUSH.format(x='the browning beef', end='the spoon rests'),
  'Extreme close-up on the copper skillet. The beef sits still, then dark sticky sauce bubbles around it and a hand stirs it slowly so the glaze coats the browning beef as steam rises. ' + PUSH.format(x='the glossy glaze', end='the stirring slows to a stop'),
  'Extreme close-up on the emerald enamel bowl of steamed rice. The rice sits still, then a spoon lifts sticky Korean beef over the steaming rice and lays it down gently as the sauce glistens and drips. ' + PUSH.format(x='the glistening beef', end='the spoon lifts away')],
 'cottage-cheese-pasta-sauce': [
  'Extreme close-up on the rose-gold blender jar. The cottage cheese sits still, then the blender spins and the cottage cheese blends into a smooth pale cream as it folds over itself in slow waves. ' + PUSH.format(x='the swirling cream', end='the blending stops'),
  'Extreme close-up on the hot pasta in the copper skillet. The pasta sits still, then creamy blended sauce pours over the hot pasta in a thick ribbon and gold tongs toss it gently as every strand is coated and steam rises. ' + PUSH.format(x='the pasta', end='the tongs rest'),
  'Extreme close-up on the emerald enamel bowl of creamy pasta with black pepper and parmesan. The pasta sits still, then a fork lifts and twirls the creamy pasta slowly as the smooth sauce coats every strand and stretches. ' + PUSH.format(x='the twirl', end='the fork holds still')],
}
def master_image(d, i, scene):
    return (f"{d['title']}, extreme macro close-up: {luxe(scene)}, the food filling most of the frame. {M_SETTING} {M_TEXTURE} "
            f"{M_LIGHT} {M_CAM.format(angle=M_ANGLES[i])}")

for d in DISHES:
    if ONLY and d['slug'] not in ONLY:
        continue
    if MASTER and d['slug'] not in MASTER_MOTION:
        print('skip (own master script):', d['slug']); continue
    s = json.loads(json.dumps(base))
    s['settings'].update(seconds=15, presentationMode='voiced')
    s['topic'] = f"{d['title']}: a quick trending home recipe in three beats"
    STY = M_STYLE if MASTER else (LUXE_STYLE if LUXE else STYLE)
    s['style'] = STY
    s['requestedEnding'] = d['ending']
    s['totalSeconds'] = 15
    s['sourceReview'] = {'checkedAt': '2026-11-14', 'trendLabel': 'dish named on a 2026 recipe list (Bon Appetit gallery); pacing reference only, not a verified view trend', 'sources': SRC}
    shots = []
    for i, (line, scene, motion) in enumerate(d['beats']):
        shots.append({'seconds': 5, 'narration': line,
            'imagePrompt': f"Photoreal close-up of {luxe(scene) if LUXE else scene}. The food is the clear hero of the frame. Visual style: {STY}. Continuity: the same {luxe(d['food']) if LUXE else d['food']} and the same {'luxury designer' if LUXE else 'bright home'} kitchen throughout. No faces, no text, no labels.",
            'motionPrompt': luxe(motion) if LUXE else motion, 'sound': SOUNDS[d['slug']][i]})
        if MASTER:
            shots[-1]['imagePrompt'] = master_image(d, i, scene)
            shots[-1]['motionPrompt'] = MASTER_MOTION[d['slug']][i]
    p = s['plan']
    p.update(title=d['title'], hook=d['beats'][0][0], payoff=d['ending'], shots=shots,
             claimsToCheck=['Dish named on a 2026 recipe list; confirm the original recipe credit before publishing', 'AI-generated original footage; no reference footage, audio or branding reused', 'Do not state protein or time figures as facts without a source'],
             ideas=[{'title': d['title'] if k == 0 else f"{d['title']} idea {k+1}", 'angle': a} for k, a in enumerate(IDEA_ANGLES)])
    for k in ('storyArc', 'qualityChecks'):
        s.pop(k, None)
    out = ROOT / f"drafts/generated/{d['slug']}{OUT_SUFFIX}.local-scenario.json"
    out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    words = [len(b[0].split()) for b in d['beats']]
    print(out.name, words)
