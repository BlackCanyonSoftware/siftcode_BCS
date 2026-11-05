# Handoff

Pick-up-here file. Read this first, update it at the end of every session.

## Current state (2026-11-05)

- **Milestones 0 and 1: done, pushed, CI green** (Node 24 and 26, Ubuntu and Windows).
- **Milestone 2 (code metrics): built and verified locally; awaiting owner review and push.** CI has
  not run on M2 yet.
- `siftcode scan` measures every cleanly parsed JS/TS, Python, and C# file and every named function
  and method: cyclomatic complexity, Halstead, Maintainability Index, lines of code, nesting depth,
  parameter count. Definitions are in [ADR 0005](adr/0005-metric-definitions.md); the same program
  gives the same numbers in all three languages (shared fixtures in `test/fixtures/metrics`).
- Five rules: `SC-MET-001` function length (50 lines), `SC-MET-002` cyclomatic complexity (10, the
  only `warning`), `SC-MET-003` parameters (5), `SC-MET-004` nesting (4), `SC-MET-005`
  Maintainability Index of a function (below 20). All limits are rule options.
- The JSON report has a `metrics` section with every measure of every file and function.
- Plan documents: PRD, ARCHITECTURE, DESIGN, ROADMAP, ADR 0001 to 0005. License Apache-2.0.
  Brand re-synced 2026-11-01 (typeface JetBrains Mono).

## Work in progress

None.

## Next steps

1. Owner reviews M2, pushes, and confirms CI is green.
2. Start Milestone 3: Law of Demeter, Service Locator / IoC, and SRP heuristics (US-020 to US-022).
   These need more than the current Code Model offers: member-access chains, constructor/field
   injection patterns, and class-level facts (members, methods, imports). Extend the model and
   `src/languages/extract.ts` for all three languages with shared fixtures, as M2 did. Exit needs a
   false-positive review on real code in each language.
3. Review TD-8 first: no real C# code was available locally. Ask the owner for a C# project path (or
   a repository to read) so M3's false-positive review covers C#.
4. Start M3 in a fresh session; this file carries the context.

## Open questions for the owner

- A real C# project to review rules against (TD-8).
- Should a file-size rule be added? File-level Maintainability Index was dropped because it only
  tracks file length (ADR 0005); a plain "file is too long" rule would say that directly.
- The brand has no tagline or domain; the README has none until one is set.
- Review the license compatibility table before M4b ships (PRD R8).

## Gotchas

- `.npmrc` disables install scripts, so npm `pre*`/`post*` hooks never run. Scripts call their
  prerequisites explicitly (`npm test` runs `build:grammars` and `fetch:sarif-schema` first).
- `grammars/`, `dist/`, and `test/.cache/` are generated and git-ignored. After a fresh clone run
  `npm ci`, then `npm test` or `npm run build`.
- The SARIF schema is downloaded (not committed): OASIS terms are not a standard open-source
  license. Pinned SHA-256 in `scripts/fetch-sarif-schema.mjs`. The first `npm test` needs network.
- Grammar file names live only in `src/languages/grammars.json`.
- TypeScript is pinned to 6.0.3 (`typescript-eslint` does not support 7.x); Dependabot ignores
  TypeScript 6.1+ and `@types/node` 25+.
- Rules only run on files that parse cleanly; others are reported as "not checked" and have no
  metrics. Anonymous callbacks and lambdas are not units (they count toward the function around
  them). A unit's measures include nested functions.
- The Python grammar has `case _` as a bare `case_pattern`; C# `params int[] x` is two loose nodes in
  the parameter list; Python decorated methods have a `decorated_definition` parent. Each of these
  has a test. When adding a language construct, probe the real tree first (print `toString()`).
- Ignore semantics: defaults, root `.gitignore`, and config `ignore` are one ordered list at the
  root (ADR 0004, TD-2). The repo's `siftcode.config.json` ignores `test/fixtures/`.
- Dogfood: `node dist/cli/main.js scan .` is clean at the default limits. Keep it that way.
- Real-code checks used the Python distribution's `Lib` folder (note: it contains `site-packages`
  with 22,000 files; exclude it) and `node_modules/eslint/lib`. They are read-only scans.
- `brandkit` is not installed as a package; run it from the Brand Logos repo with
  `PYTHONPATH=src python -m brandkit ...`. Verify with
  `brandkit check siftcode <repo>/docs/brand --set readme` after any brand rebuild.
- A local hook requires every long-running shell command to start with `timeout N`.

## Placeholders and stubs

None. No mock data or stubbed integrations exist.

## Benchmark (Windows, Node 26)

`npm run benchmark`: 500 files, 52,375 lines: 0.74 s at M1, 2.18 s at M2 with metrics (about 24,000
lines/s), about 107 MB peak. Target (NFR-4): 50,000 lines in 30 s. Real code: Python's distribution
(first 13,018 files, 5.1 million lines) parsed and measured in 134 s with no failures.

## Session log (newest first)

- **2026-11-05, session 1 (continued):** Milestone 2. Built the metric formulas, an iterative
  measuring walker, extraction of parameters/nesting/complexity, rules `SC-MET-002` to `005`, and
  JSON metrics. Checked against the Python standard library and ESLint; dropped a file-level
  maintainability rule that was noise (ADR 0005). 267 unit and 5 end-to-end tests.
- **2026-11-01, session 1 (continued):** Re-synced brand assets after the typeface change.
- **2026-10-31, session 1 (continued):** Milestone 1 (engine, config, reports), license compliance
  added to the plan (M4b), npm name decided.
- **2026-10-31, session 1:** Kickoff, plan, Apache-2.0, design documentation checks in the plan,
  brand, Milestone 0.
