"""MASTER STORY SCRIPT (the only scenario generator; older generators are in scripts/_retired/).
v3 film format (15 s, five 3-second shots, hard cuts): 1 payoff tease as the hook, 2 top-down ingredients, 3 top-down prep,
4 45-degree cooking, 5 side-macro payoff. Prompts follow the FLUX.2 Klein / LTX-2.3 guides: dish first, one hand, at most one
utensil, positive wording, one slow push in. Writes drafts/generated/<slug>-v3.local-scenario.json.
Usage: python3 scripts/story.py [slug ...]   (no slug = all dishes)   |   python3 scripts/story.py --list
Add a dish: append one entry to DISHES (title, ending, five shots of: line, angle, still scene, motion paragraph, sound)."""
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
PUSH = 'The camera makes one very slight, slow push in toward {x}, keeping the whole dish in frame, until {end}.'

# "process" format (owner reference 2026-11-14: a real pastry-chef Short): ONE fixed close view of the same worktop for the whole film,
# the same food changing step by step, gloved hands only, natural sound, tiny step labels instead of narration (presentationMode asmr).
PROCESS_VIEW = ('Photorealistic food photograph from one fixed high front view, the camera looking down at about 50 degrees onto the same '
                'polished black and gold marble worktop, 50mm lens at f/4, the food centred, close and large in the frame, everything on the worktop in sharp focus.')
PROCESS_HANDS = 'Two hands in black chef gloves work on the food from the top edge of the frame, and every surface is clean and unmarked.'
LOCK = 'Static camera, locked in the same close fixed view the whole time.'
# "assembly" format (owner reference zkfsqqcFN08): fast top-down close view of one item being built in gloved hands over the cooking station, a cut every ~2 s, finished item lifted to camera.
ASSEMBLY_VIEW = ('Photorealistic top-down point-of-view food photograph, the camera directly above and very close, 35mm lens at f/4, the food large and centred, filling most of the frame, in sharp focus.')
ASSEMBLY_HANDS = 'Hands in black chef gloves hold and work the food, and every surface is clean and unmarked.'
TOPLOCK = 'Static camera, locked in the same close top-down view.'
# "levels" format (trending price-ladder / level-up comparison): the SAME plate in the SAME dark warm frame, upgraded level by level, with an on-screen level + price counter.
# Look copied from the owner's older, better films: dark background, black marble, warm low-key light, one hero item.
LEVELS_VIEW = ('Photorealistic cinematic food photograph from one fixed front view, the camera looking down at about 40 degrees, 85mm macro lens at f/2.8, shallow depth of field, razor-sharp focus on the food, the plate centred and large, filling the frame from edge to edge.')
LEVELS_SETTING = 'It sits on a polished black marble counter against a dark background with soft warm bokeh lights far behind, in low-key candle-warm light.'
LEVELS_HANDS = 'Only one hand enters the frame, holding at most one tool, and every surface is clean and unmarked.'
FIXED = 'Static camera, locked in the same close fixed view.'
# "cravings" format (owner reference ZAkjXlEoK0M): no voice, no subtitles, true top-down on clean white marble, ONE item centred per shot,
# black-gloved hands, a cut every 2 s, ending on the pull-apart reveal. Render with: scripts/film-v3.sh ... --no-subs --no-punch
CRAVE_VIEW = ('Photorealistic overhead food photograph, the camera pointing straight down in a true top-down view, 50mm lens at f/5.6, everything in sharp focus, '
              'the single item centred, close and filling most of the frame, with clean empty marble around it.')
