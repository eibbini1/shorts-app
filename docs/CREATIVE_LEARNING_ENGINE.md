# Creative learning engine proposal

2026-11-17 · Draft for approval

## Repository baseline

The main Mac checkout is `integrate/claude-codex` at `a332abd`, with tracked and untracked local work. The dedicated ArtCraft branch is `feature/artcraft-title-polish` at `a583d28`. The Arabic recipe worktree at `c1d0570` contains that commit and the latest locally available AI handoff. Local `origin/main` resolves to `1a16435`; feature availability below refers to the reviewed worktree unless stated otherwise. Process inspection was unavailable in the sandbox. No checkout was switched, and other agents' files were left in place.

## What to reuse

| Capability | Existing code and evidence | First addition |
| --- | --- | --- |
| Footage | `check-still-vision.py` checks candidate stills. `prereview-local-video.py` samples final frames, compares opening and payoff, and measures per-shot audio. `first_checks.py` screens the opening clip. | Use sampled frames with time ranges and record manual tags for framing, lighting, camera/subject motion, continuity, and action plausibility. Inspect several points in high-risk actions. The untracked `scripts/video-metrics.py` was read only: equal-width sampling, palette, brightness, and pixel motion are exploratory proxies; defer adoption. |
| Montage | `scene-cuts.py` wraps PySceneDetect. `montage-footage.py`, `brand-extras.py`, the TypeScript renderer, and FilmCraft already assemble footage and support transitions on different paths. Remotion supports the existing chef/graphics work. | Compare detected cut times with the planned edit. Record manual notes for match cuts, reveals, transitions and speed ramps. Gate each proposed effect against the chosen renderer; start with hard cuts. |
| Sound | `add-sfx.py` already audits and mixes declared recordings, `qa-local-video.py` checks final loudness/peaks/silence, and `artcraft-finish.py` has SoundCraft mastering and a voice chain. | Add timestamped loudness or transient candidates and reviewed action/sound pairs with signed timing differences. Use available authorized captions or transcripts. Unknown events and narration stay unknown. |
| Hooks | `preflight-short.py`, `HookGenerator.ts`, and `hookLog.ts` cover heuristics, generation and some manual follow-up. | Record opening action, hook category, first reveal time and alternate candidates. Compare using the current editorial rubric and preserve its human scores. |
| Style and story | `director-brief.py`, `story-scenario.mjs`, `bb-local-scenario.mjs`, prompt refinement/lint, scenario validation, and studio plates exist. The drafters already retrieve approved shot examples from `shot-reviews.jsonl`. | Retrieve reviewed technique summaries beside existing shot examples. Start with portrait luxury food. Define tags for cinematic realism, animation, explainers, product ads and landscape; validate these when suitable references and render paths exist. |
| Feedback and performance | `record-shot-review.py`, `log-local-run.py`, `record-editorial-review.py`, `quality-history.py` and `score-local-video.py` already produce review evidence. `AnalyticsRepository.ts` stores numeric snapshots; the channel snapshot CLI explicitly lacks retention and stayed-to-watch. Existing creative evidence bank and reference register carry research notes. | Link exact-file evidence and cache/render timings without re-scoring. Later import authorized Studio exports and link publication IDs and experiment variants. Keep trend discovery and audience performance separate. |

## Proposed data and interfaces

Use a sidecar SQLite database under `storage/learning/` with the existing Node `node:sqlite` runtime. Use SQL migrations, transactions and foreign keys. Keep the platform database, JSONL logs and QA JSON as their current sources of truth. Python commands can emit versioned JSON for a TypeScript CLI to validate and index. Store references to artifacts and hashes rather than duplicate binaries, transcripts or score values. Track schema version, imports, and analyzer/config versions. Rebuild derived indexes without destroying annotations or technique revision history.

