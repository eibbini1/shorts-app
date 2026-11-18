# iShorts Studio: a practical guide

This guide explains how to use the iShorts web Studio, review a video, and give feedback that helps improve future work.

## 1. Open the Studio safely

- On the Mac running iShorts, open the private Studio page you were given. After it unlocks, the local address is `http://127.0.0.1:8787/`. If the Studio server is not already running, the owner can start it from the project folder with `npm run studio` and leave that Terminal window open. Do not start a second server if the page is already working.
- `127.0.0.1` means “this same computer.” It will not open the host Mac from your brother’s separate computer.
- Do not share the owner’s private link or token. It grants owner access. For a separate device, the owner must first configure secure remote access and create a limited creator account. That setup is not verified by this guide. Creator accounts currently have a 20-second maximum, daily limits, and cannot run unattended; the owner account can use up to 60 seconds.
- Keep the Mac awake and connected to power during local generation. Keep the Studio server running until the export finishes.

## 2. Write an idea the video can show

Describe a subject, visible actions in order, and a clear ending. Use physical verbs such as *pours, chops, stirs, sears, folds, plates,* or *tastes*. Avoid asking the video model to show several unrelated things in one shot.

A useful pattern is:

> A [person or subject] [does a visible action], then [next action], so [clear final result]. Keep [important details] consistent.

For a food video, state what the viewer should see: the ingredients, preparation, cooking change, plating, and final texture. Keep the same hands, kitchen, cookware, and dish throughout.

## 3. Set up and approve the story

1. Choose **Food film**, **Cartoon**, **Night cartoon**, or **Custom**.
2. Paste your idea and choose **Advanced settings** if you need a particular length, orientation, audio mode, setting, or ending.
3. Choose **Voiced** for narration or **ASMR** for cooking and room sounds without narration. Captions may be generated with the narration; check their wording and timing in the export.
4. Press **Create video**. The local idea model prepares a story brief with the hook, required actions, obstacle, solution, and ending.
5. Read the whole brief before approving it. If the idea needs a choice, select a direction or rewrite the idea. Do not approve a story that changes the recipe or skips an action you care about.
6. When the brief is ready, click **Create from this brief**. Nothing starts from the suggestion until you approve it.

The Studio checks the plan and stops when a blocking check fails. A passing check means the specific technical or story rule passed; it does not guarantee realistic pictures or a good performance.

## 4. Review frames before the long render

For a first video, leave **Run unattended** off. You can turn on **Auto mode** and keep **pause at first frames** checked; the Studio then prepares the plan and frames, and waits for your review before the long motion render.

For every shot, check:

- The correct ingredients, hands, tools, and kitchen appear.
- The opening frame sets up the action that the hook promises.
- The action can happen physically and matches the recipe.
- The dish and important objects stay consistent from shot to shot.
- The ending shows the promised payoff.

Use **Regenerate** for a frame that is wrong, then review the replacement. Approve the frames only when the shot sequence looks usable. This is the best chance to catch a visibly wrong knife, hand, ingredient, or plate before spending time on motion generation.

After you have reviewed the workflow, an owner can use **Run unattended** for later jobs. It can stop on a failed check, but it cannot guarantee that every generated image or motion clip is artistically correct.

## 5. Review the finished export

Watch the whole video, not only the contact sheet. Check that:

- The hook happens immediately and matches the opening shot.
- The shots tell one connected story in the requested order.
- The motion, cooking actions, and transitions look plausible.
- Narration is clear and correctly pronounced; captions match what is said.
- Sound effects happen at the matching action, and music does not cover speech.
- The recipe’s final dish and payoff are visible.

The Studio reports technical checks, resolution, and automatic motion or image flags where available. These are evidence to review, not a substitute for watching and listening. Delivery resolution can be larger than the model’s native motion resolution; upscaling does not add genuine captured detail.

## 6. Help the Studio learn from each video

For each completed session that has an actual video export:

1. Open the session from the **Projects** list.
2. Watch and listen to the exact export.
3. Choose **Good** or **Needs work**.
4. Add a short, specific note. Include the shot or time and what should change, for example: “At 00:12, the spatula misses the halloumi; keep it in contact while turning the slice.”
5. If the shot-checkpoint review is available, compare the planned action with its start, middle, and end frames, and record whether the action and payoff are visible.
6. Open the Learning panel to see recorded ratings, recurring blockers, gate outcomes, and scene-plan counts.

Useful feedback describes what happened and what you expected. “Bad” is less useful than “shot 3 changes the plate, and the sauce pour never appears.” Rate only exports you watched. Plan-only or failed sessions do not have a finished video to rate.

This creates a record tied to the session and export. It does **not** retrain FLUX, LTX, Gemma, Qwen, or voice models, and it does not silently change production settings. Reusable creative techniques require an explicit review and approval by the owner.

## 7. If something goes wrong

- **“No clear action found”**: rewrite the idea with a subject doing a physical action and a visible result.
- **The story changes your idea**: edit the brief or choose another offered direction before starting the plan.
- **A check says BLOCKED**: read the reason, fix the brief or regenerate the frame, and rerun the check. Do not bypass a failed check just to reach rendering.
- **A session says failed, cancelled, or interrupted**: it is a finished session state, not a video. Open its log if available, correct the cause, then make a new attempt.
- **The Studio says it is locked**: open the private link provided by the owner. Do not paste the token into a message or share the owner link.
- **A session ended without a video**: use the session log if available, fix the cause, then start a new attempt. Rate only sessions that show a final export you watched.
- **The Mac or model is busy**: let the current job finish before starting another render.

## 8. A note about trends and originality

Trend suggestions depend on the evidence sources available at the time. A suggested idea is not proof that a topic is currently trending. Use the suggestion as a starting point, then make the story original to your channel. Do not reuse another creator’s footage, music, characters, or distinctive assets without permission.
