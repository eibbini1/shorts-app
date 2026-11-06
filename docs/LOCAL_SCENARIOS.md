# Local scenarios across channels

Run from the repository root after setup with Ollama running and qwen3:1.7b installed.

    npm run draft:local -- "Chocolate shell reveal" chocolate-new --brand "Billionaire Bites" --format short --seconds 30
    npm run draft:local -- "Inbox automation for freelancers" inbox-guide --brand WorklessAI --format long --seconds 300

Shorts support 10–180 seconds. Long videos support 60–1800 seconds. These bounds
do not establish model quality at every duration. Small models may fail to produce
valid long output. Validation rejects malformed or incorrectly timed plans.

Review-required JSON includes five ideas, a hook, payoff, timed shots, narration,
image prompts, motion prompts, sound cues, and claims requiring research.
Brand, format, target runtime and model are saved. BB analytics apply only to BB.

    node scripts/bb-local-scenario.mjs --validate drafts/generated/inbox-guide.local-scenario.json

Use LOCAL_MEDIA.md to generate and approve clips. Provide a manifest with output
and shots containing approved:true, video and aligned narration {file,words}.

    npm run scenario:export -- drafts/generated/inbox-guide.local-scenario.json storage/inbox-manifest.json storage/inbox.assemble.json
    npm run assemble-abdul -- --spec storage/inbox.assemble.json

Long format selects 1920x1080 and the landscape editor. Shorts use the portrait
editor. Actual duration follows narration and must be measured after rendering.
The older curated draft-shorts/approve-draft workflow remains available.

Codex skills do not execute inside Ollama. Reusable storytelling instructions
are embedded in the prompt. Editorial research and approval remain separate.
Tests cover food Shorts, a five-minute WorklessAI plan, invalid durations and
workflow binding. Real inference is pending a downloaded local text model.