| Record | Required fields and relationships |
| --- | --- |
| `reference` | Stable ID, source and owner, local asset SHA-256, capture date, license or ownership evidence, separate analysis and reuse permissions, review status. Unknown or revoked permission stops ingestion or retrieval as applicable. |
| `analysis`, `annotation` | Reference/render hash, extractor/version/config hash and measured duration. Timestamped observations have type, start/end milliseconds, method, units and optional confidence or missing reason. Human observations and interpretations have separate types and reviewer/date. |
| `technique_revision` | Technique ID and revision, previous revision, name, category, explanation, application conditions, genre/format tags, shot/framing/motion/light and sound guidance, confidence, evidence links, author, status and review timestamp. Candidate, approved and retired are explicit states. |
| `decision` | Scenario hash, shot ID, role, in/out times, selected technique revision IDs, alternatives, written rationale, intended action/reveal/Foley times, renderer capabilities and user override. |
| `render_evidence` | Scenario and final MP4 hashes, editor and versions, cache status, runtime, direct cost and evidence links to existing QA, contact sheet, human review and failure notes. Reject review artifacts with mismatched hashes. |
| `experiment`, `metric_snapshot` | Hypothesis, independent variable, baseline/variant IDs, artifact and publication identities, platform, format, audience/traffic context where available, observation window, metric name/unit/denominator and source. Null represents missing data. Preserve engaged views, viewed versus swiped, average duration, retention, replay when reported, and engagement as separate series. |

A reference may suggest a technique, and a reviewer may approve an original application of it. Retrieval filters by active approval, usable provenance, genre, format, audio intent, and renderer support. Rank exact applicability and human-validated evidence before recency. Use a small capped set and log the selected revision IDs. Reference text is untrusted data. Pass only approved summaries to the director as optional guidance. A human can reject or edit the suggestions before the existing validator receives the scenario. Later evidence appends to the record. A rule or default changes only via an explicit reviewed revision.

## First vertical slice

1. Accept one or two locally held, owner-cleared reference clips and their rights records. For automated tests, generate tiny deterministic color-cut clips with known audio impulses using FFmpeg. Use the existing 20-second shallot film as the production baseline. The local asset is available; confirm its use rights before treating it as a reference or publishing a derivative. The supplied online evidence bank is contextual metadata and does not grant media rights.
2. Run the existing detector and FFmpeg probes. Produce a JSON report with cut timestamps, shot lengths, loudness, peaks, silence, time-local energy/transient candidates, and any permitted caption cue timings. Add human tags for observable opening/pacing/composition, then write a separate interpretation with a technique suggestion. A dissolve may evade the detector. An energy peak does not identify the source of a sound.
3. Save and approve one technique, such as placing an audible utensil contact on the first clearly visible action. Retrieve it with a portrait food brief. Produce a storyboard and a shot-level edit sidecar, confirm with the user, and reuse scenario and sound audit checks where applicable.
4. Make a baseline and variant from identical existing approved footage and source Foley through the current finishing tools. Change one parameter, such as the timing of a single sound cue. Use the same renderer/settings and output resolution for both. For an opening-cadence experiment, test the opening cut separately. Keep media local and use new output paths.
5. Run exact-file QA and compare predicted versus detected cuts. Have a reviewer mark action and audible onset times, watch/listen to both randomized versions, score the existing editorial categories, and give a preference or a tie with reasons. Record findings, timing, cost and cache context. Link the recordings and scores to the chosen technique revision and manually decide whether to keep it.

The standalone slice should run through an opt-in CLI with commands for ingest, analyze, retrieve and record evidence. It can hand a reviewed plan to existing commands without changing production defaults. Renderer integration comes after scope approval. Full analysis of motion realism, automatic beat matching, new transcription dependencies, cross-genre validation and analytics ingestion are later milestones. Audience observations should compare equal publication age and comparable format and audience, with traffic/source and cohort differences visible. Single uploads and small samples remain provisional evidence.

## Validation, cost and risks

