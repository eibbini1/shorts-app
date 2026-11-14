"""Five original 15-second home-cooking films from the November 2026 trending-dish list (food-first, hands only, voiced with subtitles).
Writes drafts/generated/<slug>.local-scenario.json. Style reference for pacing only: https://www.youtube.com/shorts/bkUpOMCZ9GQ"""
import json
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
         ('Crispy bacon and grated Gruyere go in before they bake.',
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

for d in DISHES:
    s = json.loads(json.dumps(base))
    s['settings'].update(seconds=15, presentationMode='voiced')
    s['topic'] = f"{d['title']}: a quick trending home recipe in three beats"
    s['style'] = STYLE
    s['requestedEnding'] = d['ending']
    s['totalSeconds'] = 15
    s['sourceReview'] = {'checkedAt': '2026-11-14', 'trendLabel': 'dish named on a 2026 recipe list (Bon Appetit gallery); pacing reference only, not a verified view trend', 'sources': SRC}
    shots = []
    for i, (line, scene, motion) in enumerate(d['beats']):
        shots.append({'seconds': 5, 'narration': line,
            'imagePrompt': f"Photoreal close-up of {scene}. The food is the clear hero of the frame. Visual style: {STYLE}. Continuity: the same {d['food']} and the same bright home kitchen throughout. No faces, no text, no labels.",
            'motionPrompt': motion})
    p = s['plan']
    p.update(title=d['title'], hook=d['beats'][0][0], payoff=d['ending'], shots=shots,
             claimsToCheck=['Dish named on a 2026 recipe list; confirm the original recipe credit before publishing', 'AI-generated original footage; no reference footage, audio or branding reused', 'Do not state protein or time figures as facts without a source'],
             ideas=[{'title': d['title'], 'angle': 'three-beat quick recipe'}])
    for k in ('storyArc', 'qualityChecks'):
        s.pop(k, None)
    out = ROOT / f"drafts/generated/{d['slug']}.local-scenario.json"
    out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    words = [len(b[0].split()) for b in d['beats']]
    print(out.name, words)
