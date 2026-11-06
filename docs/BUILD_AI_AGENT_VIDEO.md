# How to Build Your First AI Agent

The reference recording runs 37.6 seconds at 606 × 1078 and 30 fps. The sampled sequence moves from a cloud-versus-local diagram to a memory calculator and then to a machine diagram. Its recurring elements are an off-white paper surface, warm ink outlines, rust and green status accents, a dark chapter rail, a lower-left illustrated presenter, and brief caption phrases on dark rounded boxes. Screen-recording chrome and operating-system controls are capture artifacts.

Diagram changes are staged: cards and annotations appear within the chapter before the view reframes around the next idea. The audio track is a stereo AAC mix. Measured short gaps recur roughly every few seconds, with observed gaps of about 0.29–0.62 seconds at the chosen silence threshold. Individual music and effect stems could not be verified from the mix. The new edit uses original low-level pops for reveals and whooshes for chapter changes. It does not reuse the recording or its audio.

The landscape adaptation uses eight chapters, a wider three-step diagram, a presenter beside the diagram, source-aligned phrase captions, short paper-colored fades between chapters, and successive color reveals inside chapters. The support ticket, order, and policy are fictional walkthrough data.

Research: [Anthropic’s Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) covers when simple workflows are enough and how tools and loops work. [OpenAI’s practical guide](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) covers bounded tools, guardrails, and human intervention. [OpenAI’s tool approval guide](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) informs the application-level approval gate. [ElevenLabs TTS documentation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) documents the narration model.

From the repository root, with FFmpeg, app dependencies and the ElevenLabs key configured:

```powershell
node --import tsx scripts/narrate-agent-explainer.mjs
node --import tsx scripts/render-agent-explainer.mjs
npm run qa-check -- --video storage/episodes/build-ai-agent/How-to-Build-Your-First-AI-Agent.mp4 --expect landscape --max-sec 300 --report storage/episodes/build-ai-agent/qa.json
```

The first command uses the existing ElevenLabs provider and its narration cache. Generated audio, stills and video live under local storage.