CRAVE_SETTING = 'It sits on a clean white marble worktop with soft grey veins, the surface otherwise empty.'
CRAVE_LIGHT = 'Bright diffused daylight from above with gentle soft shadows and crisp natural colour.'
CRAVE_HANDS = 'Two hands in black chef gloves enter from the bottom edge of the frame, and every surface is clean and unmarked.'

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
 'hot-honey-salmon': dict(title='Hot Honey Glazed Salmon',
  ending='Glossy hot honey glaze is spooned over the crisp salmon and it shines.',
  shots=[
   ('One skillet, yet salmon this glossy?', 'side',
    'a crisp-skinned salmon fillet in a copper skillet coated in a thick glossy hot honey glaze with red chili flakes, a gold spoon above it with a ribbon of glaze falling',
    'Extreme close-up on the crisp salmon fillet in the copper skillet. The fillet sits still, then the gold spoon tilts and a slow ribbon of glossy hot honey glaze pours over the crisp salmon as the glaze spreads and shines. ' + PUSH.format(x='the glaze', end='the pour ends'),
    'glaze drizzle, light sizzle'),
   ('Salmon, honey, chili flakes, vinegar, lime.', 'top',
    'a raw salmon fillet on a gold-rimmed plate in the centre with small copper bowls of amber honey, red chili flakes and vinegar and two lime wedges around it',
    'Top-down view of the salmon fillet and the small copper bowls. Everything sits still, then a hand sets a lime wedge gently beside the salmon as the honey in its bowl catches the light. ' + PUSH.format(x='the salmon', end='the hand lifts away'),
    'small bowls set on marble, soft kitchen tone'),
   ('Sear it skin-side down until crisp.', 'top',
    'a salmon fillet skin-side down in a copper skillet seen from directly above, the edges turning golden with tiny bubbles of oil around it',
    'Top-down view of the salmon fillet in the copper skillet. The fillet sits still, then a hand presses it gently with a gold spatula as the edges sizzle and turn golden and thin steam rises. ' + PUSH.format(x='the fillet', end='the spatula lifts away'),
    'loud skillet sizzle'),
   ('Bubble honey and chili into a glaze.', '45',
    'a small copper saucepan of bubbling amber hot honey with red chili flakes, a gold spoon resting in it',
    'Close-up on the small copper saucepan. The amber honey sits still, then a hand stirs it slowly with the gold spoon as the honey bubbles and the chili flakes swirl and melt in. ' + PUSH.format(x='the bubbling honey', end='the stirring slows to a stop'),
    'honey bubbling, spoon on saucepan'),
   ('Spoon it over and shine. Save this.', 'side',
    'the crisp salmon fillet on a gold-rimmed plate with a thick glossy hot honey glaze, a lime wedge and chili flakes, a gold spoon above it',
    'Extreme close-up on the crisp salmon fillet on the plate. The fillet sits still, then glossy hot honey glaze is spooned over the crisp salmon in a slow thick ribbon and it shines as steam rises. ' + PUSH.format(x='the shining glaze', end='the spoon lifts away'),
    'spoon drizzle, soft steam')]),
 'bacon-gruyere-egg-bites': dict(title='Bacon and Gruyere Egg Bites',
  ending='A fork breaks open the soft egg bite and melted Gruyere cheese stretches.',
  shots=[
   ('Fluffy egg bites, yet one blender?', 'side',
    'a round golden baked egg bite on a gold-rimmed plate, broken open to show soft yellow egg, crispy bacon pieces and melted Gruyere cheese stretching from a gold fork',
    'Extreme close-up on the golden egg bite on the plate. The bite sits still, then the gold fork lifts one half of the soft egg bite and melted Gruyere cheese stretches in a long strand as steam rises. ' + PUSH.format(x='the stretching cheese', end='the fork holds still'),
    'fork lift, soft steam'),
   ('Eggs, cottage cheese, Gruyere and crispy bacon.', 'top',
    'four small copper bowls holding cracked eggs with bright yolks, white cottage cheese, grated Gruyere cheese and crispy bacon pieces arranged around a rose-gold blender jar',
    'Top-down view of the small copper bowls around the blender jar. The bowls sit still, then a hand sets the bowl of crispy bacon pieces gently into place as the egg yolks glisten. ' + PUSH.format(x='the bowls', end='the hand lifts away'),
    'small bowls set on marble, soft kitchen tone'),
   ('Blend smooth, then pour into the tin.', 'top',
    'a gold-toned muffin tin seen from directly above with its round cups half filled with smooth pale yellow egg mixture',
    'Top-down view of the gold-toned muffin tin. The cups sit still, then pale egg mixture pours in a smooth steady stream into one cup as the surface rises and settles flat. ' + PUSH.format(x='the filling cup', end='the pour ends'),
    'liquid pour into tin'),
   ('Top with bacon and bake until golden.', '45',
    'a gold-toned muffin tin of pale egg mixture with crispy bacon pieces and grated Gruyere cheese scattered on top of each cup',
    'Close-up on the egg cups in the gold-toned muffin tin. The mixture sits still, then a hand sprinkles crispy bacon pieces and grated Gruyere over the nearest cup as the pieces land softly. ' + PUSH.format(x='the nearest cup', end='the hand lifts away'),
    'bacon crumble, cheese sprinkle'),
   ('Soft, golden, cheesy. Save this recipe.', 'side',
    'three round golden baked egg bites on a gold-rimmed plate with crispy bacon on top, one broken open showing soft egg and melted Gruyere cheese, a gold fork beside it',
    'Extreme close-up on the golden egg bites on the plate. The bites sit still, then a fork breaks open the soft egg bite and melted Gruyere cheese stretches slowly as steam rises. ' + PUSH.format(x='the melted cheese', end='the fork rests'),
    'fork break, cheese stretch')]),
 'sticky-korean-beef-rice': dict(title='Sticky Korean Beef and Rice',
  ending='A spoon lifts sticky Korean beef over the steaming rice and sauce glistens.',
  shots=[
   ('Sticky Korean beef, yet twenty minutes?', 'side',
    'an emerald enamel bowl of steamed white rice topped with sticky dark glazed Korean-style ground beef, sesame seeds and sliced scallions, a gold spoon lifting a heap of the beef',
    'Extreme close-up on the emerald enamel bowl of beef and rice. The bowl sits still, then the gold spoon lifts sticky Korean beef slowly as the sauce glistens and drips back in a thin ribbon and steam rises. ' + PUSH.format(x='the glistening beef', end='the spoon holds still'),
    'spoon lift, sauce drip'),
   ('Beef, soy, brown sugar, garlic, ginger.', 'top',
    'a copper bowl of fresh ground beef in the centre with four small copper bowls around it holding dark soy sauce, brown sugar, minced garlic and grated ginger',
    'Top-down view of the copper bowl of ground beef and the small bowls around it. The bowls sit still, then a hand sets the bowl of brown sugar gently into place as the soy sauce ripples and settles. ' + PUSH.format(x='the bowls', end='the hand lifts away'),
    'small bowls set on marble, soft kitchen tone'),
   ('Brown the beef until it crumbles.', 'top',
    'ground beef browning and crumbling in a copper skillet seen from directly above, a gold spoon resting in it, thin steam rising',
    'Top-down view of the copper skillet of ground beef. The beef sits still, then a hand breaks up the browning beef slowly with the gold spoon as it crumbles and sizzles and steam rises. ' + PUSH.format(x='the browning beef', end='the spoon rests'),
    'beef sizzle, spoon scrape'),
   ('Pour the sauce and bubble to glaze.', '45',
    'dark glossy sauce bubbling around browned ground beef in a copper skillet, a gold spoon in the beef, steam rising',
    'Close-up on the copper skillet of beef. The beef sits still, then dark sticky sauce bubbles around it and a hand stirs it slowly so the glaze coats the beef as steam rises. ' + PUSH.format(x='the glossy glaze', end='the stirring slows to a stop'),
    'thick sauce bubbling, spoon stir'),
   ('Spoon over rice, add sesame. Save this.', 'side',
    'an emerald enamel bowl of steamed white rice with sticky glazed Korean beef on top, sesame seeds and sliced scallions, a gold spoon above it',
    'Extreme close-up on the emerald enamel bowl of steamed rice. The rice sits still, then a spoon lifts sticky Korean beef over the steaming rice and lays it down gently as the sauce glistens. ' + PUSH.format(x='the glistening beef', end='the spoon lifts away'),
    'spoon into rice, soft steam')]),
 'cottage-cheese-pasta-sauce': dict(title='Creamy Cottage Cheese Pasta',
  ending='A fork twirls the creamy pasta and the smooth sauce coats every strand.',
  shots=[
   ('Silky pasta sauce, yet no cream?', 'side',
    'an emerald enamel bowl of pasta coated in a smooth pale cream sauce with cracked black pepper and grated parmesan, a gold fork twirling a neat nest of pasta',
    'Extreme close-up on the emerald enamel bowl of creamy pasta. The pasta sits still, then the gold fork twirls the creamy pasta slowly as the smooth sauce coats every strand and stretches. ' + PUSH.format(x='the twirl', end='the fork holds still'),
    'fork twirl, soft pasta rustle'),
   ('Cottage cheese, garlic, parmesan, pepper, pasta.', 'top',
    'five small copper bowls arranged in a neat circle holding white cottage cheese, peeled garlic cloves, grated parmesan, cracked black pepper and a nest of dry pasta',
    'Top-down view of the small copper bowls on the marble counter. The bowls sit still, then a hand sets the bowl of grated parmesan gently into place as the cottage cheese glistens. ' + PUSH.format(x='the bowls', end='the hand lifts away'),
    'small bowls set on marble, soft kitchen tone'),
   ('Blend it until smooth and glossy.', 'top',
    'a rose-gold blender jar seen from directly above filled with smooth pale cream sauce, a glossy swirl on its surface',
    'Top-down view of the rose-gold blender jar. The cream sits still, then the cottage cheese sauce turns slowly in the jar as a glossy swirl folds over itself in soft waves. ' + PUSH.format(x='the swirl', end='the turning stops'),
    'blender whirr, creamy blend'),
   ('Toss with hot pasta until coated.', '45',
    'hot pasta in a copper skillet with smooth pale cream sauce poured over it, gold tongs resting in the pasta, steam rising',
    'Close-up on the hot pasta in the copper skillet. The pasta sits still, then the gold tongs lift and toss the pasta gently as the creamy sauce coats every strand and steam rises. ' + PUSH.format(x='the pasta', end='the tongs rest'),
    'tongs toss, soft sauce'),
   ('Creamy and ready fast. Save it tonight.', 'side',
    'an emerald enamel bowl of creamy pasta with cracked black pepper and grated parmesan, a gold fork lifting a twirl of pasta',
    'Extreme close-up on the emerald enamel bowl of creamy pasta. The pasta sits still, then a fork twirls the creamy pasta and lifts it slowly as the smooth sauce coats every strand. ' + PUSH.format(x='the lifted pasta', end='the fork holds still'),
    'fork twirl, soft steam')]),
 'charcoal-lamb-kebab-process': dict(title='Charcoal Lamb Kebab', suffix='', mode='asmr', shot_seconds=4, view=PROCESS_VIEW, hands=PROCESS_HANDS,
  hook='Juicy charcoal kebab, yet only five ingredients?',
  ending='Gloved hands slide the charred lamb kebab off the skewer onto warm flatbread and the juices glisten.',
  shots=[
   ('Lamb, onion, parsley.', None,
    'a wide copper bowl of fresh minced lamb with grated onion, chopped parsley, deep red sumac and chili flakes on top, not yet mixed',
    'Close fixed view of the copper bowl of minced lamb. The bowl sits still, then the gloved hands press and fold the minced lamb slowly as the onion, parsley and red sumac work into the meat. ' + LOCK,
    'soft meat knead, quiet kitchen tone'),
   ('Knead until sticky.', None,
    'the same wide copper bowl now holding one smooth evenly mixed ball of seasoned minced lamb flecked with parsley and red chili',
    'Close fixed view of the copper bowl. The ball of seasoned lamb sits still, then the gloved hands lift it and press it back down slowly as the meat turns smooth and sticky. ' + LOCK,
    'soft meat press, light slap'),
   ('Press onto the skewer.', None,
    'a long wide flat gold skewer lying across the marble worktop with seasoned minced lamb pressed along half of its length',
    'Close fixed view of the gold skewer on the worktop. The skewer sits still, then the gloved hands press the seasoned minced lamb gently along the skewer as the kebab grows longer and even. ' + LOCK,
    'soft meat press on metal'),
   ('Pinch the ridges.', None,
    'the long gold skewer on the marble worktop fully covered in an even minced lamb kebab with a row of neat finger ridges along it',
    'Close fixed view of the kebab on the gold skewer. The kebab sits still, then gloved fingers pinch the meat gently along its length as a neat row of ridges forms. ' + LOCK,
    'soft pinch, quiet kitchen tone'),
   ('Onto hot charcoal.', None,
    'a low brass tabletop charcoal grill on the marble worktop with glowing orange coals, three raw ridged minced lamb kebabs on gold skewers resting across it',
    'Close fixed view of the brass charcoal grill. The skewers sit still, then a gloved hand lowers one more lamb kebab gently onto the grill as the meat begins to sizzle and thin smoke rises. ' + LOCK,
    'first sizzle, charcoal crackle'),
   ('Turn until charred.', None,
    'the same low brass charcoal grill with glowing coals, the three minced lamb kebabs on gold skewers now browned with dark char marks and glistening juices, thin smoke rising',
    'Close fixed view of the brass charcoal grill. The kebabs sit still, then a gloved hand turns the middle skewer slowly as the charred side comes up glistening and thin smoke drifts. ' + LOCK,
    'steady sizzle, charcoal crackle'),
   ('Slide onto warm bread.', None,
    'a charred minced lamb kebab on a gold skewer held just above warm flatbread on a gold-rimmed plate, a grilled tomato and sumac onions beside it, juices glistening',
    'Close fixed view of the plate of warm flatbread. The kebab sits still on its skewer, then the gloved hands slide the charred lamb kebab off the skewer onto the warm flatbread as the juices glisten and steam rises. ' + LOCK,
    'skewer slide, soft steam')]),
 'charcoal-lamb-kebab-wrap': dict(title='Charcoal Lamb Kebab Wrap', suffix='', mode='asmr', seconds=[2, 2, 2, 2, 2, 2, 3], view=ASSEMBLY_VIEW, hands=ASSEMBLY_HANDS,
  setting='Beneath and behind it, softly out of focus, a brass charcoal grill glows orange with rows of lamb kebabs on gold skewers, at the edge of a polished black and gold marble counter.',
  hook='Charcoal kebab wrap, yet this juicy?',
  ending='A gloved hand lifts the cut kebab wrap toward the camera and the juices glisten.',
  shots=[
   ('Warm bread, garlic sauce.', None,
    'a round warm flatbread resting open on a black-gloved palm with a thick stripe of white garlic sauce across its centre and a gold spoon touching the sauce',
    'Top-down close view of the warm flatbread on the gloved palm. At once the gold spoon drags white garlic sauce across the flatbread in one smooth stripe as the sauce spreads thick and glossy. ' + TOPLOCK,
    'spoon spread, charcoal crackle'),
   ('Charred lamb kebab.', None,
    'the open flatbread with garlic sauce on a black-gloved palm and a charred minced lamb kebab on a gold skewer laid along its centre',
    'Top-down close view of the kebab on the sauced flatbread. At once a gloved hand grips the kebab through the bread and the gold skewer slides out smoothly as the charred lamb kebab stays on the flatbread and its juices glisten. ' + TOPLOCK,
    'skewer slide, meat sizzle'),
   ('Sumac onions, parsley.', None,
    'the charred lamb kebab on the sauced flatbread on a black-gloved palm, topped with thin red sumac onions and chopped parsley',
    'Top-down close view of the kebab on the flatbread. At once gloved fingers scatter red sumac onions and chopped parsley over the charred lamb kebab as the pieces fall and settle along the meat. ' + TOPLOCK,
    'soft sprinkle, charcoal crackle'),
   ('Grilled tomato.', None,
    'the lamb kebab with sumac onions and parsley on the flatbread on a black-gloved palm, a blistered grilled tomato half pressed open beside the meat',
    'Top-down close view of the filled flatbread. At once gloved fingers press a blistered grilled tomato onto the lamb kebab as its juices run slowly into the bread. ' + TOPLOCK,
    'soft squish, charcoal crackle'),
   ('Roll it tight.', None,
    'the flatbread half rolled around the lamb kebab and its fillings, held in two black-gloved hands',
    'Top-down close view of the flatbread in the gloved hands. At once the hands roll the flatbread tightly around the lamb kebab as the wrap closes into a firm even roll. ' + TOPLOCK,
    'bread fold, soft paper rustle'),
   ('Toast on the grill.', None,
    'the rolled kebab wrap lying across brass grill bars above glowing charcoal with golden toasted marks on the bread, a black-gloved hand pressing it down',
    'Top-down close view of the rolled wrap on the grill bars. At once the gloved hand presses the kebab wrap onto the hot grill as the bread toasts golden and thin smoke rises. ' + TOPLOCK,
    'toasting sizzle, charcoal crackle'),
   ('Cut. Hold. Bite.', None,
    'one half of the toasted kebab wrap held up in a black-gloved hand toward the camera, its cut face showing charred lamb, sumac onions, parsley and white garlic sauce, juices glistening',
    'Top-down close view of the cut kebab wrap. At once the gloved hand lifts the cut kebab wrap toward the camera and turns it slowly as the cut face shows the charred lamb and the juices glisten, until it holds still. ' + TOPLOCK,
    'knife cut, soft steam')]),
 'charcoal-lamb-kebab-levels': dict(title='Lamb Kebab Level Up', suffix='', view=LEVELS_VIEW, hands=LEVELS_HANDS, setting=LEVELS_SETTING,
  hud=[('LEVEL 1', 5), ('LEVEL 2', 50), ('LEVEL 3', 500), ('LEVEL 99', 5000), ('WHICH LEVEL?', 5000)],
  claims=['Prices on screen are illustrative level prices, not quotes for a real menu; say so in the description', 'AI-generated original footage'],
  ending='A hand lifts the gold wagyu kebab toward the camera and it shines.',
  shots=[
   ('Five dollars, yet watch it level up.', None,
    'a plain charred minced lamb kebab on a gold skewer resting on a simple flatbread on a white paper plate',
    'Close fixed view of the lamb kebab on the paper plate. A hand sets the gold skewer down gently as the kebab settles on the flatbread and thin steam rises from the meat. ' + FIXED,
    'paper plate tap, soft sizzle'),
   ('Level two: saffron butter. Fifty dollars.', None,
    'the same charred lamb kebab on flatbread, now on a matte black plate, brushed with glossy golden saffron butter, a small gold brush touching it',
    'Close fixed view of the lamb kebab on the black plate. A hand brushes glossy saffron butter slowly along the kebab with the small gold brush as the butter melts and shines. ' + FIXED,
    'soft brush stroke, butter sizzle'),
   ('Level three: wagyu beef. Five hundred.', None,
    'two thick, visibly larger marbled wagyu beef kebabs on gold skewers on flatbread on the matte black plate, deep red-brown and glossy with saffron butter, flaky salt crystals on top',
    'Close fixed view of the wagyu kebab on the black plate. A hand sprinkles flaky salt slowly over the wagyu kebab as the crystals fall and the juices glisten. ' + FIXED,
    'salt sprinkle, soft sizzle'),
   ('Level ninety-nine: gold leaf. Five thousand?', None,
    'the wagyu kebab on a gold-rimmed black plate half covered with delicate sheets of gold leaf, gold tweezers holding one more sheet just above it',
    'Close fixed view of the wagyu kebab on the gold-rimmed plate. A hand lowers the gold tweezers slowly as the sheet of gold leaf settles on the wagyu kebab and it shines in the warm light. ' + FIXED,
    'soft shimmer, quiet room tone'),
   ('Which level would you pay for?', None,
    'one cut half of the gold-leaf wagyu kebab held up close to the camera in one hand, its juicy pink centre facing the viewer, the empty gold-rimmed black plate softly blurred below',
    'Close fixed view of the gold wagyu kebab. A hand lifts one half of the gold wagyu kebab toward the camera as the cut face glistens and it shines, until it holds still. ' + FIXED,
    'soft lift, gentle steam')]),
 'pistachio-kunafa-chocolate': dict(title='Pistachio Kunafa Chocolate Bar', suffix='-cravings', mode='asmr', seconds=[2] * 8,
  view=CRAVE_VIEW, hands=CRAVE_HANDS, setting=CRAVE_SETTING, light=CRAVE_LIGHT,
  hook='Crunchy pistachio kunafa chocolate, yet made at home?',
  claims=['Recipe quantities belong in the description, not on screen', 'AI-generated original footage'],
  ending='Gloved hands snap the chocolate bar in half and the green pistachio kunafa filling stretches.',
  shots=[
   ('Kunafa.', None, 'a copper pan of fine golden toasted kunafa pastry shreds with a small gold spatula in it',
    'Top-down close view of the copper pan. At once a gloved hand stirs the golden kunafa shreds with the gold spatula as they shift gently and turn crisp. ' + TOPLOCK, 'dry pastry rustle, soft sizzle'),
   ('Pistachio.', None, 'a clear glass bowl of golden toasted kunafa shreds with thick bright green pistachio cream being poured over them from a small white jug',
    'Top-down close view of the glass bowl. At once a gloved hand tilts the small jug as thick green pistachio cream pours slowly over the golden kunafa in a smooth ribbon. ' + TOPLOCK, 'thick cream pour'),
   ('Fold.', None, 'the clear glass bowl now holding a thick green pistachio and kunafa mixture, a gold spoon folding it',
    'Top-down close view of the glass bowl. At once a gloved hand folds the green pistachio kunafa mixture slowly with the gold spoon as the shreds turn evenly green. ' + TOPLOCK, 'crunchy fold, spoon on glass'),
   ('Chocolate.', None, 'a rectangular chocolate bar mould being filled with glossy melted dark chocolate from a small copper pot',
    'Top-down close view of the bar mould. At once a gloved hand tilts the copper pot as glossy melted dark chocolate pours slowly into the mould and levels out. ' + TOPLOCK, 'smooth chocolate pour'),
   ('Fill.', None, 'the chocolate-lined bar mould with the green pistachio kunafa filling spread along it, a small gold spatula smoothing the filling',
    'Top-down close view of the bar mould. At once a gloved hand smooths the green pistachio kunafa filling along the mould with the gold spatula as it spreads flat. ' + TOPLOCK, 'soft spread, light crunch'),
   ('Seal.', None, 'the bar mould with green filling being covered by a final layer of glossy melted dark chocolate from the copper pot',
    'Top-down close view of the bar mould. At once a gloved hand tilts the copper pot as melted dark chocolate pours slowly over the green filling and seals it. ' + TOPLOCK, 'smooth chocolate pour'),
   ('Set.', None, 'one finished glossy dark chocolate bar with a ridged top lying alone in the centre of the marble',
    'Top-down close view of the finished chocolate bar. At once two gloved hands slide in and lift the glossy bar slightly as the light runs across its surface. ' + TOPLOCK, 'soft tap on marble'),
   ('Snap.', None, 'the chocolate bar held in two black-gloved hands, snapped in half, its cut faces showing thick green pistachio kunafa filling stretching between the halves',
    'Top-down close view of the chocolate bar in the gloved hands. At once the hands snap the chocolate bar in half and pull the halves apart slowly as the green pistachio kunafa filling stretches, until they hold still. ' + TOPLOCK, 'loud chocolate snap, crunch')]),
}

