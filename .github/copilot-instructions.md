# Repository guide

## Build, lint, and tests

Use Node.js 22.16 or newer and install dependencies with `npm install`.

- `npm run build` — TypeScript compile (`tsc -p tsconfig.json`).
- `npm run lint` — ESLint on `src/**/*.ts`.
- `npm test` — Vitest suite for TypeScript tests.
- `npm test -- src/media/video/__tests__/VideoRenderer.test.ts` — run one Vitest file; replace the path as needed. Add `-t "test name"` to filter by test name.
- `node --test scripts` — run the Node built-in tests for local scripts.
- `node --test scripts/local-media.test.mjs` — run one local-script test file.

Vitest intentionally excludes `scripts/**`; use `node --test` for those tests. The build and lint commands cover `src`, not the Python and JavaScript orchestration scripts.

## Architecture

This repository contains two related production paths plus a provider-driven TypeScript service:

- The spec-based TypeScript CLI flow reads `episodes/*.assemble.json`. `src/cli/pipeline.ts` sequences variation checks, cached-voice safeguards, rendering, QA, metadata, thumbnails, and subtitles, then writes a checksummed publish pack. `src/cli/assembleEpisode.ts` delegates media work to modules under `src/media/`. Uploading is a separate step.
- `src/services/VideoPipelineService.ts` is the provider-injected idea-to-video flow: content generators and a scene planner prepare the script and visuals; media services produce audio, captions, and video; repositories persist jobs and video state; readiness checks and a manifest record the result. Provider interfaces and implementations live under `src/content/providers/`, `src/media/images/`, and `src/media/tts/`.
- The local Mac workflow is orchestrated mainly by `scripts/*.sh`, `scripts/*.mjs`, and `scripts/*.py`. It passes scenario files and media between local model tools and FFmpeg; the primary entry points and stage boundaries are documented in `docs/LOCAL_PIPELINE.md` and `docs/SHORTS_PIPELINE.md`. Follow that workflow’s docs rather than assuming it shares every stage with the TypeScript CLI.

`src/cli/` provides executable entry points; reusable content, media, publishing, persistence, and shared logic are separated into their respective `src/` modules. Episode JSON files are inputs to these flows, while `storage/` and `outputs/` contain local/generated artifacts.

## Repository-specific conventions

- TypeScript is ESM with `NodeNext`; use explicit `.js` extensions in relative TypeScript imports. Strict compiler checks are enabled.
- Episode/media paths are generally interpreted from the repository root. Preserve the existing spec shape and validation when changing fields; follow the relevant episode or scenario examples and loaders.
- Keep provider-dependent logic behind the existing provider interfaces. Tests use mock/offline providers where possible; avoid requiring paid or machine-local services for unit tests.
- `npm run pipeline` refuses uncached ElevenLabs narration by default. Rendering uncached lines requires the explicit `--allow-voice-spend` flag. Prefer dry-run or skip-render options when inspecting a pipeline.
- A publish pack is only valid when its QA report passes and its listed artifact digests match. Keep QA, checksums, and pack verification in sync when changing generated artifacts.
- Tests under `src/**/__tests__/` and `src/**/*.test.ts` use Vitest. Tests in `scripts/*.test.mjs` use Node’s `node:test` runner.
- Keep local credentials in `.env` or the ignored secrets paths, never in tracked specs or source. Generated media and caches are ignored; do not overwrite local outputs as part of unrelated code changes.
