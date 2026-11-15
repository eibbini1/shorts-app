# Gap analysis: our films vs the owner's reference Shorts (2026-11-14, Claude)

References (frames viewed in browser, audio not heard):
- A: youtube.com/shorts/FnQTdwVznEs — real pastry chef, ~3 min, one fixed close view of a worktop, a cake built step by step to a reveal.
- B: youtube.com/shorts/zkfsqqcFN08 — 15.5 s, ~10 cuts, top-down very close on a wrap built in black-gloved hands over a charcoal rotisserie, finished item lifted to camera.

Status labels: VERIFIED (seen on a rendered film) / IMPLEMENTED BUT UNTESTED / PLANNED / BLOCKED.

| # | Gap | What the references do | Where we are | Status | Next action |
|---|-----|------------------------|--------------|--------|-------------|
| 1 | Real, sharp picture | Real camera footage, 1080p | Clips generated at 384x640 then enlarged ~2.8x | PLANNED | Read queue-g test (576x960, 768x1280); raise render size in render-any-local.py if time/memory allow |
| 2 | Same food changing step by step | One object transforms through the film | Each shot is a new still; image chaining exists but continuity unproven on v3/assembly | IMPLEMENTED BUT UNTESTED | Review kebab-wrap frames for shot-to-shot continuity; if weak, generate each still by editing the previous one |
| 3 | Close, clear view of the food | Food fills the frame, top-down or fixed high view | Old films: one mid close-up angle. New prompts demand close framing + top-down | IMPLEMENTED BUT UNTESTED | Review noodles-v3 and kebab-wrap |
| 4 | Pace | Cut every 1.5-4 s | Old: 3 x 5 s with dissolves. New: 3 s (v3), 2 s (assembly), hard cuts | IMPLEMENTED BUT UNTESTED | Review; check 2 s shots show the action inside the trimmed window |
| 5 | Hook in first second | Starts mid-action on appetising food | Old: slow first line. New: payoff tease (v3) / action from frame 1 (assembly) | IMPLEMENTED BUT UNTESTED | Review first second of each new film |
| 6 | Hands | One pair of gloved hands, correct tools | Old: extra floating utensil | IMPLEMENTED BUT UNTESTED | One-hand/one-utensil wording; add best-of-3 stills with a utensil check if it recurs |
| 7 | Text on screen | Small title, text never covers food | Captions moved to top, boxed labels off | VERIFIED on noodles mock; not yet on a new-format film | Confirm on noodles-v3 |
| 8 | Sound | Real kitchen sound (not heard by assistant) | Kokoro voice + synthesized sfx; never listened to; no music bed | PLANNED | Owner listens; build music bed + ducking; sound vs silent upload test |
| 9 | Payoff | Finished item shown to camera | Assembly/v3 final shot is a reveal; gate checks it | IMPLEMENTED BUT UNTESTED | Review |
| 10 | Brand | Small shop logo | End stamp removed in new flow; no logo/intro/outro | PLANNED | Gold wordmark, 0.5 s sting, 2 s end card |
| 11 | Gate before render | n/a | prompt-lint --min=90 with fix hints, in story.py and film-v3.sh | VERIFIED (old scenarios fail 76-79, new pass 97-100) | Scores prompts only; still circular |
| 12 | Gate after render | n/a | qa-visual proxies, technical QA; quality score capped at 50 until editorial | PLANNED | Add frame-review checklist (close? one hand pair? continuity? text clear?) with pass/fail per shot |
| 13 | One master script | n/a | scripts/story.py (3 formats, 8 scenarios); old generators in scripts/_retired | VERIFIED (generates + gates) | Convert remaining dishes to the winning format after review |
| 14 | Hero photos | n/a | Salmon, noodles OK (home kitchen); egg bites wrong; beef, cottage missing | PLANNED | Regenerate on luxury set after queue |
| 15 | Research | n/a | Deep research quota exhausted | BLOCKED | Retry: posting time, music licensing, logo/intro norms |

Order of work: 3/4/5/9 review (noodles-v3, kebab-wrap) -> 2 fix continuity -> 1 resolution -> 12 post-render gate -> 8 sound -> 10 brand -> 14 photos -> 13 remaining dishes.

| 16 | Comic / retro DOS-game look mixed with realistic | (owner request 2026-11-14 23:22) | CPU filter test only (storage/p9/noodles-retro-test.mp4): pixelate + 64-colour quantise on one section; crude, pixelates captions, blotchy on bright backgrounds | PLANNED | (a) apply before captions with a designed palette; (b) generate true comic / pixel-art stills with FLUX for chosen shots and animate with LTX; decide which shots switch style |