- **Baseline measured on this Mac:** the 20.01-second shallot export is 1080×1920 at 24 fps. The installed PySceneDetect environment found cuts at 3, 7, 11 and 15 seconds in 1.42 seconds, matching the planned boundaries. Existing final-file QA passed all six checks in 2.42 seconds, with −15.50 LUFS and −1.81 dBTP. The ComfyUI Python environment lacks PySceneDetect; use the dedicated detector environment configured by the project. These runs used CPU tools and incurred no paid API charges. Prior cold render timing was 22m39s with 22m11s in rendering. The release handoff still records continuity problems and no human watch/listen scores.
- **Tests after approval:** reject missing rights, prohibited reuse, mismatched hashes and malformed time ranges. Check deterministic ingest and revision history. Recover known synthetic hard cuts and audio transients within declared timing tolerances. Exercise fades, silence, absent audio/captions, and unavailable tools with explicit statuses. Verify a portrait food query selects only approved applicable techniques and preserves the designed storyboard with a valid renderer handoff. Exercise a failed QA result and a later human review against matching hashes. Compare the matched A/B exports for cut deviation, continuity and hook using the current reviewer rubric, action-to-sound timing, wall time and paid cost. Human preference remains pending until elicited. No enhanced export or A/B preference was measured in this design pass.
- **Budget:** keep this slice on existing files and CPU finishing. Short probes took seconds on one film. Encoding time and transcription cost depend on runtime, resolution, and tools. Measure those separately on both variants. Limit concurrent decoders and cache by asset hash and analyzer settings; reserve the Mac GPU for an approved generation run.
- **Rights and quality:** analyze only authorized local assets and store allowed summaries. Link provenance and license evidence per asset or audio stem; apply platform/scope and revoke retrieval on withdrawal. Copy third-party assets into a film only with permission for that use. Restrict analytics to authorized channel-level data and exclude credentials and viewer identities. Use measured features for diagnostics. Require actual watch/listen review before claiming editorial quality, and separate audience associations from causal effects.

## Approval scope

Approve the standalone local slice with a rights-gated reference importer, timestamped analysis, SQLite technique records, opt-in retrieval, and a matched CPU-only edit comparison using existing footage. Human review and rights decisions stay with the owner. Production entry points, package dependencies, analytics connections, and GPU renders are outside this milestone.

## Standalone pilot implementation

The opt-in command is `npm run creative:learn:mac -- COMMAND INPUT.json [--db PATH]`. The database defaults to `storage/learning/creative.sqlite`. Pass an explicit local database when the worktree shares a storage symlink. Commands emit JSON and exit nonzero on invalid inputs. Paths in request files resolve from the shell’s working directory.

| Command | Input and result |
| --- | --- |
| `ingest` / `revoke` | Ingest requires `id`, `file`, `owner`, `source` and `rights {analyze,reuse,evidence}`. Revoke takes `id` and `reason` and excludes the reference and its techniques from future analysis and retrieval. |
| `analyze` | Takes a reference `id`. It checks the asset hash and retrieves or generates version 1 observations with the existing scene detector and FFmpeg. References are limited to five minutes. Framing, motion realism, and audio event identity need human review. Subtitle stream counts are available. |
| `approve` / `retrieve` | Approve a timestamped technique for a defined use and reviewer, with confidence and genre/format/audio/editor tags. A later revision can use `retired: true`. Retrieve takes `genre`, `format`, `audioIntent`, and `editor`. |
| `plan` | Takes the retrieval fields plus `techniqueId`, `scenario`, one-based `shot`, `actionMs`, `baselineCueMs`, and `rationale`. Produces a SHA-bound edit sidecar for an existing portrait ASMR storyboard. The reviewer confirms it in the compare request. |
| `compare` | Takes `plan`, `scenario`, `video`, `cue`, `cueStartSeconds`, `outputDir`, `experimentId`, `rightsEvidence`, and `confirmPlan: true`. Uses the same picture and original mix for both exports. The only planned difference is the added cue delay. It writes both MP4s, QA reports, and recording requests. |
| `record` / `preference` | Record takes the generated recording request. For human follow-up use a new evidence ID and add `editorial` pointing to an existing full editorial review tied to the exact MP4. Preference accepts `id`, `experimentId`, `baselineEvidenceId`, `alignedEvidenceId`, `reviewer`, `choice` (baseline, aligned or tie), and `notes`. The same reviewer must have checked both cuts. |

