# Local story planner

The old `local-video-20261107-070129.local-scenario.json` car draft came from one `qwen3:1.7b` Ollama request. It returned three shots totaling 18 seconds. The prior code expanded their times to 10, 20 and 30 seconds to fit 60 seconds. The renderer then split those three prompts into twelve five-second LTX clips, repeating the same visual idea. The draft was saved for editorial review, but the render was allowed to proceed. This explains the long job and the thin story.

The interactive `npm run make:any:mac` workflow now uses the Gemma 12B text model already installed for LTX on the tested Mac. It asks for a subject, visual style, desired ending, duration and orientation. It first drafts a protagonist, setting, goal, physical obstacle, solution and payoff. It checks that a requested ending remains the goal. Then it writes one shot at a time against fixed, timed story beats. For a 30-second film the six beats are hook, goal, obstacle, new plan, action and payoff; for 60 seconds there are twelve beats from hook and setup through approach, obstacle, alternate plan, payoff and closing image.

Each shot gets one still prompt, one continuous-motion prompt, a speakable voice line and a sound cue. The planner checks timing, repeated prompt text, overly similar prompts, narration length and cut instructions. It repairs only the failing field and records the repair count in `qualityChecks`. The renderer rejects sparse plans such as three shots stretched over 60 seconds before starting narration or GPU work. The twelve 60-second beats follow one causal route: hook, setup, goal, original approach, obstacle, reaction, new plan, start, progress, final approach, payoff, closing image.

Draft without rendering:

```sh
cd /Users/eibbini/Documents/shorts-app
npm run make:any:mac -- --draft-only
```

The saved file under `drafts/generated/` is editable. To validate a saved plan, run `node scripts/bb-local-scenario.mjs --validate drafts/generated/YOUR-ID.local-scenario.json`. To use the smaller Ollama model instead, run `npm run make:any:mac -- --model qwen3:1.7b`. No cloud text service is used.

These checks improve structure and protect render time. They do not guarantee good creative judgment or physically perfect generated motion. Read the story beats, prompts and narration before answering yes to render. A specific ending such as "the driver reaches an empty seaside lookout at sunrise after navigating a road closure" gives the model a useful target. The already-running car render uses its original draft; this change affects new drafts only.
