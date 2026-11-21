# Hosted video roadmap: local MLX to hosted GPU (Wan / open models)

Status: PLANNED. Owner approved all phases on 2026-11-17 and clarified on 2026-11-20 that the product goal is idea-agnostic video generation, not food-only. Each paid or install step still needs its own spend cap and go-ahead.
Evidence: research report "Hosted Wan GPU video pipeline" (2026-11-17). Items marked INFERENCE are arithmetic or reasoning, not measurements.

Implementation checkpoint (2026-11-20): the typed `MotionEngine` capability/preflight contract, SQLite spend-reservation ledger, durable hosted-job state repository, provider-neutral hosted dispatcher, and private output-artifact transfer utility are implemented with tests. No concrete model adapter or provider integration is wired.

## Product scope clarification (2026-11-20)

"Any video idea" is the product ambition, not a guarantee that every prompt will succeed. Intended coverage includes cinematic/warm and realistic looks, 2D/3D animation and cartoons, ASMR or voiced outputs, and both landscape and vertical formats. Select representative combinations rather than implying exhaustive coverage. The current 10-shot food set is a domain-specific stress test; its result cannot establish broad capability. Before making a general provider decision, define a representative mixed-domain set based on intended ideas and evaluate results by domain. Keep idea-to-shot planning separate from the shot-to-video `MotionEngine` comparison; audio/voice should be evaluated as separate pipeline dimensions.

## Findings that shape the plan
- Wan 2.2 (Apache 2.0, Jul 2025) is the newest self-hostable Wan. Wan 2.5 to 3.0 are API-only. Open-weights arena leaders are MiniMax H3 and LTX-2.5, not Wan.
- 40-step Wan 2.2 A14B on one B200 is about 373 s per 5 s 720p clip: roughly $23-30 per 60 s video (INFERENCE). Hosted fal Wan 2.2 is about $14.58 at 3 tries per clip. Only a 4-step distilled runtime makes self-hosting cheaper (projected $1.25-2.50, UNMEASURED).
- >=128 GB VRAM is not required: FP8 distilled experts are about 15 GB each and fit 80-96 GB cards.
- No source ranks any model on hands, knives, liquids or food. Our own blind test is the gate.
- Owner is in Jordan: licence territory exclusions of MiniMax H3 and HunyuanVideo 1.5 do not appear to apply (not legal advice; GPU region and H3 branding clause still to read).

## Architecture rule
Keep idea-to-shot planning separate from shot-to-video generation. One `MotionEngine` contract (shot spec in, MP4 + manifest out) with `local-ltx` first and `remote-*` later. The Mac controller owns job state, SQLite spend ledger, audio/voice, finishing, QA, and publish artifacts. A motion adapter does not imply support for every idea, conditioning type, or audio mode.

### Capability registry

Each versioned model adapter declares and validates its actual capabilities: T2V/I2V; first/last-frame and image/video reference conditioning; native audio generation (distinct from separately composed voice/Foley); supported aspect ratios, resolutions, durations/frame counts, and seed support/determinism. Include provider, model, and worker/image version with the declaration. Preflight must reject an unsupported request or explicitly route to a compatible adapter; never silently drop an input or setting. Test capability validation against each pinned provider/model version.

The generic capability types, preflight checks, registry, and versioned artifact manifest contract currently live in [`src/media/video/MotionEngine.ts`](../src/media/video/MotionEngine.ts). This is an unconnected foundation: no adapter is registered yet, so it does not assert real capabilities for local LTX or any hosted provider.

### Documentation-only capability survey (2026-11-20)

The candidate matrix is in [`data/benchmarks/video-engine-capabilities-draft.json`](../data/benchmarks/video-engine-capabilities-draft.json); it is not runtime-enforced and no hosted requests were made. Key distinctions: the stopped Wan 2.2 TI2V-5B ComfyUI PoC used a workflow with T2V/first-frame I2V, while first/last-frame Wan 2.2 is a separate 14B workflow. Fal's standard Wan 2.2 I2V schema accepts an optional end frame; its Turbo endpoints do not expose configurable frame count or duration. Alibaba's Wan 3.0 API documents T2V, first/last frames, reference media, native audio, and asynchronous jobs, but no provider/account or region has been selected.

Do not treat a general reference image as interchangeable with a first-frame anchor. Compare quality only over matched conditioning semantics; unmatched inputs are capability gaps. The previous Phase 1 dollar figures remain research estimates with unclear per-run assumptions, not current quotes; price the exact endpoint and duration and set the approved hard cap before any hosted run.

### Rent versus own

Use the existing local machine and short-term GPU rental to finish the benchmark before buying hardware. A local GPU becomes attractive only after measured, sustained monthly workloads justify its purchase price, power, support, and depreciation. A 24 GB RTX 3090 is a budget local tier for Wan 2.2 TI2V-5B with offloading; 32 GB is a better forward-looking floor for the documented LTX-2.5 recipe. Neither replaces an 80 GB rental for the published single-GPU Wan 2.2 A14B recipe. Revisit this decision using measured cost per accepted second and actual monthly GPU hours, not gaming benchmarks.

### Low-spend quick comparison

Before the full 12–16-case mixed-domain benchmark, run the three T2V cases listed under `quickPilot` in the draft test set through local LTX and the Wan 2.2 TI2V-5B workflow. Use one attempt per engine/case, 3 seconds at 480p class, blind-score six outputs, and record any failure without automatic retry. This is directional only; it does not assess I2V, audio, or broad category reliability. The owner has limited remaining Runpod credits, so do not start a hosted run until its total spend cap and connected account are confirmed.

