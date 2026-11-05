# Handoff

Pick-up-here file. Read this first, update it at the end of every session.

## Current state (2026-11-05)

- **Milestones 0 and 1: done, pushed, CI green** (Node 24 and 26, Ubuntu and Windows).
- **Milestones 2, 3, and 4: built and verified locally; awaiting owner review and push** (M2's and
  M3's commits are not pushed yet; M4 sits on top of them). CI has not run on any of them.
- `siftcode scan` measures every cleanly parsed JS/TS, Python, and C# file (ADR 0005) and extracts
  facts: imports, member-access chains, classes with cohesion (ADR 0006), calls with the shape of
  their arguments, named values, and long strings (ADR 0007).
- Seventeen rules. Metrics `SC-MET-001` to `005`; design `SC-DES-001` to `005`; security
  `SC-SEC-001` to `007` (hardcoded credentials, SQL injection, command injection, dynamic code
  evaluation, weak crypto, insecure deserialization, disabled TLS verification), each mapped to a
  CWE entry. All limits are rule options. Design and security rules skip test code; a recognizable
  credential format is reported even in tests.
- A rule hit can set its own severity (`error` for a known key format, `warning` for a guess); a
  severity in the config file overrides it.
- SARIF tags each rule with its CWE (`external/cwe/cwe-798`); the JSON report has a `metrics`
  section with every file, class, and function.
- TypeScript declaration files (`.d.ts`) are skipped.
- Plan documents: PRD, ARCHITECTURE, DESIGN, ROADMAP, ADR 0001 to 0007. License Apache-2.0. Brand
  re-synced 2026-11-01 (typeface JetBrains Mono).
- Dogfood: `node dist/cli/main.js scan .` is clean (88 files, all seventeen rules). Keep it so.

## Work in progress

None.

## Next steps

1. Owner reviews M2, M3, and M4, pushes, and confirms CI is green.
2. **Start M4a: repository hygiene** (US-031 supply chain, US-032 dependency declaration smells,
   US-033 design documentation presence). It needs a new kind of rule that sees the *repository*,
   not one source file. Suggested design:
   - Discovery currently keeps only supported source files and counts the rest as "unsupported".
     Keep a list of **all** non-ignored file paths (relative, with sizes) in `Discovery`, and give
     rules a `RepoView` (`files`, `read(path)` with a size limit, and whether the scan root is a
     repository root, i.e. has `.git`).
   - Add `defineRepoRule` next to `defineRule`; its hits carry a `path` (the file, or the folder).
     `ConfiguredRule` gains an optional repository check. Per-hit severity already exists, so
     "small repository: `note`, otherwise `warning`" (US-033) needs no new plumbing.
   - Parse manifests with plain JSON/TOML/XML/line parsing (no new dependency unless justified):
     `package.json` + lockfiles, `requirements*.txt`/`pyproject.toml`/`Pipfile`, `*.csproj`/
     `packages.config`/`Directory.Packages.props`. Evaluate each manifest folder; evaluate CI,
     Dependabot/Renovate, secret-scanning and SBOM only when the scan root is a repository root.
   - Design documentation: detect by file name, extension, and folder (list in US-033), plus
     fenced `mermaid` blocks in Markdown (read only Markdown files, size-limited).
   - Calibrate on real repositories: this repo, the Brand Logos repo (Python), and any open-source
     checkout the owner allows. Re-run the false-positive review before choosing defaults.
3. Start M4a in a fresh session; this file carries the context.

## Open questions for the owner

- A real C# project (or permission to read one from GitHub) for the false-positive review of the
  design and security rules: only 26 small C# files were available locally (TD-8).
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
  reports such files as "not checked". This bit twice (M3 and M4): do not use those labels in this
  repo's TypeScript (`[field: string, name: string]`, not `[object: string, ...]`), or dogfood
  silently skips the file.
- **Never run `sed` with `\|` or alternations on regex-heavy source.** In basic regex `\|` is
  alternation and corrupted a rule file in M4 (the tests caught it). Use a small Node script with
  exact string replacement that throws if the text is missing, or the Edit tool.
- Security tests build credential-shaped strings at run time and write them to temp projects: never
  commit a string that matches a real token format (GitHub push protection).
- Rules only run on files that parse cleanly; others are reported as "not checked" and have no
  metrics or facts. Anonymous callbacks and lambdas are not units. A unit's measures include nested
  functions.
- Grammar quirks, each with a test: Python `case _` is a bare `case_pattern`; C# `params int[] x` is
  two loose nodes in the parameter list; C# `this.x` keeps an anonymous `this` in the `expression`
  field; Python decorated methods sit under `decorated_definition`; TypeScript
  `import x = require()` keeps `source` inside the import clause; a JS tagged template is a
  `call_expression` whose `arguments` is a `template_string`; a C# declarator keeps its initializer
  as an unnamed child. **Probe the real tree (`toString()`) before writing extraction for a new
  construct.**
- Ignore semantics: defaults, root `.gitignore`, and config `ignore` are one ordered list at the
  root (ADR 0004, TD-2). The repo's `siftcode.config.json` ignores `test/fixtures/`.
- Calibration corpora (read-only scans): Python's `Lib` folder (it contains `site-packages` with
  22,000 files; exclude it with a config `ignore`), this repo's `node_modules` (about 1,500 JS
  files), `node_modules/eslint/lib`, and `node_modules/@typescript-eslint/typescript-estree/dist`.
  Thresholds in ADR 0005, 0006, and 0007 come from these. A scan of the whole Python install takes
  minutes and produces huge JSON.
- `brandkit` is not installed as a package; run it from the Brand Logos repo with
  `PYTHONPATH=src python -m brandkit ...`. Verify with
  `brandkit check siftcode <repo>/docs/brand --set readme` after any brand rebuild.
- A local hook requires every long-running shell command to start with `timeout N`, and an empty
  `python - <<EOF` heredoc opens an interactive REPL: write scripts to the scratchpad and run them.

## Placeholders and stubs

None. No mock data or stubbed integrations exist.

## Benchmark (Windows, Node 26)

`npm run benchmark`: 500 files, 52,375 lines: 0.74 s at M1, 2.18 s with metrics (M2), 2.99 s with
design facts (M3), about 2.5 s with security facts (M4; the last two are within run-to-run
variation), about 102 MB peak. Target (NFR-4): 50,000 lines in 30 s. Real code: the Python standard
library (1,823 files, 59,000 functions) scans in about 45 s; 1,488 third-party JS files in about
45 s.

## Session log (newest first)

- **2026-11-05, session 1 (continued):** Milestone 4 (security rules). Split the original M4: this
  session built US-030; the repository-level checks are now M4a. Built calls, named values, and
  string facts; per-hit severity; seven CWE-mapped rules; CWE tags in SARIF; skipped `.d.ts` files.
  Calibrated on four corpora, which removed 16 false credential findings and 25 non-executing
  `compile()` findings. Dogfood caught complexity and the TS grammar label limit again. 545 unit and
  5 end-to-end tests. ADR 0007.
- **2026-11-05, session 1 (continued):** Milestone 3 (design heuristics, ADR 0006) and Milestone 2
  (metrics, ADR 0005).
- **2026-11-01, session 1 (continued):** Re-synced brand assets after the typeface change.
- **2026-10-31, session 1 (continued):** Milestone 1 (engine, config, reports), license compliance
  added to the plan (M4b), npm name decided.
- **2026-10-31, session 1:** Kickoff, plan, Apache-2.0, design documentation checks in the plan,
  brand, Milestone 0.
