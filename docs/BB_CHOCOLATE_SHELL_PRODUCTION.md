# BB shot brief: What is under the gold?

Status: new concept for review. No generation, purchase, or upload requested by this brief.

Title option: What's Inside This Gold Chocolate Shell?

Film a single dessert: dark chocolate shell, pistachio cream, raspberry filling
and a small edible-gold accent. Use the same dessert for all shots. Do not claim
a price, record, restaurant origin, or ingredient that is not actually shown.

- 0–2 s: Locked macro. A spoon taps the shell; a hairline crack appears.
  Keep the gold and dark chocolate visible. Hook: "The gold is on top.
  What's hiding inside?" Use the real tap as the first sound.
- 2–6 s: Cut on the motion to a low angle. The spoon presses through.
  Let a piece of shell fall and catch the light. Show the fracture without
  revealing the full center yet.
- 6–10 s: Reveal the vivid green pistachio and ruby raspberry together.
  Keep the camera steady as the filling moves; let the snap play cleanly.
  Narration: "Pistachio cream. Raspberry underneath."
- 10–14 s: Lift one spoonful so the layers are readable against a dark plate.
  Hold through the final second. End on the food, without an end card.

Lighting: warm side light on the gold, neutral fill on the green and red,
dark plate and background. Start with the Food grade; switch to Natural
if the filling looks oversaturated. Use hard cuts on the spoon movement.

Capture each action vertically with handles before and after the move.
Record clean location sound. The release check is simple: muted, the viewer
can read the crack and the filling reveal; with sound, the tap and snap line
up with the spoon and do not drown out the voice. Review the BB catalog and
source rights before scheduling. Keep this concept separate from the 2012
chocolate auction story.

## Mac motion test

The two AI-generated visual references are in assets/demo/chocolate-shell.
Use opening.png for the initial generation; reveal.png shows the intended
payoff and is not required by the single-image smoke test.

    sh scripts/test-mac-motion.sh assets/demo/chocolate-shell/opening.png "Locked macro camera. The spoon lowers and taps the thin chocolate shell once. A small crack opens exactly at contact and a tiny shard falls onto the plate. Keep the shell shape, gold accent and lighting consistent. Keep the filling hidden. No camera motion or text." storage/motion/chocolate-crack-test.mp4

Reject takes where the spoon bends or passes through the shell, a crack
appears before contact, or the shard floats. Review the full clip on the Mac.
Use the separate reveal reference for a second shot only after the opening
passes. These stills and the existing timing preview do not validate motion.