Remote workers remain stateless and private, scale to zero, and are reached only through the provider queue—never an exposed ComfyUI. Move media through R2 presigned URLs, never base64.

The local lifecycle foundation is in `src/database/HostedJobsRepository.ts`, `src/media/video/HostedMotionDispatcher.ts`, and `src/media/video/HostedArtifactTransfer.ts`: jobs are bound to spend reservations, idempotency keys are checked against request hashes, submission claims enforce SQLite-backed concurrency limits, retries require definite non-acceptance and remain bounded, and ambiguous jobs remain recoverable. The dispatcher reserves/settles spend, polls or cancels through an adapter, and exposes queue/worker timeout and crash-recovery passes. Artifact URLs are resolved on demand and never persisted; downloads require HTTPS allowlisted hosts, size/time limits, private file permissions, and a recorded SHA-256. Concrete provider adapters, private input-asset staging, and scheduling the timeout/recovery passes remain open.

### Quality and cost decision method

Set and enforce a hard spend cap before any paid experiment. Keep price out of the blind-review packet; score quality against agreed criteria first, then calculate economics from the complete run ledger. Report total billable cost per human-accepted second: include failed and retried generations, storage, and billed GPU startup/warm-up time, divided by seconds in accepted final artifacts. Report queue latency, generation latency, failure rate, and retries separately. Phase 1 has no numeric quality pass threshold yet; agree on one before the comparison rather than inventing it after seeing results.

### Creative learning

Reuse [`scripts/creative-learning.mjs`](../scripts/creative-learning.mjs) and [`docs/CREATIVE_LEARNING_ENGINE.md`](CREATIVE_LEARNING_ENGINE.md); do not add a parallel learning database. Link experiments to exact artifact hashes, model/settings, prompts, domain, and human ratings. Record approved, applicable findings about hooks, camera moves, transitions, sound effects, and prompt structures. Add audience retention only when authorized channel data is available and keep its context/sample limits visible. Learning remains human-reviewed evidence: do not silently train models or change production defaults from noisy results.

### Hosted-job reliability

The first hosted dispatcher must use a stable idempotency key and explicit job states, enforce separate queue and worker timeouts, support cancellation, bound retries to appropriate transient failures, and store artifact checksums. On presigned-URL expiry, refresh access to an existing artifact instead of rerunning paid generation. Enforce per-provider and per-controller concurrency limits. Reserve spend transactionally in SQLite before dispatch; settle or release it idempotently and reconcile uncertain jobs after a controller crash. SQLite is authoritative for one controller; move to a shared transactional ledger before running multiple controllers/writers.

## Phases and gates
| Phase | Work | Cost | Exit gate |
|---|---|---|---|
| 0 | Freeze 12–16 representative blind cases: realistic people, cinematic landscapes, 2D/3D cartoons and characters, product ads, food, action, and educational visuals. Cover both aspect ratios and selected conditioning modes without a full Cartesian grid; retain the existing food set as a narrow stress test. Record a local LTX-2.3 baseline with matched per-case inputs | none | Baseline scored by domain/style/format; test set and acceptance rubric frozen |
| 1 | Build capability registry, `MotionEngine`, crash-safe ledger, manifest, and bounded dispatcher; pilot compatible hosted Wan 2.2/Wan 3.0 options on the same representative cases | Prior research estimates (~$15 standard / ~$4 Turbo per video) are not current quotes; refresh by exact endpoint and duration. Hard cap and approval required per run | Blind quality result by tested category, then measured cost per accepted second; decide per-category routing or no-go |
| 2 | Pinned Docker worker (ComfyUI native I2V/FLF2V or diffusers) with LightX2V 4-step FP8, on 80-96 GB serverless; A/B MiniMax H3 and LTX-2.5 | about $50/month trigger; target under $2.50 per video | Distilled matches 40-step in blind scoring; measured cost under target |
| 3 | H200/B200 or multi-GPU only for a named need (BF16 no offload, longer clips, resident multi-model, latency) | per need | Benchmark ourselves; no published H200 Wan numbers |

## Scoring (Phase 0)
For the existing food stress set, score each shot 0-3 for finger/hand integrity, object permanence through the action, liquid plausibility, texture fidelity, and prompt adherence. These axes are food-specific, not a general rubric. The mixed-domain draft now has 16 cases, five-second/720p-class targets, 24-fps review, shared criteria, case-specific must-pass checks, and a working per-clip acceptance rule: explicit human acceptance, every shared criterion at least 2/3, all case checks met, and no blocking technical defect. This rubric remains a draft pending reviewer validation and adapter parity checks. Blind reviewers see case IDs only. Record model, adapter/version, seed value and determinism, prompt, time, cost, conditioning inputs, retries, and failures in a manifest next to each MP4. Keep visual/motion quality scoring separate from cost calculations.

## Rules
Never expose ComfyUI publicly; no ComfyUI-Manager in the image; pin custom nodes by commit; keys in Keychain or gitignored `.env`; controller-side authoritative budget ledger (provider caps are weak); no paid call without per-run approval. Human-reviewed creative evidence never silently changes production settings.

## Open decisions
1. Provider and monthly cap for Phase 1 (fal vs Alibaba vs both).
2. Meaning of ">128" (VRAM per GPU vs GPU count).
3. Whether to evaluate MiniMax H3 (read full licence, GPU region, branding clause).
4. Validate the 16 drafted cases against real adapter capabilities and conditioning parity, then freeze the benchmark and rubric before generation.
