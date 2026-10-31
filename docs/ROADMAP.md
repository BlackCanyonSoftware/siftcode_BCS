# SiftCode: Roadmap

Rigor tier: MVP. Sizes: S (about a session), M (a few), L (many). Status: `planned`, `in progress`, `done`. The owner reviews and pushes after every milestone.

## Now / Next / Later

- **Now:** M1 is built; the owner reviews and pushes. (M0 is pushed and CI is green.)
- **Next:** M2 metrics for all three languages.
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

### M1: Engine, config, and report formats (M, done: awaiting owner review and push)
Goal: the full pipeline exists with one real rule so every later rule is "add a file".
Scope: discovery with ignores and limits; config schema; Code Model types; rule and catalog interfaces; finding model, fingerprints, ranking; terminal, JSON, Markdown, SARIF reporters; exit codes; parse-failure handling; one real rule (function length) as proof.
Exit: SARIF validates against the 2.1.0 schema; deterministic output test; exit codes 0/1/2 covered; benchmark script recorded.
Stories: US-001 to US-004, US-006, US-040, US-041, US-071.

### M2: Metrics for all three languages (M, planned)
Goal: cyclomatic complexity, Halstead, Maintainability Index, size/nesting/parameter metrics, with identical meaning across JS/TS, Python, C#.
Exit: shared cross-language fixtures produce expected numbers; thresholds configurable; each rule has rationale, references, suggestion.
Stories: US-010 to US-012, US-060 to US-062.

### M3: Design heuristics (M, planned)
Goal: Law of Demeter, Service Locator / IoC, SRP (oversized class/module) rules.
Exit: positive and negative fixtures per language; false-positive review on at least one real open-source repo per language; heuristics default to `warning` or lower.
Stories: US-020 to US-022.

### M4: Security, supply chain, and design documentation (M, planned)
Goal: starter CWE rule set, NIST SSDF-aligned repo hygiene checks, and detection of design/architecture documentation (UML, C4, Mermaid, PlantUML, ADRs, ...).
Exit: every security finding shows a CWE ID; secrets are redacted in output; manifest checks work for npm, pip, and NuGet; design-artifact detection recognizes every format listed in US-033 and reports "no design documentation" with a concrete suggestion; positive and negative fixtures for each rule.
Stories: US-030 to US-033.

### M4b: Licenses and compliance (M, planned)
Goal: detect whether a project has a license and which one, check it follows that license, and flag dependency licenses that conflict with it or are unknown.
Scope:
- Bundle the SPDX license list (license texts and metadata) as data; verify its license and the exact source before adding.
- License file detection and identification by normalized-text similarity; manifest and `SPDX-License-Identifier` reading; SPDX expression parser.
- Adherence checks: declared vs. file license, copyright holder and year, required notices (`NOTICE`, third-party attribution).
- Dependency license reading offline (lockfiles, installed packages for npm, Python, NuGet); "unknown" when unavailable.
- Compatibility table as versioned data with citations, plus the rules that apply it.
Exit: identifies the standard licenses in a fixture set (MIT, Apache-2.0, BSD-2/3, ISC, MPL-2.0, GPL-2.0/3.0, LGPL, AGPL-3.0, Unlicense, CC0) and a modified variant; reports "no license"; conflict cases covered by positive and negative fixtures; every finding includes the not-legal-advice note; the owner reviews the compatibility table.
Stories: US-035 to US-037.

### M5: Git hotspots and design-doc freshness (S, planned)
Goal: churn × complexity ranking from read-only Git history, and a low-confidence "design docs may be stale" check using the same history reader.
Exit: works on a repo with history; non-Git folders skip with a note; performance on a large history is bounded (configurable window, default last 12 months).
Stories: US-013, US-034.

### M6: HTML report, explain, baseline (M, planned)
Goal: shareable self-contained HTML report per DESIGN.md; `explain` command polish; baseline and inline suppressions.
Depends on: the SiftCode brand (available in `Brand Logos` as of 2026-10-31); bundle the application set into the report inputs at the start of this milestone.
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
| TD-5 | Test and generated code is scanned like production code; there is no per-path rule override yet (the repo's own config just ignores `test/fixtures/`). | Low | Consider `overrides` in config when real rule noise shows up (M2/M3) |