The run inputs, reports and database are under `outputs/creative-learning/`. Use a fresh output directory and experiment ID for another comparison. The film reads across the existing ArtCraft worktree. The only reference used to calibrate the detector was a locally generated two-color/one-tone fixture. Its cut at 2.000 s and transient at 2.100 s were recovered. The existing shallot pilot was analyzed separately. Its production footage and field recordings are reused locally for the A/B under the approved scope. Additional references require their own permission records.

### Results

Use `comparison-02` for review. The first trial exported identical bytes because the source effect has leading silence. The successful run starts 0.52 seconds into that recording and the command now rejects comparisons with identical encoded audio.

| Measure | Baseline | Aligned |
| --- | ---: | ---: |
| Scheduled added cue | 8.75 s | 10.25 s |
| Offset from visually estimated spoon action | −1.50 s | 0.00 s |
| Final duration | 20.01 s | 20.01 s |
| Final-file QA | 6/6 | 6/6 |
| Integrated loudness / true peak | −15.56 LUFS / −1.83 dBTP | −15.56 LUFS / −1.86 dBTP |
| FFmpeg finishing time before QA | 0.59 s | 0.36 s |
| Direct cost | $0 | $0 |

Video stream hashes match. The decoded audio differed in the two cue windows and matched in the sampled control window. The target action is an estimate from the contact sheet. Actual perceived synchronization, sound suitability, and editorial preference require a watch and listen. The picture is the same in both, so the experiment offers no evidence of improved hook or continuity. One fixture and one film do not validate other genres, motion realism, or audience impact.

The opt-in slice has no automated audience import or changes to creative defaults. Before expanding it, collect the first human comparison and add a rights-cleared real editorial reference with independently annotated cut and audio events.

## Recorded Arabic narration comparison

The owner can now provide Arabic recordings. The salad preview used Arabic captions and kitchen ASMR. The ArtCraft narration chain has been exercised on the red curry film, and Arabic caption shaping has been checked on the salad preview. Recorded Arabic narration, dialect, and listening quality have yet to be evaluated.

1. Use a short dry WAV with two natural Jordanian Arabic lines and a few seconds of room tone. Capture a second performance only if comparing delivery separately. Record the script, speaker-approved pronunciation, dialect, and permission scope. Keep the audio local.
2. Compare the same take over the same footage and kitchen bed. Match perceived loudness and compare the raw vocal with a lightly processed vocal using the existing SoundCraft chain. Keep the timestamps and mix balance fixed for this comparison. Test delivery, pacing, or Foley ducking separately.
3. Have an Arabic speaker check dialect, pronunciation, warmth, and intelligibility on a phone. Listen for clipped consonants, emphasized sibilance, pumping, or covered cooking sounds. Measure clipping, loudness, noise, and speech onset. Align right-to-left captions to the selected recording and check cue timing by listening.
4. Link the selected export, planned cues, source permission, technical QA, and human preference by file hash. Store approved direction and timing as a creative technique. Only use the narration on films where the owner selects it. The current Arabic recipe adapter accepts recorded narration through ArtCraft and supports captioned ASMR through FFmpeg. The standalone comparison command currently moves one Foley cue, so the voice test needs a separate local comparison using the existing audio tools.

The standalone command is ready for a local recording:

```sh
npm run voice:arabic:compare -- --voice /absolute/path/to/take.m4a \
  --trim-start 2 --output outputs/arabic-voice-review-01
```

