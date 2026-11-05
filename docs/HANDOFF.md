# Handoff

Pick-up-here file. Read this first, update it at the end of every session.

## Current state (2026-11-05)

- **Milestones 0 and 1: done, pushed, CI green** (Node 24 and 26, Ubuntu and Windows).
- **Milestones 2 and 3: built and verified locally; awaiting owner review and push** (M2's three
  commits are not pushed yet, and M3 sits on top of them). CI has not run on either.
- `siftcode scan` measures every cleanly parsed JS/TS, Python, and C# file (ADR 0005) and extracts
  facts from it: imports, member-access chains, and classes with method/field counts and cohesion
  (ADR 0006).
- Ten rules. Metrics: `SC-MET-001` function length (50), `SC-MET-002` cyclomatic complexity (10, the
  other `warning`), `SC-MET-003` parameters (5), `SC-MET-004` nesting (4), `SC-MET-005`
  Maintainability Index of a function (below 20). Design: `SC-DES-001` Law of Demeter (more than 3
  members; needs a method call unless `includeDataChains`), `SC-DES-002` Service Locator
  (`warning`), `SC-DES-003` class methods (25), `SC-DES-004` class cohesion (6 methods, 3 groups),
  `SC-DES-005` module fan-out (25 imports). All limits are rule options.
- Design rules skip test code (by path), barrel files (fan-out), and composition roots (locator).
- The JSON report has a `metrics` section: every file, class, and function with all measures.
- Plan documents: PRD, ARCHITECTURE, DESIGN, ROADMAP, ADR 0001 to 0006. License Apache-2.0.
  Brand re-synced 2026-11-01 (typeface JetBrains Mono).
- Dogfood: `node dist/cli/main.js scan .` is clean (74 files, all ten rules).

## Work in progress

None.

## Next steps

1. Owner reviews M2 and M3, pushes, and confirms CI is green.
2. Start Milestone 4: security rules (US-030, CWE-mapped), supply-chain hygiene (US-031, US-032:
   lockfile, pinning, SBOM, CI, manifests for npm, pip, NuGet), and design-documentation presence
   (US-033). It is large; consider two sessions (security first). New Code Model facts will be needed:
   plain function calls with argument shapes (`eval(x)`, `subprocess.run(cmd, shell=True)`,
   `Process.Start`), string-literal values (for secrets and SQL concatenation), and a repo-level
   input (manifests, lockfiles, docs folders) that is not a source file. Probe real trees first and
   calibrate on real code, as M2 and M3 did.
3. Start M4 in a fresh session; this file carries the context.

## Open questions for the owner

- A real C# project (or permission to read one from GitHub, for example a well-known open-source
  library) for the false-positive review of the design rules: only 26 small C# files were available
  locally (TD-8).
- Should a plain "file is too long" rule be added? File-level Maintainability Index was dropped
  because it only tracks file length (ADR 0005).
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
- **tree-sitter-typescript 0.23.2 cannot parse labeled tuple elements named `object`, `string`,
  `number`, `readonly`, `keyof`, `infer`, `abstract`, `any`, `unknown`, or `never`** (TD-9). SiftCode
  reports such files as "not checked". Do not use those labels in this repo's TypeScript or dogfood
  will report a file as not checked.
- Rules only run on files that parse cleanly; others are reported as "not checked" and have no
  metrics or facts. Anonymous callbacks and lambdas are not units. A unit's measures include nested
  functions.
- Grammar quirks, each with a test: Python `case _` is a bare `case_pattern`; C# `params int[] x` is
  two loose nodes in the parameter list; C# `this.x` keeps an anonymous `this` in the `expression`
  field; Python decorated methods sit under `decorated_definition`; TypeScript
  `import x = require()` keeps `source` inside the import clause. **Probe the real tree
  (`toString()`) before writing extraction for a new construct.**
- Ignore semantics: defaults, root `.gitignore`, and config `ignore` are one ordered list at the
  root (ADR 0004, TD-2). The repo's `siftcode.config.json` ignores `test/fixtures/`.
- Calibration corpora (read-only scans): Python's `Lib` folder (it contains `site-packages` with
  22,000 files; exclude it with a config `ignore`), `node_modules/eslint/lib`, and
  `node_modules/@typescript-eslint/typescript-estree/dist`. Thresholds in ADR 0005 and 0006 come from
  these.
- `brandkit` is not installed as a package; run it from the Brand Logos repo with
  `PYTHONPATH=src python -m brandkit ...`. Verify with
  `brandkit check siftcode <repo>/docs/brand --set readme` after any brand rebuild.
- A local hook requires every long-running shell command to start with `timeout N`, and an empty
  `python - <<EOF` heredoc opens an interactive REPL: write scripts to the scratchpad and run them.

## Placeholders and stubs

None. No mock data or stubbed integrations exist.

## Benchmark (Windows, Node 26)

`npm run benchmark`: 500 files, 52,375 lines: 0.74 s at M1, 2.18 s with metrics (M2), 2.99 s with
design facts (M3, about 17,500 lines/s), about 107 MB peak. Target (NFR-4): 50,000 lines in 30 s.
Real code: the Python standard library (1,823 files, 59,000 functions) scans in about 40 s.

## Session log (newest first)

- **2026-11-05, session 1 (continued):** Milestone 3. Built the facts layer (imports, member chains,
  classes with cohesion), five design rules, tests in three languages, and calibrated on real code:
  the first version flagged every test class, barrel file, and a quarter of all classes, so tests
  and barrels are exempt, cohesion needs 3 groups, and data-only chains are opt-in. Dogfood caught
  complexity in the new code (refactored) and a grammar limitation (TD-9). 349 unit and 5
  end-to-end tests. ADR 0006.
- **2026-11-05, session 1 (continued):** Milestone 2. Metrics, rules `SC-MET-002` to `005`, JSON
  metrics; dropped a file-level maintainability rule that was noise (ADR 0005).
- **2026-11-01, session 1 (continued):** Re-synced brand assets after the typeface change.
- **2026-10-31, session 1 (continued):** Milestone 1 (engine, config, reports), license compliance
  added to the plan (M4b), npm name decided.
- **2026-10-31, session 1:** Kickoff, plan, Apache-2.0, design documentation checks in the plan,
  brand, Milestone 0.
