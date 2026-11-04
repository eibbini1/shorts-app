# Ten second realistic motion acceptance test

This is the next generation acceptance test for BB. It evaluates natural motion
inside the scene and the final local assembly. Viewer response requires a
separate experiment.

## Inputs and output

Use a clean source image of golden fries, preserving its food identity and
composition. The supplied Golden Fries video is the action reference.
The clean source image and the generation runtime are still pending.
Output is a portrait MP4 of exactly 10 seconds with matching narration and
captions. No paid generation is authorized by this test specification.

## Narration

Could these fries be worth two hundred dollars? Watch the salt hit that crust.
Now the reveal. Would you take a bite?

This is a creative test question, not a claim about a current restaurant price.
Fit the voice to the 10 second timeline without clipping the final question.

## Shot sequence

0 to 3 seconds. A close shot begins with one fry entering the frame and landing
on the pile. The food is visible immediately. Place the price question above the
food, within safe margins. Keep the source image identity stable.

3 to 6 seconds. Salt falls in a narrow shower onto a crisp surface. Show particle
contact and settling. Use a close framing with enough depth to read the texture.
The salt action is the main motion and the camera movement stays restrained.

6 to 8 seconds. Reveal the full serving with warm highlights and stable geometry.
The opening question now has a visual payoff. Keep the price question framed as
a viewer judgment rather than an unsupported factual conclusion.

8 to 10 seconds. Hold on the appetizing texture while the final question lands.
End on the food. A smooth loop is desirable only if the action supports it.

These are editorial targets. Model clip lengths may differ. Trim and assemble
the generated clips locally to achieve the final 10 second duration.

## Example motion instructions

Opening shot. Preserve the supplied fries and serving dish. One golden fry falls
from just above frame, lands naturally on the pile and comes to rest. Maintain
the shape and crisp texture of every fry. Warm cinematic food lighting. Keep the
camera stable enough that the landing is legible. No text inside the generation.

Salt shot. Preserve the source food and dish. Fine salt falls from above onto the
fries, visibly contacting and settling on the crust. No new objects appear.
Maintain realistic grain scale, highlights and stable food geometry. Keep the
background soft. No text inside the generation.

A prompt is an instruction to test, not evidence that the model achieves it.
Review the whole output before accepting a shot.

## Acceptance checks

- Subject movement is clearly visible with a stable camera.
- Food identity, serving dish, color and geometry remain consistent.
- Contact, gravity and settling look plausible at normal playback speed.
- No melting edges, floating particles, unexplained morphing or frame flicker.
- The hook is readable during the opening action.
- The final serving and the spoken question provide the planned payoff.
- Narration matches the food and captions match the narration.
- Sound effects align with action and do not mask the voice.
- Export is exactly 10 seconds with video and audible audio.
- Record model, version, prompt, source image, seed if supported, generation
  duration, output path and review notes.

## Evidence and status

Existing supplied footage has rendered successfully through portrait and
landscape assembly. The 10 second car test verifies photo animation and sound
assembly. Neither establishes completion of this generated motion acceptance
test.

Generation is pending the Mac chip, unified memory, supported runtime and access
method. Once generated clips pass visual review, assemble through the app's
normal renderer and verify the final export.

## Later audience comparison

First compare movement against the same still imagery with narration, duration,
captions and sound held consistent. Then test the opening hook separately.
Record equal age windows and relevant Studio metrics. Do not infer causation
from differences in lifetime view counts.
