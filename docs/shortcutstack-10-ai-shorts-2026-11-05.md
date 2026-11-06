# ShortcutStack · 10 AI Shorts to record

Research checked November 5, 2026. Written for English-speaking freelancers and small-business owners. Each script targets 30–40 seconds at a conversational pace. The times are edit targets, so time the recorded narration before cutting. Use fictional data and record the actual output. The examples below describe the intended checks, not results from tests already run.

I used [Kevin Stratvert’s Claude for Excel tutorial](https://www.youtube.com/watch?v=9OsKjq_rVXc) and [Jeff Su’s Cowork walkthrough](https://www.youtube.com/watch?v=4wvLHFgnQZQ) as format references for showing the work on screen. Recent release coverage came from the [Google Workspace Blog](https://workspace.google.com/blog/), [Canva Newsroom](https://www.canva.com/newsroom/news/) and [Notion releases](https://www.notion.com/releases/). Zapier and Anthropic guides informed the automation and spreadsheet examples. These are selected sources for audience fit, not a ranked survey of creator performance.

**Record first:** #1 for the cleanest reveal, #2 for the recent feature angle, and #3 for a practical follow-up to the published five-tool roundup. Check feature access before filming #2, #5, #6, #7, #8 or #9. Use a demo account or folder for connected tools.

## 1. Two Quotes, One Hidden Fee | NotebookLM

**Cover:** THE MISSING FEE
**Prep:** Make two one-page quotes. A lists a $480 project plus $70 setup. B lists $520 with setup included. Leave A’s revision limit unspecified.

**Voiceover**

- **0–4s:** “This four-eighty quote looks cheaper. Then you find the setup fee.”
- **4–15s:** “Put both quotes into NotebookLM and ask for a side-by-side list of the base price, setup, and revisions. Ask it to cite every number and flag anything missing.”
- **15–28s:** “Open the setup citation. Quote A is five-fifty with setup. Quote B is five-twenty with setup included. Now check revisions. If the quote doesn’t say, leave that cell blank.”
- **28–35s:** “That’s the question I’d send before picking a supplier.”

**Prompt:** “Compare A and B by base price, setup fee, total before tax, and included revisions. Cite each input. Mark missing terms ‘not stated.’ Show the math separately.”

**Edit:** Lead with $480 vs $520, reveal the $70 citation, then land on $550 vs $520 with “Revisions? Ask.” Verify the totals by hand. [Google’s NotebookLM source guide](https://support.google.com/gemininotebook/answer/16215270)

## 2. Fix One Line in a PDF With Gemini

**Cover:** ONE LINE TO FIX
**Prep:** Create a fictional one-page welcome guide with “Reply within 48 hours” and a separate “Up to two revisions” line.

**Voiceover**

- **0–4s:** “One line in your client PDF changed. Do you really need to rebuild the whole thing?”
- **4–16s:** “Open the PDF in Gemini’s file preview. Highlight the reply-time sentence and ask for one change. Replace ‘within forty-eight hours’ with ‘within two business days.’”
- **16–28s:** “Compare the preview with the original. Check the revision limit and the line breaks, because you only asked for one change.”
- **28–35s:** “Download the revised version once both checks pass.”

**Prompt:** “Change the highlighted phrase to ‘within two business days.’ Keep every other sentence, number, and section as it is.”

**Edit:** Show the original and revised line, then cut to the untouched revision limit. Confirm the current editing controls in your account. [Google’s Gemini file-editing announcement](https://blog.google/innovation-and-ai/products/gemini-app/edit-files-directly/)

## 3. Build a Zapier Reply That Stays in Drafts

**Cover:** DRAFT. DON’T SEND.
**Prep:** Use a test Gmail inbox. Send it a fictional inquiry asking for a custom job without giving a deadline.

**Voiceover**

- **0–4s:** “Want AI to handle your inbox? Start by giving it permission to draft.”
- **4–15s:** “In Zapier, trigger on a test email with your lead label. Give the AI the inquiry and a short set of rules, then end the Zap with Gmail’s Create Draft action.”
- **15–28s:** “Run one sample and open Gmail Drafts. Check the address and look for the missing deadline question. Then check Sent. That reply should still be waiting for you.”
- **28–35s:** “Once it passes, test it with a second inquiry.”

**Prompt:** “Draft a reply in 70 words or fewer. Ask for a deadline if missing. Never invent a price, turnaround time, or policy.”

**Edit:** Three step animation, then show Gmail Drafts beside Sent. Zapier’s Gmail action creates a new draft, so verify the recipient and setup instead of promising automatic threading. [Zapier’s Gmail actions guide](https://help.zapier.com/hc/en-us/articles/8495933589645-How-to-get-started-with-Gmail-on-Zapier)

## 4. Make Claude Find the Row Excel Forgot

**Cover:** EXCEL SKIPPED A ROW
**Prep:** In a demo workbook put 40, 60, 30, 20 and 50 in B2:B6. Put =SUM(B2:B5) in B7.

**Voiceover**

- **0–4s:** “This total says one-fifty. The correct answer is two hundred.”
- **4–15s:** “Open a copy in Excel. Ask Claude which cells the total uses and whether any rows are outside that range. Tell it to show the existing formula before suggesting a fix.”
- **15–28s:** “The formula stops at row five. Check the fifty in row six, extend the range, and watch the total update.”
- **28–35s:** “When AI flags a spreadsheet error, make it point to the exact cell.”

**Prompt:** “Audit B7 without editing. Show the current formula, included cells, any omitted numeric cell directly above the total, and a proposed formula.”

**Edit:** Highlight the formula bar and outline B6 in amber. End on the new range and $200. [Anthropic’s Excel formula walkthrough](https://academy.claude.com/tutorials/how-to-use-claude-in-excel-for-hr-headcount-planning)

## 5. Can Canva Craft Spell Your Offer?

**Cover:** SPELLCHECK THE POST
**Prep:** Use a fictional coffee shop. Generate a square draft from an offer with a price and a time.

**Voiceover**

- **0–4s:** “Can Canva’s new image model get a real offer right? Here are three things I’d check.”
- **4–15s:** “Give Craft a square coffee-shop poster brief. The headline is ‘Friday Coffee Deal.’ The price is three dollars fifty. The offer ends at noon.”
- **15–28s:** “Zoom in and check the headline, the decimal, and the time. If anything’s off, cover that area and add a normal Canva text box.”
- **28–35s:** “Use the image as a draft. Keep the offer readable and accurate.”

**Prompt:** “Square café promo. Exact headline ‘FRIDAY COFFEE DEAL’. Price ‘$3.50’. Time ‘UNTIL NOON’. One coffee cup, high contrast, generous margins. No extra text.”

**Edit:** Show the first actual result, whether it passes or fails. Use three small checkboxes and a phone-size preview. Canva announced Craft October 22. [Canva’s Craft announcement](https://www.canva.com/newsroom/news/canva-craft/)

## 6. Turn Your Lead Sheet Into a Follow-Up Dashboard

**Cover:** WHO NEEDS A REPLY?
**Prep:** Make a six-row Sheet with Lead, Status and Next follow-up. Include an overdue open lead, an overdue closed lead, and an open lead with no date.

**Voiceover**

- **0–4s:** “Six leads in a spreadsheet. Who actually needs a reply today?”
- **4–16s:** “In Google Sheets, go to Insert, Create a canvas. Ask Gemini for a dashboard that shows open leads due today or overdue, with undated leads in their own group.”
- **16–29s:** “Open the original rows and check two examples. The overdue open lead should appear. The closed lead with the same date should disappear.”
- **29–36s:** “Now you have a follow-up list you can check against the sheet.”

**Prompt:** “Build a follow-up view from these rows. Show open leads due on or before [demo date]. Exclude closed leads. List open leads with no date separately. Display the original lead name and date.”

**Edit:** Show the raw rows, the generated view, and the two source rows side by side. Use a fixed date in the demo so the result stays reproducible. [Google’s Sheets canvas walkthrough](https://workspace.google.com/blog/product-announcements/turn-your-data-into-action-6-mini-apps-you-can-create-with-sheets-canvas)

## 7. Make Notion AI Flag the Task Nobody Owns

**Cover:** WHO OWNS THIS?
**Prep:** Create a fictional kickoff page. Assign Ava to the homepage draft and leave the image selection unassigned. Put Friday on the draft only.

**Voiceover**

- **0–4s:** “Everyone agreed to pick images. Nobody agreed who would do it.”
- **4–16s:** “In Notion, give the agent a kickoff page and ask for a handoff table. Include each task, its owner, and its due date. Tell it to mark missing fields and leave the tracker alone.”
- **16–29s:** “Compare the table to the page. Ava owns the homepage draft by Friday. The images still need an owner. That’s the one line to bring back to the team.”
- **29–35s:** “Review the handoff before copying it into your tracker.”

**Prompt:** “Use only this page. Draft a handoff table in chat with Task, Owner, Due date and Evidence. Use ‘Unassigned’ or ‘Not stated’ where needed. Don’t update any pages.”

**Edit:** Split screen between kickoff notes and proposed handoff. Highlight the blank in yellow. [Notion’s October agent context update](https://www.notion.com/releases/2026-10-13)

## 8. Let Claude Cowork Plan Your Downloads Cleanup

**Cover:** SORT FILES SAFELY
**Prep:** Copy six dummy files into a dedicated demo folder. Include invoice-final.pdf, invoice-final-2.pdf and notes.txt.

**Voiceover**

- **0–4s:** “Before you let AI sort your files, ask it to show you the moves.”
- **4–15s:** “Open a test folder in Claude Cowork. Ask for a list of current filenames, suggested folders, and anything it couldn’t classify. Tell it to leave the files where they are.”
- **15–28s:** “I’d check these two similarly named invoices first. They might be versions of the same file, or different invoices. Open them before deciding.”
- **28–36s:** “Review the plan, then move only the files you’ve checked.”

**Prompt:** “Read only this demo folder. Propose a folder for each file and explain uncertain cases. Flag possible duplicates based on evidence. Do not move, rename, or delete any files.”

**Edit:** Reveal both names in the plan, show their contents briefly, then show that the original folder is still intact. [Jeff Su’s Cowork tutorial](https://www.jeffsu.org/top-5-claude-cowork-tips-i-wish-i-knew-from-day-one/) · [Anthropic’s Cowork setup guide](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)

## 9. Find the Latest Client Decision in Gmail With Gemini

**Cover:** WHICH DATE IS FINAL?
**Prep:** Create a fictional thread proposing Friday, then explicitly confirming Monday. Film in a demo inbox.

**Voiceover**

- **0–4s:** “Friday is in the subject line. The client confirmed Monday.”
- **4–16s:** “Open the thread in Gmail and ask Gemini for the most recent confirmed delivery date, who confirmed it, and the sentence that proves it.”
- **16–28s:** “Scroll to that message yourself. Friday was a proposal. Monday was confirmed. If the latest message only suggests Monday, your answer should still say it’s unconfirmed.”
- **28–35s:** “Try that before you put the wrong date on your calendar.”

**Prompt:** “Using only this thread, find the latest explicitly confirmed delivery date. Quote the supporting sentence, identify its sender, and separate it from proposals. Say ‘not confirmed’ if needed.”

**Edit:** Use a Friday-to-Monday visual reversal. Show the actual email as the proof, even if the AI gives a confident answer. [Google’s October Workspace update](https://workspace.google.com/blog/product-announcements/october-workspace-drops-edit-markdown-talk-to-gmail-and-docs-translate-meetings-and-more)

## 10. Build a Practice Drill From One YouTube Tutorial

**Cover:** WATCH LESS. TRY THIS.
**Prep:** Use one of your own public Shorts with a transcript, preferably the Google Sheets SUM example. Prepare three cells containing 20, 30 and 50.

**Voiceover**

- **0–4s:** “You saved the tutorial. Can you do the shortcut from memory?”
- **4–15s:** “Add the YouTube link to NotebookLM. Ask for one practice task from the transcript and tell it to hide the solution until you try.”
- **15–27s:** “Here’s the drill. Add three numbers in Sheets, change the middle number, and see if the total updates. Try it yourself, then open the source to compare your steps.”
- **27–35s:** “Next time you save a tutorial, turn one step into a practice drill.”

**Prompt:** “Create one 30-second exercise using a technique explicitly taught in this transcript. Give me a tiny fictional example and a success check. Wait for my attempt before giving the answer. Cite the source.”

**Edit:** Start on the saved Short, cut to the prompt, and show a total of 100 become 110 when 30 changes to 40. NotebookLM imports the available transcript, so choose a video that explains the step out loud. [Google’s NotebookLM source guide](https://support.google.com/gemininotebook/answer/16215270)
