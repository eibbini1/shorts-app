"""Master-template prompt test: same hot-honey salmon dish, prompts rewritten to the official guides.
FLUX.2 Klein (docs.bfl.ai): flowing prose, subject -> setting -> details -> lighting -> atmosphere, detailed shots 80-300 words, key items first.
LTX-2.3 (ltx.io prompt guide): one present-tense paragraph, shot -> scene -> action as a start-to-finish sequence -> camera -> (audio),
longer prompts for longer clips, motion only for image-to-video, avoid chaotic physics and readable text.
Writes drafts/generated/hot-honey-salmon-master.local-scenario.json (A/B against hot-honey-salmon)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
s = json.load(open(ROOT / 'drafts/generated/hot-honey-salmon.local-scenario.json'))
s['style'] = ('photoreal luxury designer kitchen, navy cabinetry with brass fixtures, polished black and gold marble counter, copper cookware, '
              'gold utensils, one emerald green enamel accent, warm key light with bright rim light, macro food close-ups, hands only, no faces, vertical framing')
s['topic'] = 'Hot honey glazed salmon master-prompt test: same dish, prompts rewritten to the official FLUX.2 and LTX-2.3 guides'
CAM = ('Photorealistic macro food photograph, {angle}, 85mm lens at f/2, shallow depth of field, creamy bokeh, sharp focus on the food. '
       'No faces, no text, no logos.')
LIGHT = ('Warm key light from camera-left with a bright rim light along the glossy highlights and deep soft shadows. '
         'One emerald green enamel accent glows far in the background.')
img = [
 'A crisp-skinned salmon fillet, skin-side up, sizzling in a hot copper skillet with a brass handle, coated in a thick glossy hot honey glaze with red chili flakes and a lime wedge beside it. '
 'The skillet sits on a polished black and gold marble counter in a luxury designer kitchen with navy cabinetry and brass fixtures, softly blurred behind. '
 'Tiny honey bubbles glisten on the caramelised surface and a thin curl of steam rises. ' + LIGHT + ' ' + CAM.format(angle='low 30-degree angle'),
 'A small copper saucepan of bubbling amber hot honey with red chili flakes, a gold spoon resting in it. '
 'The saucepan sits on a polished black and gold marble counter in a luxury designer kitchen with navy cabinetry blurred behind. '
 'The honey is thick and translucent with tiny glistening bubbles, and soft steam rises from the surface. ' + LIGHT + ' ' + CAM.format(angle='overhead 60-degree view'),
 'The crisp salmon fillet in the copper skillet with a thick glossy hot honey glaze, lime wedge and chili flakes, a gold spoon above it with a ribbon of honey falling. '
 'The luxury designer kitchen with navy cabinetry and brass fixtures is softly blurred behind, on a polished black and gold marble counter. '
 'The glaze shines like amber glass and a thin curl of steam rises. ' + LIGHT + ' ' + CAM.format(angle='side angle at counter height'),
]
mot = [
 'Medium close-up on the salmon in the copper skillet, camera locked on a tripod. The fillet sits still, then a hand lifts the skillet a few centimetres and the salmon sears and sizzles, '
 'the glaze bubbling gently in small glistening bubbles. A thin curl of steam rises and drifts left while the warm rim light slides across the glossy surface. The motion stays slow and steady until the pan settles.',
 'Overhead close-up of the copper saucepan, camera locked. The amber honey sits still, then a hand stirs it slowly with a gold spoon, round and round, as the honey bubbles and chili flakes swirl and melt in. '
 'Steam rises softly, the honey stretches and shines in the rim light, and the stirring slows to a gentle stop.',
 'Close-up on the crisp salmon fillet in the copper skillet, camera locked. A hand lifts a gold spoon above it and tilts it, and a slow thick ribbon of glossy hot honey glaze pours over the crisp salmon, '
 'spreading across the surface as the glaze shines and drips. Steam rises gently and the warm light glints on the glaze until the pour ends.',
]
for sh, i, m in zip(s['plan']['shots'], img, mot):
    sh['imagePrompt'], sh['motionPrompt'] = i, m
out = ROOT / 'drafts/generated/hot-honey-salmon-master.local-scenario.json'
out.write_text(json.dumps(s, indent=2, ensure_ascii=False))
print(out.name, [len(x.split()) for x in img], [len(x.split()) for x in mot])
