# Repository Guidelines

## Project structure

- `src/` contains the TypeScript CLI and shared application logic. CLI entry points live in `src/cli/`.
- `studio/src/` contains the React Studio UI. `scripts/studio-server.mjs` serves the UI and coordinates jobs.
- `scripts/` contains local generation, editing, QA, and model tooling. `mini-chef-studio/` is a separate Remotion project.
- `data/` holds catalogues and prompt presets, `templates/` holds reusable formats, and `assets/` holds source media. Read `docs/AI_HANDOFF.md` before changing active workflows.

## Build and run

- `npm run build` compiles the root TypeScript project. `npm run lint` runs ESLint on root TypeScript sources.
- `npm run build --prefix studio` builds the UI with existing dependencies. `npm run studio` starts the local Studio server.
- `npm run doctor:local` checks the local media stack. `npm run make:any:mac` starts the guided local generation workflow.

## Coding style

Use two spaces for TypeScript, JavaScript, JSX and JSON, and four spaces for Python. Follow neighboring code for import and formatting conventions. Use PascalCase for React components, camelCase for JavaScript functions, and descriptive kebab-case names for standalone scripts. Keep provider-specific logic in the existing adapters and preserve the behavior of established entry points.

## Testing

Run `npm test` for root Vitest and its Studio watchdog pretest. Use `node --test scripts/<module>.test.mjs` for focused Node tests and `python3 -m unittest scripts.test_<module>` for Python tests. Use the relevant isolated environment for model-dependent checks. Add regression coverage for changed behavior. Prefer fixtures and cached media before rendering. Inspect video frames and listen to audio before making editorial quality claims.

## Commits and pull requests

Use short imperative commit subjects, such as “Record advisory scores for candidate character sheets.” Keep changes scoped and preserve other contributors’ edits. Explain the user-visible effect, list validation and limitations, link related issues when available, and include screenshots for UI changes.

Keep credentials, model weights, private references, caches and generated media out of commits. Coordinate with active GPU jobs and obtain approval before paid workloads, downloads or publishing.
