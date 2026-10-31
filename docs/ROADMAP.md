# SiftCode: Roadmap

Rigor tier: MVP. Sizes: S (about a session), M (a few), L (many). Status: `planned`, `in progress`, `done`. The owner reviews and pushes after every milestone.

## Now / Next / Later

- **Now:** plan review (this document set).
- **Next:** M0 walking skeleton, then M1 engine and reports.
- **Later:** M2 to M7 below; then the deferred tracks listed at the bottom.

## Milestones

### M0: Walking skeleton (S, planned)
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

### M1: Engine, config, and report formats (M, planned)
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

### M4: Security and supply chain (M, planned)
Goal: starter CWE rule set and NIST SSDF-aligned repo hygiene checks.
Exit: every security finding shows a CWE ID; secrets are redacted in output; manifest checks work for npm, pip, and NuGet; positive and negative fixtures for each rule.
Stories: US-030 to US-032.

### M5: Git hotspots (S, planned)
Goal: churn × complexity ranking from read-only Git history.
Exit: works on a repo with history; non-Git folders skip with a note; performance on a large history is bounded (configurable window, default last 12 months).
Stories: US-013.

### M6: HTML report, explain, baseline (M, planned)
Goal: shareable self-contained HTML report per DESIGN.md; `explain` command polish; baseline and inline suppressions.
Depends on: brand assets (logo, palette) from the owner; neutral placeholders are used until then.
Exit: WCAG 2.2 AA checks pass (automated plus a keyboard pass); light/dark toggle and info buttons work; checked at 375/768/1280 px with no console errors.
Stories: US-005, US-070.

### M7: Testing-readiness, dogfood gate, and 0.1.0 release prep (M, planned)
Goal: readiness hints (US-050 to US-052), CI dogfood gate (US-072), release pipeline with SBOM and provenance, GitHub Action wrapper (Could), npm publish dry run.
Exit: `npm pack` contents reviewed; SBOM generated; dry-run publish succeeds; the owner publishes.
Stories: US-050 to US-052, US-072.

## Deferred tracks (not scheduled)

- Taint analysis (sources, sinks, sanitizers) with a data-flow engine.
- API and contract checks: OpenAPI, AsyncAPI, gRPC/Protobuf evolution, GraphQL depth and N+1, Richardson maturity.
- Architecture styles: layering and dependency-direction rules, Hexagonal, CQRS, Event Sourcing, Saga, Bulkhead, Circuit Breaker detection.
- Frontend: WCAG in JSX/HTML, Web Vitals signals, props drilling and state discipline.
- LSP server and VS Code extension.
- Optional deeper adapters: Roslyn (C#), TypeScript compiler API.
- Auto-fix patches for safe, mechanical suggestions.
- Opt-in AI-written suggestions (needs owner approval: paid service, sends code out).
- More languages (Java, Go, Rust, ...).

## Tech debt and TODO list

None yet. Every TODO in the code must have an entry here.
