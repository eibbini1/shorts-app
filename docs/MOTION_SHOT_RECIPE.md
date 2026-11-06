# Golden Fries: subject motion recipe

Use a clean reference image of the same fries and tray for each shot. Keep the
fry thickness, tray finish, lighting direction and background consistent.
Generate and review shots separately so a failed take can be replaced alone.

| Edit time | Story beat | Subject motion | Camera |
| --- | --- | --- | --- |
| 0–2 s | Open on action; ask what makes the fries cost $200 | Fries tumble into the tray, bounce once and settle | Locked close-up |
| 2–5 s | Build craving and hold back the answer | Fine salt falls, catches the light and lands on the crust | Macro close-up, almost still |
| 5–8 s | Pay off the price question with the actual topping or serving detail verified for the story | A hand places the finishing garnish without changing the food geometry | Cut on hand motion, shallow angle |
| 8–10 s | End on texture | One fry breaks open, exposing the crisp shell and soft interior | Locked macro |

First Mac test: use the existing test-mac-motion.sh with a clean still and this
prompt: "Locked macro camera. Fine salt falls from above under gravity, glints
in the side light and settles onto the crisp fries. Preserve the original fries,
tray, composition and lighting. The fries stay still. No text or camera motion."

Inspect the entire clip, including the first and last frames. Reject salt that
moves upward or disappears, warped fries, exposure flicker or motion that only
comes from the camera. Record the take and settings. The smoke test is about two
seconds; do not stretch or repeat a failed take to fill the edit.

After a shot passes review, use it as a scene video in the app. Align the salt
and crunch sounds to visible contact in the edit. Prefer trimming or changing
shots over looping an obvious action. The current renderer can repeat short
clips, so supply enough approved footage for each beat.

Next model experiment: try a start and end image on one action only, after the
single-image test passes on the M1. The upstream MLX runtime documents this
mode, but its two-stage configuration has not been verified on this Mac.
Keep paid generation behind separate approval.

References:
- https://seed.bytedance.com/en/seedance2_0
- https://github.com/dgrauet/ltx-2-mlx/blob/main/docs/PIPELINES.md
