# SiftCode: Roadmap

Rigor tier: MVP. Sizes: S (about a session), M (a few), L (many). Status: `planned`, `in progress`, `done`. The owner reviews and pushes after every milestone.

## Now / Next / Later

- **Now:** M5 is built; the owner reviews and pushes. (M0 and M1 are pushed and CI is green; M2 to M5 await push.)
- **Next:** M6 HTML report, explain, baseline.
- **Later:** M2 to M7 below; then the deferred tracks listed at the bottom.

## Milestones

### M0: Walking skeleton (S, done; pushed, CI green)
Goal: a fresh clone builds, tests, and runs `siftcode scan` end to end on one trivial check, with all tooling and CI in place.
Scope: tooling and one tiny vertical path; no product rules yet.
- Verify and add dependencies (names, publishers, licenses) per ADR 0001.
- `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`/`engines`, lockfile.
- TypeScript strict, ESLint, Prettier, Vitest, pre-commit hooks, GitHub Actions CI (lint, typecheck, test, build).
- `siftcode scan <path>` parses one JS/TS, one Python, and one C# file with tree-sitter and prints "N files, languages found" (proves all three grammars load on Windows).
- `README.md`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`), `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/HANDOFF.md`.
- Resolve the license question; check npm name.
Exit: fresh clone → `npm ci && npm test && npm run build && node dist/cli.js scan test/fixtures` works; a test passes at each level set up; CI config written (reported "not verified until pushed").
Stories: US-001 (partial), US-060 to US-062 (parse only).

### M1: Engine, config, and report formats (M, done; pushed, CI green)
Goal: the full pipeline exists with one real rule so every later rule is "add a file".
Scope: discovery with ignores and limits; config schema; Code Model types; rule and catalog interfaces; finding model, fingerprints, ranking; terminal, JSON, Markdown, SARIF reporters; exit codes; parse-failure handling; one real rule (function length) as proof.
Exit: SARIF validates against the 2.1.0 schema; deterministic output test; exit codes 0/1/2 covered; benchmark script recorded.
Stories: US-001 to US-004, US-006, US-040, US-041, US-071.

### M2: Metrics for all three languages (M, done: awaiting owner review and push)
Goal: cyclomatic complexity, Halstead, Maintainability Index, size/nesting/parameter metrics, with identical meaning across JS/TS, Python, C#.
Exit: shared cross-language fixtures produce expected numbers; thresholds configurable; each rule has rationale, references, suggestion.
Stories: US-010 to US-012, US-060 to US-062.
Result: rules `SC-MET-001` to `SC-MET-005` (function length, cyclomatic complexity, parameters, nesting, maintainability index of a function) and later `SC-MET-006` (file length, 500 lines); every measure of every file and function in the JSON report; definitions in [ADR 0005](adr/0005-metric-definitions.md). A file-level maintainability rule was built, tested on real code, and dropped as noise (see the ADR).

### M3: Design heuristics (M, done: awaiting owner review and push)
Goal: Law of Demeter, Service Locator / IoC, SRP (oversized class/module) rules.
Exit: positive and negative fixtures per language; false-positive review on at least one real open-source repo per language; heuristics default to `warning` or lower.
Stories: US-020 to US-022.
Result: rules `SC-DES-001` (Law of Demeter), `SC-DES-002` (Service Locator), `SC-DES-003` (class has too many methods), `SC-DES-004` (class cohesion, LCOM4), `SC-DES-005` (module fan-out); imports, member chains, and class facts in the Code Model; thresholds calibrated on the Python standard library and ESLint; definitions and evidence in [ADR 0006](adr/0006-design-heuristics.md). The false-positive review covered JavaScript and Python on real code; C# only on fixtures and 26 small files (TD-8).

### M4: Security rules (M, done: awaiting owner review and push)
Goal: a starter set of CWE-mapped security checks.
Exit: every security finding shows a CWE ID; credentials are never repeated in output; positive and negative fixtures for each rule in each language; calibrated on real code.
Stories: US-030.
Result: rules `SC-SEC-001` hardcoded credentials (CWE-798), `SC-SEC-002` SQL injection (CWE-89), `SC-SEC-003` command injection (CWE-78), `SC-SEC-004` dynamic code evaluation (CWE-95), `SC-SEC-005` weak hash or cipher (CWE-327, 328), `SC-SEC-006` insecure deserialization (CWE-502), `SC-SEC-007` disabled certificate verification (CWE-295). New facts: calls with argument shapes, named values, and long strings. CWE tags in SARIF; per-finding severity; TypeScript declaration files are skipped. Definitions and evidence in [ADR 0007](adr/0007-security-rules.md). The original M4 was split because security reads code facts while supply chain and design documentation read repository files.

### M4a: Repository hygiene: supply chain and design documentation (M, done: awaiting owner review and push)
Goal: NIST SSDF-aligned repository checks and detection of design and architecture documentation (UML, C4, Mermaid, PlantUML, ADRs, ...).
Scope: a repository-level rule type that sees the project's files (manifests, lockfiles, CI configuration, docs, diagrams), not only source files; lockfile, pinning, SBOM, CI, dependency-update and secret-scanning configuration checks for npm, pip, and NuGet; design-artifact detection for every format listed in US-033.
Exit: manifest checks work for npm, pip, and NuGet; design-artifact detection recognizes every format listed in US-033 and reports "no design documentation" with a concrete suggestion; positive and negative fixtures for each rule; calibrated on real repositories.
Stories: US-031 to US-033.
Result: a repository-level rule type (`defineRepoRule`, `RepoView`); rules `SC-SUP-001` lockfile, `SC-SUP-002` floating versions, `SC-SUP-003` git or URL dependencies, `SC-SUP-004` CI, `SC-SUP-005` dependency updates, `SC-SUP-006` SBOM, `SC-SUP-007` secret scanning; `SC-DOC-001` to `SC-DOC-004` design documentation (none, no diagrams, no decision records, unreferenced diagrams). Manifests for npm, Python, and NuGet are read without new dependencies. Calibrated on 19 local repositories. Definitions and evidence in [ADR 0008](adr/0008-repository-hygiene.md). `npm run sbom` added; `SC-SUP-007` is switched off for this repository (GitHub push protection).

### M4b: Licenses and compliance (M, done: awaiting owner review and push)
Goal: detect whether a project has a license and which one, check it follows that license, and flag dependency licenses that conflict with it or are unknown.
Scope:
- Bundle the SPDX license list (license texts and metadata) as data; verify its license and the exact source before adding.
- License file detection and identification by normalized-text similarity; manifest and `SPDX-License-Identifier` reading; SPDX expression parser.
- Adherence checks: declared vs. file license, copyright holder and year, required notices (`NOTICE`, third-party attribution).
- Dependency license reading offline (lockfiles, installed packages for npm, Python, NuGet); "unknown" when unavailable.
- Compatibility table as versioned data with citations, plus the rules that apply it.
Exit: identifies the standard licenses in a fixture set (MIT, Apache-2.0, BSD-2/3, ISC, MPL-2.0, GPL-2.0/3.0, LGPL, AGPL-3.0, Unlicense, CC0) and a modified variant; reports "no license"; conflict cases covered by positive and negative fixtures; the compatibility table is data with a source for every row.
Stories: US-035 to US-037.
Result: rules `SC-LIC-001` to `SC-LIC-008` (no license, modified or unrecognized license file, declaration vs file, placeholders and copyright holder, undocumented bundled licenses, SPDX headers, dependency conflicts, dependency licenses unknown or not granted). Bundled SPDX data (727 ids, 56 recognizable texts) from the dev-only `spdx-license-list`; SPDX expression parser; text matcher calibrated on 130 real license files; offline dependency licenses from npm lockfiles and installed packages, Python virtual environments, and NuGet `.nuspec` files; a cited, versioned compatibility table (version 1). `RepoView.read` and `list` reach ignored folders without leaving the scan root. Definitions and evidence in [ADR 0009](adr/0009-license-checks.md).

### M5: Git hotspots and design-doc freshness (S, done: awaiting owner review and push)
Goal: churn × complexity ranking from read-only Git history, and a low-confidence "design docs may be stale" check using the same history reader.
Exit: works on a repo with history; non-Git folders skip with a note; performance on a large history is bounded (configurable window, default last 12 months).
Stories: US-013, US-034.
Result: a read-only Git history reader (`src/git/`, runs the `git` program safely, bounded, reports why when there is no history); `RepoView` gains `git()`, `codeFiles`, and `note()`, and scan results gain `notes` (shown in the text, Markdown, and JSON reports); rules `SC-HOT-001` (hotspots: commits × complexity, top 10 over 12 months) and `SC-DOC-005` (a design document that predates a large rewrite of the code it covers). Definitions and evidence in [ADR 0010](adr/0010-git-history-rules.md).

### M6: HTML report, explain, baseline (M, planned)
Goal: shareable self-contained HTML report per DESIGN.md; `explain` command polish; baseline and inline suppressions.
Depends on: the SiftCode brand (available in `Brand Logos` as of 2026-10-31); bundle the application set into the report inputs at the start of this milestone (`brandkit bundle siftcode <dir>`, then `brandkit check`). Take the typeface from `template/fonts.css` and embed the font file; never write a `font-family` by hand (it changed when the brand was rebuilt on 2026-11-01).
Exit: WCAG 2.2 AA checks pass (automated plus a keyboard pass); light/dark toggle and info buttons work; checked at 375/768/1280 px with no console errors.
Stories: US-005, US-070.

### M7: Testing-readiness, dogfood gate, and 0.1.0 release prep (M, planned)
Goal: readiness hints (US-050 to US-052), CI dogfood gate (US-072), release pipeline with SBOM and provenance, GitHub Action wrapper (Could), npm publish dry run.
Exit: `npm pack` contents reviewed; SBOM generated; dry-run publish succeeds; the owner publishes.
Stories: US-050 to US-052, US-072.

## Deferred tracks (not scheduled)

- Taint analysis (sources, sinks, sanitizers) with a data-flow engine.
- API and contract checks: OpenAPI, AsyncAPI, gRPC/Protobuf evolution, GraphQL depth and N+1, Richardson maturity.
- Design-vs-code drift and architecture conformance: parse text-based diagram formats (Mermaid, PlantUML, Structurizr DSL, UML/XMI) and compare declared components, layers, and dependencies with the Code Model; first target is "a component in the diagram has no matching module in the code, and vice versa".
- Architecture styles: layering and dependency-direction rules, Hexagonal, CQRS, Event Sourcing, Saga, Bulkhead, Circuit Breaker detection.
- Frontend: WCAG in JSX/HTML, Web Vitals signals, props drilling and state discipline.
- LSP server and VS Code extension.
- Optional deeper adapters: Roslyn (C#), TypeScript compiler API.
- Auto-fix patches for safe, mechanical suggestions.
- Opt-in AI-written suggestions (needs owner approval: paid service, sends code out).
- More languages (Java, Go, Rust, ...).

## Tech debt and TODO list

There are no TODO comments in the code. Every future TODO must have an entry here.

| ID | Item | Severity | Plan |
|---|---|---|---|
| TD-1 | `npm audit` reports 11 moderate findings, all dev-only (a `minimatch` denial-of-service advisory reached through `eslint` and `typescript-eslint`). Production dependencies: 0 findings. CI audits production only. | Low | Re-check when eslint or typescript-eslint release; consider an `overrides` entry in M1 |
| TD-2 | Ignore handling is close to Git's, not identical: only `.gitignore` files inside the scanned folder are read (not `.git/info/exclude` or the global ignore file), and a nested `.gitignore` cannot re-include a folder its parent ignored. | Low | Only if users hit it |
| TD-3 | TypeScript is pinned to 6.0.3 because `typescript-eslint` does not support 7.x yet. | Low | Revisit with each typescript-eslint release |
| TD-4 | The first `npm test` needs network access to download the SARIF schema (cached afterwards, hash-checked), and JSON Schema `format` keywords are not validated (ADR 0004). | Low | Add `ajv-formats` if format checks become important |
| TD-5 | Test and generated code is scanned like production code; there is no per-path rule override yet (the repo's own config just ignores `test/fixtures/`). | Low | Consider `overrides` in config when real rule noise shows up (M3) |
| TD-6 | Measuring walks every token twice (per function and per file) and allocates a wrapper per syntax node: the benchmark went from 0.74 s to 2.18 s for 52k lines, still 14 times inside NFR-4. | Low | Single pass or a tree cursor if rules grow heavier |
| TD-7 | The JSON report carries every measure of every function, pretty-printed: 45 MB for the 59,000 functions of the Python standard library. | Low | Add a compact or `--no-metrics` option if it matters |
| TD-8 | C# was reviewed on two real projects on 2026-11-08: FluentValidation (145 non-test files, a fluent-API library) and a 35-file ASP.NET WebForms school assignment. The review found and fixed .NET test projects being scanned as production code (80 of 170 findings, 71 of the 73 Law of Demeter ones) and test-project NuGet packages counted as runtime. Still open: the security rules found nothing in either project, because neither uses the risky APIs (`SqlCommand`, `Process.Start`, weak hashes, deserializers), so C# security detection is verified on fixtures only; a fluent builder method such as `AppendArgument()` still counts as reaching through an object (2 findings). | Low | Review security rules on a C# project that has a database or process calls |
| TD-9 | tree-sitter-typescript 0.23.2 cannot parse labeled tuple elements named `object`, `string`, `number`, `readonly`, `keyof`, `infer`, `abstract`, `any`, `unknown`, or `never`. Such files are reported as "not checked". SiftCode hit this on its own source in both M3 and M4. | Low | Upgrade the grammar when a fixed release exists |
| TD-12 | The security rules work from syntax only: "built from a variable" does not mean the variable holds untrusted input, and indirection is followed only through a name assigned earlier in the same function. No taint tracking. | Medium | Taint analysis track (deferred) |
| TD-13 | `require('child_process').exec(x)` written inline, without binding the module to a name, is not detected by `SC-SEC-003`. Credential detection is a short list of formats, not a full secret scanner. | Low | Extend when real misses are found |
| TD-10 | `SC-DES-002` (Service Locator) found nothing in about 2,200 real files (no false positives), but none of that code uses a DI container: detection is verified on fixtures only. | Low | Check against a real ASP.NET, NestJS, or Python DI project |
| TD-14 | `pyproject.toml` and `Pipfile` are read with a narrow line reader, not a TOML parser: dependency arrays and Poetry/Pipenv tables only. An unusual layout shows fewer dependencies, never invented ones. | Low | Add a TOML parser if real misses are found |
| TD-15 | Whole-project repository checks (CI, updates, SBOM, secret scanning, design documentation) run only at the top of a Git repository. A folder that is not a repository gets none, and agent working copies inside a project (such as `.claude/worktrees/`) are scanned like any other folder. SiftCode also cannot see platform settings (GitHub secret scanning, branch protection). | Low | Revisit with per-path overrides (TD-5) |
| TD-16 | License text matching uses word-pair similarity: a real change of terms shorter than 14 words in a license of about 100 words or more can still score as a match (0.90 or more). A modified license is only caught when it adds or removes a longer stretch. | Medium | Per-license templates with replaceable text (SPDX matching guidelines), or a diff of key sentences |
| TD-17 | The license compatibility table (version 1) is built from the FSF, ASF, and MPL statements and the license texts. It does not know whether a dependency is linked, bundled, or run separately, so its wording is conditional. | Low | Fix a row if someone finds it wrong; the generated `docs/license-table-review.md` makes that easy to check |
| TD-18 | Dependency licenses are read only from the project folder: not the NuGet global cache, Python environments elsewhere, or yarn/pnpm lockfiles (no license field). A `SEE LICENSE IN` pointer is reported, not followed. Cargo, Go, and Maven are not covered. | Low | Extend by ecosystem when requested |
| TD-19 | `SC-DOC-005` thresholds (90 days, 500 lines, 50% of the covered code) are untuned: none of the local projects had a document old enough to trigger them, and the relaxed-threshold probe only showed the mechanism works. FluentValidation (2009, 2,513 commits) has only user guides in `docs/`, and `marketpredictor` (28 commits since 2026-09-30) has no document older than 39 days, so neither tests the rule; `marketpredictor` reaches 90 days on 2026-12-29. A good corpus is a repository of at least a year with an `ARCHITECTURE.md` or `docs/design` folder that was written early and not touched while the code was rewritten. Renames are not followed, so a renamed file's history starts again; hotspots count commits, not authors. | Medium | Tune on older repositories; follow renames if hotspots go missing |
| TD-20 | Git rules need the `git` program and give results that change with the date of the scan. SARIF output does not carry the notes that say a rule was skipped. | Low | Add SARIF notifications in M6 |
| TD-11 | Design rules skip test code by path (`test` folders, `*.test.*`, `test_*`, ...); a scan started inside a tests folder cannot see the folder name. | Low | Revisit with per-path rule overrides (TD-5) |