Use `--trim-start 2` only when the file has two seconds of room sound to remove. Add `--video PATH --bed PATH --at 0.2` for a picture comparison once the selected clip covers the full take. The command replaces the clip’s audio and mixes only the supplied bed. It writes a matched raw and processed pair, plus an exact-file report of levels, checks, and hashes. The report keeps editorial preference and caption timing pending. Attach the chosen result and a human watch/listen review to the creative record after the comparison. The current command does not align or burn new captions.

A four-second synthetic audio fixture ran through both SoundCraft and FFmpeg over the existing salad preview. Comparing loudness after conversion to the same mono layout corrected a 3 LU mismatch observed in the first run. The exported pair measured −19.27 and −19.26 LUFS and had identical video stream hashes. This validates the comparison setup. Recorded Arabic pronunciation, tone, and perceived mix need a real take and a listener.

### Arabic pronunciation and delivery review

- Before recording, agree on the dialect and exact spoken script. For this Reel, use conversational Jordanian Arabic. Keep a separate pronunciation copy with selective vowel marks or stress notes for difficult words. Use ordinary Arabic spelling in the on-screen captions.
- Review each suspected issue at its timestamp. Record the intended word, what the listener heard, the affected sound or syllable, and the correction. Preserve regional variants that the speaker confirms as natural. Give each line a second check for sentence rhythm, pauses, emphasis, and whether the meaning survives at phone volume.
- Treat a transcript as a guide for missing or substituted words. It cannot verify vowels, consonants, stress, or accent on its own. Check those against the actual audio and get a Jordanian speaker’s approval before labeling the take verified.
- Fix a mispronunciation with a retake of the phrase or sentence so its rhythm stays natural. Use SoundCraft to fix recording and mix issues. Compare dry and processed versions at matched loudness for clipped consonants, harsh sibilance and speech clarity. Save only approved pronunciation notes and reusable direction with the technique record. Keep the speaker’s recording local.

### Local Arabic tools shortlist

