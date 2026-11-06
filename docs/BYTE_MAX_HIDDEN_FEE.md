# Byte & Max · The Hidden Fee

The story follows three previous episodes through one decision. Max compares supplier quotes in NotebookLM, revises the handoff PDF in Gemini, and checks a reply prepared by a draft-only agent. The quote, PDF and email examples are fictional. Visual panels illustrate the evidence and are not product screen recordings.

## Notebook source text

Add each of these passages as a separate text source in a notebook.

- **Quote A**. Page 1: project fee $480 before tax. Page 2: setup fee $70 before tax. Revision allowance is not stated.
- **Quote B**. Page 1: total $520 before tax, including setup and up to two revisions.
- **Handoff guide**. Reply within 48 hours. Up to two revisions. Send consolidated feedback by email.

Ask the notebook to compare project fee, setup, pre-tax total and included revisions. Require citations for each sourced value and label missing terms as not stated. Open the cited setup line and verify $480 + $70 = $550 by hand. The difference between the pre-tax totals is $30. [Notebook source instructions](https://support.google.com/gemininotebook/answer/16215270)

For the illustrated Gemini edit, highlight the reply window and request “Reply within two business days.” Compare the revision limit and page layout before exporting a separate copy. For the agent, expose only read-only retrieval and a draft output. Require the operator to check the recipient and wording before manually sending. [Gemini file editing](https://blog.google/innovation-and-ai/products/gemini-app/edit-files-directly/) · [Agent design and approvals](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)

## Google Flow shot package

Use the supplied character concept as the identity and workshop reference. Keep Max's mustard hoodie, brown hair and expressive eyebrows. Keep Byte's off-white shell, dark face panel and cyan eyes. Keep warm practical lights and cool window fill. Generate horizontal shots with a short handle on either side of the action. Request room tone only, then use the separate ElevenLabs tracks in the edit. Prioritize reaction and insert shots where visible mouth motion will not compete with the recorded performance. [Flow reference workflow](https://support.google.com/flow/answer/16353334)

| Shot | Action and edit point |
| --- | --- |
| 01 | Wide workshop. Max drops two quote envelopes on the bench and points triumphantly at one. Byte looks at the second page. Cut on the paper slap. |
| 02 | Macro insert. Byte slides a magnifier across the second page. Rack focus from the margin to a warm highlight. Add the actual $70 text in post. |
| 03 | Reverse close-up. Max's smile freezes, then one eyebrow goes up. Hold the reaction a beat before the math reveal. |
| 04 | Over-shoulder laptop shot. Byte indicates one line with a single tap. Leave the screen blank enough to composite the verified before/after. |
| 05 | Hand insert. Max reaches for a glowing physical Send button. Byte slides a clear cover over it before the press. Add the draft-only label in post. |
| 06 | Wide ending. Max raises the receipt like a bill, Byte calmly flips it over to page two. Hold on Max’s face. |

## Local review cut

Use the storyboard PNG from the pilot as the renderer's first argument. The review cut uses its six illustrated compositions with shot changes, push-ins, evidence overlays, word-timed captions, new two-voice ElevenLabs dialogue, original sound cues and a low ambient bed. It is an animatic. Flow-generated character shots and a live Notebook run are separate outstanding steps.

```powershell
node --import tsx scripts/narrate-byte-max-quote.mjs
node --import tsx scripts/render-byte-max-quote.mjs "PATH/TO/episode-01-storyboard.png"
```

The renderer writes the MP4 to `storage/episodes/byte-max-hidden-fee`. The ElevenLabs defaults use the pilot's Mark and Jack John voice presets. Set `BYTE_VOICE_ID` and `MAX_VOICE_ID` to override.
