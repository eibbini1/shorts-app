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

## Explicit channel profiles

    npm run draft:local -- "Inbox automation" inbox-profile --channel channels/worklessai.json --format long --seconds 300
    npm run draft:local -- "Chocolate textures" chocolate-profile --channel channels/bb.json

Profiles supply audience, tone, visual style and their own catalog path. Copy
one to create another channel. A conflicting --brand is rejected. Profiles and
settings are saved with the draft for review. Profiles currently govern drafting;
YouTube credential/channel enforcement remains a separate integration milestone.

## Review a generated scenario

    npm run scenario:review -- drafts/generated/ID.local-scenario.json

The review report is saved under storage/reviews using a SHA-256 digest of the
input. It compares other local scenario drafts of the same brand, reusing the
existing hook/closing-line repetition checks. It flags narration above 3.2 words
per second as a timing warning. Declared claims remain source-review-required.
Unreadable drafts are reported. This command does not fetch sources, approve
facts or approve publication. Review the full script for claims omitted by the
model. Regenerate the report after editing the scenario.

## Offline narration

    npm run scenario:narrate -- drafts/generated/ID.local-scenario.json

Run setup first to populate the Kokoro model cache. This command disables remote
model fetching and generates af_heart takes at speed 1. Each take is keyed by
text and voice settings. Existing audio must match its saved checksum before
reuse. FFprobe measures actual duration and the manifest flags overruns.
Locks prevent concurrent writers; after an abrupt kill verify the old process
has stopped before removing a stale lock. A normal failure releases the lock.

Outputs are in storage/narration. Caption alignment remains required and no word
timestamps are fabricated. Use aligned narration in the approved media manifest.
Takes over 450 characters require splitting before synthesis. A full long-form
script should use short narrated shots. The initial smoke test used two manually
written chocolate lines; it does not establish text-model generation quality.
