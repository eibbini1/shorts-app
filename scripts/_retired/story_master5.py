"""Master-template v2 for the five trending dishes (does NOT touch the existing scenarios or the running queue).
Reads narration/sound/settings from drafts/generated/<slug>.local-scenario.json and writes <slug>-v2.local-scenario.json.

Rules applied (source in brackets):
- FLUX.2 Klein guide: prose, food subject first, then setting, details, lighting, camera; positive wording instead of negation.
- LTX-2.3 guide: one present-tense paragraph, still -> action -> settle sequence, ONE camera behaviour, gentle physics.
- House rule (user, 2026-11-14): every recipe-entry shot zooms in on the food: macro framing in the still and a slow push-in in the motion.
The zoom rule and the food wording are our own choices and are untested until the rendered films are reviewed."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

STYLE = ('photoreal luxury designer kitchen, navy cabinetry with brass fixtures, polished black and gold marble counter, copper cookware, '
         'gold utensils, one emerald green enamel accent, warm key light with bright rim light, macro food close-ups that push in on the food, '
         'a pair of hands only, vertical framing')
SET = 'It sits on a polished black and gold marble counter in a luxury designer kitchen, with navy cabinetry and brass fixtures softly blurred behind.'
LIGHT = ('Warm key light from camera-left with a bright rim light along the glossy highlights and deep soft shadows. '
         'One emerald green enamel accent glows far in the background.')
CAM = ('Photorealistic macro food photograph, {angle}, 100mm macro lens at f/2.8, shallow depth of field, creamy bokeh, '
       'the food fills most of the frame in sharp focus. Only a pair of hands enters the frame, and every surface is clean and unbranded.')

def image(subject, detail, angle):
    return f"{subject} {SET} {detail} {LIGHT} {CAM.format(angle=angle)}"

def motion(frame, still, action, settle):
    return (f"Macro close-up on {frame}, with one slow push-in toward the food. {still}, then {action} "
            f"{settle} The movement stays slow and steady from start to finish.")

D = {
 'hot-honey-salmon': [
  (image('A crisp-skinned salmon fillet coated in thick glossy hot honey glaze with red chili flakes, sizzling in a hot copper skillet with a brass handle, a lime wedge beside it.',
         'Tiny honey bubbles glisten on the caramelised surface and a thin curl of steam rises.', 'low 30-degree angle'),
   motion('the salmon fillet in the copper skillet', 'The fillet sits still for a moment',
          'a hand lifts the skillet a few centimetres as the salmon sears and sizzles and the glaze bubbles gently in small glistening bubbles.',
          'A thin curl of steam rises and drifts left while the warm rim light slides across the glossy surface until the skillet settles.')),
  (image('Bubbling amber hot honey with red chili flakes in a small copper saucepan, a gold spoon resting in it.',
         'The honey is thick and translucent with tiny glistening bubbles, and soft steam rises from the surface.', 'overhead 60-degree view'),
   motion('the amber honey in the copper saucepan', 'The honey sits still',
          'a hand stirs it slowly with a gold spoon, round and round, as the honey bubbles and the chili flakes swirl and melt in.',
          'Steam rises softly and the honey stretches and shines in the rim light until the stirring slows to a gentle stop.')),
  (image('The crisp salmon fillet with a thick glossy hot honey glaze, lime wedge and chili flakes in the copper skillet, a gold spoon above it with a ribbon of honey falling.',
         'The glaze shines like amber glass and a thin curl of steam rises.', 'side angle at counter height'),
   motion('the crisp salmon fillet', 'The fillet rests still',
          'a hand lifts a gold spoon above it and tilts it, and a slow thick ribbon of glossy hot honey glaze is spooned over the crisp salmon and spreads across the surface.',
          'The glaze shines and drips while steam rises gently until the pour ends.')),
 ],
 'bacon-gruyere-egg-bites': [
  (image('A pale yellow egg mixture pouring in a smooth stream from a rose-gold blender jug into the cups of a gold-toned muffin tin, for bacon and Gruyere egg bites.',
         'The mixture is silky and glossy, with a few fine bubbles on the surface of each filled cup.', 'low 30-degree angle'),
   motion('the gold-toned muffin tin', 'The empty cups sit still',
          'a hand tips the rose-gold blender jug and a smooth pale stream of egg mixture pours into one cup and rises slowly to the rim.',
          'The surface settles flat and glossy as the stream thins and ends.')),
  (image('Crispy bacon pieces and grated Gruyere cheese falling from a hand onto the egg mixture in a gold-toned muffin tin.',
         'The bacon is deep golden and crisp, the cheese is pale and feathery, and the egg below is smooth and yellow.', 'overhead 60-degree view'),
   motion('the filled cups of the gold-toned muffin tin', 'The egg cups sit still',
          'a hand sprinkles crispy bacon and then grated Gruyere cheese over them, piece by piece, as the cheese lands and begins to soften.',
          'The last shreds settle on the surface and the hand draws away.')),
  (image('Golden egg bites with crispy bacon on a gold-rimmed white plate, one soft egg bite broken open by a fork with melted Gruyere cheese stretching from it.',
         'The inside is soft and custardy, the cheese pulls into long glossy strands, and a thin curl of steam rises.', 'side angle at counter height'),
   motion('the golden egg bite on the plate', 'The egg bite sits whole',
          'a fork presses in and breaks open the soft egg bite as the melted Gruyere cheese stretches into long strands.',
          'Steam rises gently and the cheese keeps stretching until the fork comes to rest.')),
 ],
 'spicy-peanut-noodles': [
  (image('Creamy spicy peanut sauce in a small emerald enamel bowl, a gold spoon stirring it as red chili oil swirls into the pale sauce.',
         'The sauce is thick and satin-smooth, and the chili oil draws bright red ribbons across it.', 'overhead 60-degree view'),
   motion('the peanut sauce in the emerald bowl', 'The sauce sits still',
          'a hand stirs it slowly with a gold spoon as the red chili oil swirls into the creamy peanut sauce in long ribbons.',
          'The colours fold together and the spoon slows to a stop.')),
  (image('Hot noodles lifted by gold tongs above an emerald enamel bowl, coated in dark glossy spicy peanut sauce.',
         'Each strand is slick and shining, sauce clings between the noodles, and soft steam rises.', 'low 30-degree angle'),
   motion('the peanut noodles in the tongs', 'The noodles hang still',
          'the tongs lift and turn the hot noodles through the glossy peanut sauce as the strands slide and the sauce coats them.',
          'Steam rises softly until the noodles settle back into the bowl.')),
  (image('Glossy spicy peanut noodles in an emerald enamel bowl topped with sliced scallions, sesame seeds and crushed peanuts, gold chopsticks lifting a tangle of noodles.',
         'The sauce clings and shines on every strand and a thin curl of steam rises.', 'side angle at counter height'),
   motion('the bowl of peanut noodles', 'The noodles rest still',
          'gold chopsticks lift glossy peanut noodles slowly upward as the sauce clings and shines and a few strands slide back.',
          'Steam drifts up and the lifted noodles sway gently until they hold still.')),
 ],
 'sticky-korean-beef-rice': [
  (image('Ground beef browning and crumbling in a hot copper skillet for sticky Korean beef, a gold spoon breaking it apart.',
         'The beef is deep brown with crisp caramelised edges, and soft steam rises from the skillet.', 'low 30-degree angle'),
   motion('the browning beef in the copper skillet', 'The beef sizzles in place',
          'a hand presses a gold spoon into it and breaks up the browning ground beef, turning the pieces over as they sizzle.',
          'Steam rises steadily until the spoon comes to rest.')),
  (image('Sticky Korean beef in dark glossy soy and brown sugar glaze bubbling in a copper skillet, a gold spoon stirring through it.',
         'The glaze is thick and shining, small bubbles rise around the beef, and steam curls upward.', 'overhead 60-degree view'),
   motion('the glazed beef in the copper skillet', 'The dark sauce bubbles gently',
          'a hand stirs it slowly with a gold spoon as the sticky glaze thickens and coats every piece of beef.',
          'Steam rises and the glaze turns glossy until the stirring stops.')),
  (image('Sticky glazed Korean beef over steaming white rice in an emerald enamel bowl with sesame seeds and sliced scallions, a gold spoon lifting a portion of beef.',
         'The sauce glistens on the beef, the rice is bright and fluffy, and a thin curl of steam rises.', 'side angle at counter height'),
   motion('the bowl of Korean beef and rice', 'The bowl sits still',
          'a gold spoon lifts sticky Korean beef over the steaming rice as the sauce glistens and a slow drop of glaze falls back.',
          'Steam rises gently until the spoon holds still above the bowl.')),
 ],
 'cottage-cheese-pasta-sauce': [
  (image('Cottage cheese, garlic and grated parmesan inside a rose-gold blender jug, blending into a smooth pale cream sauce for pasta.',
         'The top is still curdy and white while the lower half has turned silky and glossy.', 'side angle at counter height'),
   motion('the rose-gold blender jug', 'The cottage cheese sits still',
          'the blender turns and the curds fold downward as the cottage cheese blends into a smooth pale cream.',
          'The surface becomes glossy and even until the blender slows to a stop.')),
  (image('Silky cottage cheese pasta sauce pouring in a thick pale ribbon over hot pasta in a copper pan, gold tongs resting in the pasta.',
         'The sauce is smooth and creamy, it folds over the strands, and soft steam rises.', 'low 30-degree angle'),
   motion('the hot pasta in the copper pot', 'The pasta sits still',
          'a thick ribbon of creamy sauce pours over it and gold tongs lift and turn the strands until they are coated.',
          'Steam rises softly until the pasta settles.')),
  (image('Creamy cottage cheese pasta in an emerald enamel bowl with cracked black pepper and grated parmesan, a gold fork twirling a nest of pasta.',
         'The smooth sauce coats every strand and shines, and a thin curl of steam rises.', 'side angle at counter height'),
   motion('the bowl of creamy pasta', 'The pasta rests still',
          'a gold fork lowers in and twirls the creamy pasta slowly as the smooth sauce coats every strand.',
          'The fork lifts the neat twirl a little and holds it as steam rises.')),
 ],
}

for slug, shots in D.items():
    s = json.load(open(ROOT / f'drafts/generated/{slug}.local-scenario.json'))
    s['style'] = STYLE
    s['topic'] = s['plan']['title'] + ': master-template v2 (positive wording, sequenced motion, zoom-in on the food)'
    assert len(shots) == len(s['plan']['shots'])
    for sh, (i, m) in zip(s['plan']['shots'], shots):
        sh['imagePrompt'], sh['motionPrompt'] = i, m
    out = ROOT / f'drafts/generated/{slug}-v2.local-scenario.json'
    out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
    print(out.name, [len(i.split()) for i, _ in shots], [len(m.split()) for _, m in shots])
