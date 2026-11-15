# Evidence-tagged food Short bank

Checked 2026-11-15. `data/creative-evidence-bank.json` keeps three separate layers: vidIQ source observations, transferable production patterns, and **original** recipe ideas. A source's breakout multiple is its historical performance relative to its own channel, not a forecast for Billionaire Bites. The connected vidIQ account returned no owned YouTube channels, so BB retention and audience fit have not been measured here.

The scan used three English-Shorts searches: smash burgers, crisp food, and luxury food, with a three-month window. Eight relevant results from independent channels were retained. Five vertical covers were inspected, and vidIQ provided timestamped scene/audio walkthroughs for two videos: [Burger Quest's burger](https://www.youtube.com/shorts/MfVKcoYMM-o) and [Timo Müller's saffron bite](https://www.youtube.com/shorts/M9uzv2ml4ic). The other results are labelled metadata-only or cover-only in the JSON. A title or cover does not prove the actual hook, sound, or shot sequence.

The burger walkthrough shows a finished-food teaser followed by griddle, cheese, assembly and final presentation, with cuts on physical actions and no dedicated narration. The saffron-bite walkthrough shows filling, frying and plating with frequent action cuts and a music track. Neither gives us rights to reuse its footage or music. The bank proposes new hooks and sound plans for original productions.

## Use from Terminal

```bash
cd /Users/eibbini/Documents/Codex/2026-11-06/python-3-12-is-already-installed/shorts-app-evidence
npm run ideas:bank
npm run ideas:bank -- --pattern heat-and-lace
npm run ideas:bank -- --idea miso-butter-potato-pave --json
npm run brief:local -- --idea miso-butter-potato-pave --model gemma-local
```

The last command preloads the dish, hook, visible payoff, and ASMR choice into the guided director questions. You can replace every suggested answer. The local model drafts the scenario; inspect the actual shot plan, physical actions, set, food count and sound cues before rendering. The bank is research input, not an automatic recipe fact check or release score.

For an existing Remotion composition in `mini-chef-studio`, the Remotion Studio skill recommends opening an interactive preview with `npx remotion studio` before editing that composition. The isolated review worktree has no `mini-chef-studio/node_modules`, so Studio was not used to judge the FFmpeg/LTX burger film. Its current montage review uses rendered frames and the final-file gates. Studio may be used once the Remotion dependencies are available in that worktree.

Next evidence upgrade: connect the BB channel in vidIQ, collect actual retention and upload signatures, then record which hooks, sound modes and pattern families perform for BB. Keep the source sample and each upload's result separate; do not label an idea “viral” from a model score.