- **Whisper.cpp for reviewing recordings.** Apple Silicon is supported. The multilingual base model is 142 MiB and small is 466 MiB before quantization. Start with base for a short local sample, compare small if Jordanian words are missed, and use the transcript as a review aid. [Upstream runtime and memory table](https://github.com/ggml-org/whisper.cpp)
- **Chatterbox Multilingual for a synthetic alternate.** Resemble documents Arabic support. The community Apple Silicon conversion of v3 is labeled MIT and is about 2.71 GB before its separate tokenizer. Benchmark its stock voice on the same Jordanian text as the owner's recording. Measure real-time factor and memory, and ask a native speaker to judge pronunciation, phrasing and suitability. Voice conditioning with the owner's likeness would be a separate choice. [Official languages](https://github.com/resemble-ai/chatterbox#supported-languages) · [MLX model card](https://huggingface.co/mlx-community/chatterbox-multilingual-v3)
- **Other candidates.** The original Piper Kareem model card labels the voice Jordanian and points to a training dataset without an explicit license found during this review. Treat publishing rights as unresolved. The released Qwen3-TTS models list ten supported languages and exclude Arabic. [Piper model card](https://huggingface.co/rhasspy/piper-voices/raw/main/ar/ar_JO/kareem/medium/MODEL_CARD) · [Qwen3-TTS model table](https://github.com/QwenLM/Qwen3-TTS#released-models-description-and-download)

Use `npm run voice:arabic:review -- --script /path/to/script.txt --whisper-json /path/to/take.json --output /path/to/review.json` to use an existing whisper.cpp transcript. With the local CLI and multilingual model installed, replace `--whisper-json` with `--voice /path/to/take.m4a --model /path/to/ggml-base.bin`. The report flags unrecognized or substituted script words at segment timestamps. It ignores selected orthographic differences and vowel marks during the lexical comparison. Use the timestamps to listen for pronunciation. The report always leaves a native pronunciation verdict pending. It produces no approved captions.

The report path was tested on a fixture that detected a substituted ingredient and preserved its timestamps. Live Arabic transcription and Chatterbox generation have yet to run on this Mac. The active narration models remain pinned.

### November 17 voice benchmark

The comparison uses the same recipe narration in English and conversational Arabic. Kokoro `af_heart` is the English baseline. The installed Sofelia Eliaa voice is the Arabic baseline. Sofelia is a Palestinian Kokoro derivative whose frontend supports pronunciation overrides. The model card labels it Apache 2.0. The benchmark used the default lexicon without custom overrides. [Sofelia model card](https://huggingface.co/hamdallah/Sofelia-TTS-82M)

Kokoro produced 9.95 seconds of English audio in 5.53 seconds after 0.48 seconds of load. Sofelia produced 9.85 seconds of Arabic audio in 12.34 seconds including startup, load, and file writing. The timing scopes differ. Both listening copies target −24 LUFS with static gain. Sofelia was accepted by the existing raw/processed SoundCraft comparison, with both WAVs at about −19.3 LUFS and peaks at or below −4.0 dBTP. The language and delivery review remains open.

Chatterbox 4-bit was tested on this Apple Silicon Mac using MLX Audio 0.4.7, the pinned checkpoint at `f1d7b96`, and the S3 speech tokenizer. The model and tokenizer total approximately 1.10 GB. It ran from cached files with Hugging Face offline. The stock conditioning shipped with the checkpoint was used. The runtime printed its generic voice label, but the Chatterbox model loaded its own bundled conditionals. No voice reference was supplied. [4-bit checkpoint](https://huggingface.co/mlx-community/chatterbox-4bit/tree/main) · [S3 tokenizer](https://huggingface.co/mlx-community/S3TokenizerV2)

| Candidate | Language | Clip length | Generation wall time |
| --- | --- | ---: | ---: |
| Chatterbox 4-bit | Arabic | 7.60 s | 10.16 s, first run after load |
| Chatterbox 4-bit | English | 6.48 s | 3.69 s, immediately after Arabic |
| Kokoro af_heart | English | 9.95 s | 5.53 s after load |
| Sofelia Eliaa | Arabic | 9.85 s | 12.34 s including startup and load |

Chatterbox load took 12.73 seconds and the pair peaked at 2.63 GB of MLX allocations. Those figures exclude download time and do not represent total process memory. The sequence and different output lengths prevent a controlled speed ranking. Four level-matched listening copies are under `outputs/arabic-chatterbox-pilot/`. Each measures approximately −24 LUFS. Chatterbox Arabic also passed the existing raw/processed SoundCraft comparison at about −21.3 LUFS with true peaks at or below −4.0 dBTP. This confirms the WAV can enter the local audio path. Spoken-word completeness, Arabic pronunciation, pacing, and editorial preference remain unverified. Keep Kokoro for English by default and make a native listening comparison before using either synthetic Arabic voice in a film.

### Arabic narration before picture lock

Run `npm run voice:arabic:prepare -- --spec examples/recipes/avocado-egg-salad-voice-ar-JO.json --output-dir outputs/salad-ar-voice --generate`. Omit `--generate` for text preflight. This entry point uses the Jordanian female-viewer profile and flags common mismatched address forms. Its installed Sofelia runtime generates whole sentences at 1×. It reports the duration of each scene and exits 3 if the input needs an address fix or a scene exceeds its budget. Use this result to choose or rewrite the take and then align captions to the actual audio. The sample profile covers singular feminine speech. Automatic caption alignment and other audience profiles still need validation.

The report highlights prior pronunciation phrases for review. It keeps the normal Sofelia frontend while the hand-written IPA candidates await a native A/B result. This protects the original recipe's stronger voice baseline. Use `voice:arabic:review -- --before-shoot` for live transcript and exact-take listening checks before release.
