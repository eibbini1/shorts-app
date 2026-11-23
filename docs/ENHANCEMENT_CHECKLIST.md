# iShorts execution checklist

Updated 2026-11-23. Scope and acceptance criteria come from [the Top 10 plan](TOP10_ENHANCEMENTS.md). A feature stays open until its acceptance check has evidence. Owner ratings and technical QA are recorded separately.

## Current film

- [x] Recover shot 2's candidate batch from cache and exclude the two dark frames.
- [x] Receive owner approval of the corrected frame and start shot 2.
- [x] Finish shot 2 and assemble session `1795377206998` using both approved shots. Studio reused both cached clips; shot 2 render took 923.9 s and the full assembly and finishing job took 111 s.
- [x] Verify the export and provenance: [red-dress MP4](../outputs/guided-20261122-225327-ee9e7f-20261123-003538.sfx.artcraft.mp4), 10.005 s container duration, 1080×1920 delivery from two 704×1280 sources. Studio technical QA passed. Owner picture and sound review remains open. The release report scored 50/100 with missing editorial evidence and a missing variety signature on this older draft.
- [ ] Record timestamped findings and the owner's identity, action and realism ratings. Keep this film as the first benchmark.

## Ten enhancements

| # | Feature | Current evidence | Remaining acceptance check |
|---|---|---|---|
| 1 | Best of three motion takes | Claude approved the transactional assembly path. On the Mac, Studio reused the original take and made two new takes serially from the same approved first frame. It switched to the alternate from cache. Both full exports passed technical QA, and the selected clip and export hashes matched. | Have the owner choose a take after playback. All three received the same low-light screen warning. |
| 2 | Named character reference | Owner-only named character save and reuse implemented and verified in the isolated Studio fixture. A continuity option can use the prior clip's last frame instead of the original opening still. | Review face, hair and outfit in three first frames using one reference. |
| 3 | First and last frame comparison | The local SSIM and colour comparison tool records clip hashes, sample times, and a selectable subject crop. It ran on the cached red-dress shot and both hero shots. | Calibrate on at least 10 owner-labelled clips and test a separate holdout of at least three drift and three pose-only clips. Track false alarms before displaying an identity flag. |
| 4 | Non-food planner reliability | Five local Gemma cases produced plans in 1, 1, 1, 1 and 3 attempts. The greenhouse plan omitted the robot stepping inside. A regression using the saved draft confirms the exact requested ending now reaches the final motion and end state. | Run a fresh Gemma benchmark against the updated planner. |
| 5 | Topic-pack motion guidance | Planner records the selected pack and preflight emits advisory warnings. Eight focused tests passed. | Try representative briefs through Studio and verify that risky actions are flagged while explicit user actions are preserved. Review the resulting footage. |
| 6 | Owner ratings and reference set | Per-segment ratings retain reviewer role and clip hash. The exporter joins versioned technical-screen evidence and excludes creator and unverified roles from calibration. The real ledger has zero authenticated owner motion ratings. | Verify an actual owner rating save and read-back. Build the set to 50 rated clips and compare only comparable automated findings. |
| 7 | Topic-pack benchmarks | Nine original shot prompts and a serial benchmark runner validated in dry run. | Render and review three clips per pack: object transformation, stylized mini-story and gadget reveal. Update the colors only after technical and human review. |
| 8 | Opening hook text | Optional hook choice and timing metadata added to the planner. A two-second FFmpeg smoke clip confirmed the hook appears and disappears in the expected window. ArtCraft consumption is wired and unverified. | Verify a real export at phone size. Check legibility, safe placement, caption overlap, visibility in the first second, and disappearance at 1.5 seconds. |
| 9 | Step-by-step retakes and High estimates | The isolated Studio checkpoint supports cache-only take switching before assembly. Two new uncached High clips took 1179.6 and 1090.1 s. The updated midpoint is 1010 s and falls within 20% of the five measured samples. The UI production build and timing tests passed. | Validate an early-shot retake and the updated progress display in the live Studio UI. |
| 10 | Hosted adapter for red categories | Hosted worker, adapter contracts, transfer, and spend-ledger regression suite passed 28 isolated tests. | Dry-run the per-shot adapter, verify the estimate and approval path, then compare one authorized hosted shot with a local take. |

## Working order

- [ ] Finish the current film and verify local changes in Studio once the server is idle.
- [ ] Prove the take selection and ratings flow, then run controlled motion and identity comparisons. Record the approved still hash, prompt, seed, settings, clip hash and elapsed time.
- [ ] Validate non-food planning, pack warnings and the opening hook. Reuse cached assets when they answer the question.
- [ ] Benchmark the three packs sequentially and update the handoff as each acceptance check closes.
- [ ] Prepare the hosted dry run. Paid generation needs explicit approval for the shot and its estimated cost.

Run model jobs one at a time on this Mac unless a measured resource test demonstrates that parallel jobs are safe. No new downloads, paid jobs, or pushes are scheduled by this checklist.
