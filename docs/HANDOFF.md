# Handoff

Pick-up-here file. Read this first, update it at the end of every session.

## Current state (2026-10-31)

- **Milestone 0: done, pushed, CI green** on Node 24 and 26, Ubuntu and Windows.
- **Milestone 1 (engine, config, reports): built and verified locally; awaiting owner review and
  push.** CI has not run on M1 yet.
- `siftcode scan <path>` finds JS/TS, Python, and C# files (respecting `.gitignore`, config
  `ignore`, and built-in ignores), parses them, runs the enabled rules, and renders text, JSON,
  Markdown, or SARIF. `siftcode explain <rule-id>` describes a rule. `--fail-on` / `failOn` set the
  exit code.
- One rule exists: `SC-MET-001` function length (default limit 50 lines, default severity `info`).
- Plan documents: PRD, ARCHITECTURE, DESIGN, ROADMAP, ADR 0001 to 0004. License is Apache-2.0.
- The owner added two roadmap items this session: design/architecture documentation checks
  (US-033/034, M4/M5) and license detection and compliance (US-035 to US-037, M4b).
- npm package name: plain `siftcode` (owner decision).

## Work in progress

None.

## Next steps

1. Owner reviews M1, pushes, and confirms CI is green.
2. Dependabot opened two PRs on M0: TypeScript 7.0.2 (fails CI: `typescript-eslint` needs < 6.1) and
   `@types/node` 26 (we support Node 24 and up). `.github/dependabot.yml` now ignores both; close
   those two PRs.
3. Start Milestone 2: cyclomatic complexity, Halstead, Maintainability Index, size/nesting/parameter
   metrics for all three languages (US-010 to US-012). The Code Model currently holds only named
   functions with start and end lines; M2 extends the model (and `src/languages/extract.ts`) with
   parameters, nesting, and branch counts, with shared cross-language fixtures.
4. Start M2 in a fresh session; this file carries the context.

## Open questions for the owner

- The brand (`Brand Logos/brands/siftcode/brand.toml`) has no tagline or domain. The README has
  none until one is set.
- Review the license compatibility table before M4b ships (PRD R8).

## Gotchas

- `.npmrc` disables install scripts, so npm `pre*`/`post*` hooks never run. Scripts call their
  prerequisites explicitly (`npm test` runs `build:grammars` and `fetch:sarif-schema` first).
- `grammars/`, `dist/`, and `test/.cache/` are generated and git-ignored. After a fresh clone run
  `npm ci`, then `npm test` or `npm run build`.
- The SARIF schema is downloaded (not committed) because OASIS terms are not a standard open-source
  license; it is checked against a pinned SHA-256 in `scripts/fetch-sarif-schema.mjs`. The first
  `npm test` needs network access.
- Grammar file names live only in `src/languages/grammars.json`.
- TypeScript is pinned to 6.0.3 because `typescript-eslint` does not support 7.x yet.
- Rules only run on files that parse cleanly; files with syntax errors are reported as "not
  checked". Anonymous callbacks and lambdas are not units, on purpose (ADR 0004).
- Ignore semantics: defaults, root `.gitignore`, and config `ignore` are one ordered list at the
  root, so `!bin/` in the config re-includes a default-ignored folder. See ADR 0004 and TD-2.
- The repo's own `siftcode.config.json` ignores `test/fixtures/` (deliberately bad sample code).
  `node dist/cli/main.js scan .` on this repo is clean at the default limits (dogfood).
- `brandkit` is not installed as a package; run it from the Brand Logos repo with
  `PYTHONPATH=src python -m brandkit ...`. Verify the bundle with
  `brandkit check siftcode <repo>/docs/brand --set readme`.
- Brand re-sync (2026-11-01, brandkit 1.49.0): the typeface changed to JetBrains Mono. The README
  banners in `docs/brand/` were re-bundled and verified (`brandkit check`). There is no CSS in this
  repo yet, so nothing named a font; M6 must load `template/fonts.css` and ship the font beside it
  (see DESIGN.md). After any brand rebuild: `brandkit check siftcode docs/brand --set readme`, and
  re-bundle if it reports drift.
- A local hook may require the shell command to start with `timeout N` for long-running commands.

## Placeholders and stubs

None. No mock data or stubbed integrations exist.

## Benchmark (2026-10-31, Windows, Node 26)

`npm run benchmark`: 500 files, 52,375 lines, 0.74 s (about 70,000 lines/s), about 101 MB peak.
Target (NFR-4): 50,000 lines in 30 s.

## Session log (newest first)

- **2026-10-31, session 1 (continued):** Milestone 1. Built config, findings, Code Model, the
  function-length rule, four reporters, CLI options, gitignore-aware discovery, benchmark, and 129
  unit plus 5 end-to-end tests. Added license compliance to the plan (M4b). Recorded npm name
  decision. ADR 0004.
- **2026-10-31, session 1:** Kickoff. Wrote the plan, switched to Apache-2.0, added design
  documentation checks (US-033/034) to the plan, applied the brand, built Milestone 0 (tooling,
  CI, CLI skeleton, tests, docs).
