# Handoff

Pick-up-here file. Read this first, update it at the end of every session.

## Current state (2026-10-31)

- **Milestone 0 (walking skeleton): built and verified locally; awaiting owner review and push.**
- `siftcode scan <path>` discovers JS/TS, Python, and C# files, parses each with tree-sitter
  (WASM), and prints a per-language summary. No rules or findings yet.
- Plan documents are approved: PRD, ARCHITECTURE, DESIGN, ROADMAP, ADR 0001 to 0003.
- License is Apache-2.0 (ADR 0002). Brand assets bundled in `docs/brand/`.

## Work in progress

None. Nothing is half-done.

## Next steps

1. Owner reviews M0, pushes, and confirms CI is green on GitHub (CI is not verified until pushed).
2. Start Milestone 1: engine, config (add Zod then), finding model, reporters (terminal, JSON,
   Markdown, SARIF), exit codes, `.gitignore`-aware discovery, one real rule as proof (function
   length). Record a benchmark script.
3. Start M1 in a fresh session; this file carries the context.

## Open questions for the owner

- npm: is the plain name `siftcode` what we want, or `@blackcanyonsoftware/siftcode`? Both were
  unclaimed on 2026-10-31 (unclaimed is not reserved). Decide before the first publish (M7).
- The brand (`Brand Logos/brands/siftcode/brand.toml`) has no tagline or domain. The README has
  none until one is set.

## Gotchas

- `.npmrc` disables install scripts, so npm `pre*`/`post*` hooks never run. Scripts call their
  prerequisites explicitly; if you add a script that needs `grammars/`, call `build:grammars`.
- `grammars/` and `dist/` are generated and git-ignored. After a fresh clone run `npm ci` then
  `npm run build` (or `npm test`, which builds the grammars).
- Grammar file names live only in `src/languages/grammars.json`; the copy script and the runtime
  both read it.
- TypeScript is pinned to 6.0.3 because `typescript-eslint` does not yet support 7.x
  (peer range `<6.1.0`). Recheck when upgrading either.
- `brandkit` is not installed as a package; run it from the Brand Logos repo with
  `PYTHONPATH=src python -m brandkit ...`. Verify the bundle with
  `brandkit check siftcode <repo>/docs/brand --set readme`.
- Git line endings: `.gitattributes` forces LF. Existing commits made before it was added may show
  LF/CRLF warnings on Windows; they are harmless.
- Default ignored folders include `bin` and `build`; a project that keeps real source there will be
  under-scanned until configurable ignores arrive (M1, US-002).

## Placeholders and stubs

None. No mock data or stubbed integrations exist.

## Session log (newest first)

- **2026-10-31, session 1:** Kickoff. Wrote the plan, switched to Apache-2.0, added design
  documentation checks (US-033/034) to the plan, applied the brand, built Milestone 0 (tooling,
  CI, CLI skeleton, tests, docs).
