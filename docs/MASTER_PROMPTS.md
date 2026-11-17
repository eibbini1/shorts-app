# Master prompts for the local models

Checked 2026-11-16 against the vendors' own guides. Re-check when a model is upgraded; these rules are what
`scripts/refine-prompts.py` writes and `scripts/prompt-lint.py` scores (`[G]` = from a guide, `[H]` = our heuristic).

## Stills: FLUX.2 Klein 4B (MFLUX)

Source: Black Forest Labs, [FLUX.2 klein prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2_klein).

- Klein does **no prompt upsampling**: what you write is what you get.
- Write **prose, not tags**, in this order: subject and action → setting → details → lighting → atmosphere.
  Earlier words weigh more, so the food and the hand's action come first.
- 30-80 words for most production stills; 80-300 for detailed product/food shots. Every sentence adds something visible.
- **Lighting is the most important element**: name source, quality, direction and warmth
  ("soft warm window light from the left"). The lint needs at least two of the four.
- End with optional `Style: ...` and `Mood: ...` notes for a consistent look across shots.
- **No negative prompts.** "no text, no logos, no extra fingers" are not exclusions; describe the wanted result.
- **Edits** (a still made from a studio plate or an earlier still): describe the change and the target state
  ("Replace the whole garlic with diced shallots"), not the whole picture again.

## Motion: LTX-2.3 distilled (MLX), image to video

Source: Lightricks, [LTX prompting guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide).

- One present-tense paragraph of about **4-8 sentences**; every sentence has a verb that does something.
  Appearance alone gives the model nothing to animate.
- From a first-frame still, prefer **one continuous take**; no cuts inside a shot.
- Describe the camera **relative to the subject** and keep one move (push in, track, tilt, hold).
- Keep lighting consistent within a shot; avoid crowded frames and chaotic physics (splash, burst).
- Keep on-screen text out of the prompt; captions and titles are added in post (EffectCraft/FilmCraft).
- Negations are not covered by the guide; we treat them as weak (`[H]`) and remove them.

## Kitchen studio

One kitchen stays fixed; the food changes. `data/studios/luxury-kitchen.json` holds the set, lighting, lens,
camera move, mood and three reference plates (`prep`, `pan`, `oven`). A scenario with `"studio"` and per-shot
`"studioFrame"` makes `render-any-local.py` edit that plate into each still (unless the shot has its own still,
`--anchor-image` or `--chain-images`).

## Workflow

```bash
python3 scripts/refine-prompts.py drafts/generated/ID.local-scenario.json --studio luxury-kitchen --in-place
python3 scripts/prompt-lint.py drafts/generated/ID.local-scenario.json --min=85
npm run video:local -- --scenario drafts/generated/ID.local-scenario.json --editor artcraft
```

The refiner keeps the writer's food, actions and story; it removes negative clauses and fills only what is
missing (set, lighting, lens, camera move, mood, studio plate). Story notes (hook, overhead shot, payoff) stay
the writer's job. The local still gate (`check-still-vision.py`, qwen3-vl:4b) then asks one yes/no question
per shot before any LTX time is spent.