ANGLE_IDEAS = ['payoff tease as the hook', 'top-down ingredients', 'top-down prep', 'cooking close-up', 'side-macro payoff']

if '--list' in sys.argv:
    print('\n'.join(DISHES)); sys.exit()
made = []
for slug in (sys.argv[1:] or DISHES):
    d = DISHES[slug]
    s = json.loads(json.dumps(base))
    seclist = d.get('seconds') or [d.get('shot_seconds', 3)] * len(d['shots']); total = sum(seclist)
    s['settings'].update(seconds=total, presentationMode=d.get('mode', 'voiced'))
    s['topic'] = f"{d['title']}: a quick recipe in five fast shots"
    s['style'] = STYLE
    s['requestedEnding'] = d['ending']
    s['totalSeconds'] = total
    s['sourceReview'] = {'checkedAt': '2026-11-14', 'trendLabel': 'format modelled on common recipe-Short structure (hook, top-down steps, payoff); not a verified view trend', 'sources': ['https://www.youtube.com/shorts/bkUpOMCZ9GQ']}
    shots = []
    for k, (line, ang, scene, motion, sound) in enumerate(d['shots']):
        shots.append({'seconds': seclist[k], 'narration': line,
                      'imagePrompt': f"{d['title']}: {scene}. {d.get('setting', SETTING)} {d.get('light', LIGHT)} {d.get('view') or ANGLES[ang]} {d.get('hands', HANDS)}",
                      'motionPrompt': motion, 'sound': sound})
    p = s['plan']
    p.update(title=d['title'], hook=d.get('hook', d['shots'][0][0]), payoff=d['ending'], shots=shots,
             claimsToCheck=d.get('claims', ['Original recipe wording; confirm quantities before publishing a written recipe', 'AI-generated original footage; no reference footage, audio or branding reused']),
             ideas=[{'title': d['title'] if k == 0 else f"{d['title']} idea {k+1}", 'angle': a} for k, a in enumerate(ANGLE_IDEAS)])
    for k in ('storyArc', 'qualityChecks'):
        s.pop(k, None)
    out = ROOT / f"drafts/generated/{slug}{d.get('suffix', '-v3')}.local-scenario.json"
    out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    print(out.name, [len(x[0].split()) for x in d['shots']])
    made.append(str(out))
    hudf = out.with_name(out.name.replace('.local-scenario.json', '.hud.json'))
    if d.get('hud'):
        hudf.write_text(json.dumps(d['hud']))
    elif hudf.exists():
        hudf.unlink()
import subprocess
if made:
    sys.exit(subprocess.run([sys.executable, str(ROOT / 'scripts/prompt-lint.py'), '--min=90', *made]).returncode)
