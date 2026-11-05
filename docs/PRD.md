# SiftCode: Product Requirements

Status: draft for owner review. Rigor tier: **MVP**. Last updated: 2026-10-31.

## 1. Problem and vision

Teams know their code should follow proven standards (complexity limits, SOLID, CWE-aware security, supply-chain hygiene), but checking a whole repository against all of them is manual, inconsistent, and spread across many tools. Most tools say *what is wrong*; few say *what to do about it* in terms the developer can act on.

**SiftCode** is an offline command-line tool that scans a project, finds places that deviate from established best practices, and for every finding explains the standard behind it and suggests a concrete improvement.

Vision: someone runs `npx siftcode scan .` on any repo and gets a short, ranked list of the changes that would improve it most, each with a reason, a reference, and a fix to try.

## 2. Target users

| User | Need |
|---|---|
| Developer on a project | Find and fix quality and security problems before review |
| Tech lead / reviewer | Rank where to spend refactoring time (hotspots), enforce standards in CI |
| Small team without a dedicated quality tool | One tool that covers metrics, design, security basics, and repo hygiene |
| Owner (Black Canyon Software) | A trustworthy, brandable open-source tool |

## 3. Goals and non-goals

**Goals (v1)**
- G1. Scan JavaScript/TypeScript, Python, and C# (.NET) projects with one command.
- G2. Report measurable code metrics and flag outliers against standard thresholds.
- G3. Detect a curated set of design, security, and repo-hygiene issues, each mapped to a named standard (CWE, SOLID, Law of Demeter, NIST SSDF, ...).
- G4. Attach to every finding: why it matters, the standard reference, a concrete suggestion, and where applicable a before/after example.
- G5. Output formats usable by people and by CI: terminal, Markdown, JSON, SARIF 2.1.0, and a self-contained HTML report.
- G6. Run fully offline, deterministically, and never execute the scanned code.
- G7. Pass its own rules (dogfooding) in CI.
- G9. Check that the project has a license, identify it, check the project follows it, and catch dependencies whose licenses conflict with it (US-035 to US-037). This is a safety net that finds likely problems early, not legal advice.
- G8. Check that the project documents its design and architecture (written docs, decision records, diagrams such as UML, C4, Mermaid, PlantUML) and suggest what is missing. Checking the *content* of designs against the code is a stated later goal (see Non-goals).

**Non-goals (v1)**
- Verifying that design documents and diagrams match the code (design-vs-code drift, architecture conformance): later. v1 detects presence, kind, linkage, and freshness only (US-033, US-034). Doing more depends on which diagram formats can be parsed; text-based formats (Mermaid, PlantUML, Structurizr DSL) are the realistic first targets, binary/editor formats (Visio, draw.io images) are not.
- Legal advice or certification of license compliance. License findings are deterministic checks against published license data and a documented compatibility table; every one carries a confidence level and a "consult a lawyer for anything that matters" note. v1 does not resolve dual-licensing choices, patent questions, or contract terms.
- Real-time IDE integration (LSP / VS Code extension): later.
- Taint analysis / data-flow tracking: later (requires a per-language data-flow engine).
- Whole-program type resolution (Roslyn, TypeScript checker). v1 is syntax-level; see risk R2.
- Running other tools (mutation testing, fuzzers, chaos tests). v1 only checks *readiness* signals.
- Automatic code rewriting (auto-fix). Suggestions are text and snippets in v1.
- AI-generated suggestions. Optional, opt-in, and a possible later milestone; needs owner sign-off because it sends code to an outside service.
- Hosted service, accounts, or telemetry.

## 4. Scope (MoSCoW)

**Must:** US-001 to US-006, US-010 to US-013, US-020, US-021, US-030, US-033, US-040, US-041, US-060 to US-062, US-070
**Should:** US-022, US-031, US-032, US-034, US-035, US-036, US-037, US-050, US-051, US-052, US-071
**Could:** US-072, GitHub Action wrapper
**Won't (this release):** LSP, taint analysis, GraphQL/gRPC/AsyncAPI/OpenAPI checks, WCAG/Web Vitals, auto-fix, AI suggestions

## 5. User stories

Acceptance criteria use Given/When/Then. Full criteria for later milestones are refined when the milestone starts.

### Scanning and configuration
- **US-001** As a developer, I run `siftcode scan <path>` and get findings for all supported files under it.
  - Given a folder with JS/TS, Python, and C# files, when I scan it, then each supported file is analyzed and unsupported files are skipped with a count.
  - Given a path that does not exist, then the tool exits with code 2 and a message saying so.
- **US-002** As a developer, I configure rules, thresholds, and ignores in `siftcode.config.json` (validated by schema), and `.gitignore` plus built-in defaults (`node_modules`, `bin`, `obj`, `dist`, `.venv`) are respected.
  - Given an invalid config value, then the tool exits with code 2 naming the key and the allowed values.
- **US-003** As a CI user, I get SARIF 2.1.0 output that GitHub code scanning accepts.
- **US-004** As a developer, I get a Markdown and a JSON report.
- **US-005** As a reviewer, I get a self-contained HTML report with a summary, ranked findings, filters, light/dark toggle (sun/moon), and info buttons that reveal the longer explanation. (Brand styling when assets arrive.)
- **US-006** As a CI user, I set `--fail-on <severity>` and the exit code is 1 when a finding at or above it exists, 0 when none, 2 on usage or config errors.

### Metrics
- **US-010** Cyclomatic complexity per function; default review threshold 10 (configurable).
- **US-011** Halstead measures and Maintainability Index (0 to 100) per function and per file.
  - Given a function, when scanned twice on the same input, then the numbers are identical.
- **US-012** Size and structure metrics: lines of code, function length, parameter count, nesting depth.
- **US-013** Hotspots: files with both high complexity and high Git change frequency, ranked. Given a folder that is not a Git repo, then hotspots are skipped with a note, not an error.

### Design rules
- **US-020** Law of Demeter: flag long chained member access across objects (default depth > 3), excluding fluent/builder and well-known idiomatic APIs.
- **US-021** IoC: flag Service Locator usage (a class fetching its own dependencies from a container/locator/static factory) and suggest constructor injection.
- **US-022** SRP heuristics: oversized classes/modules (members, methods, imports from many unrelated areas) flagged as "likely multiple responsibilities".

### Security and supply chain
- **US-030** Starter CWE-mapped patterns: hardcoded secrets (CWE-798), SQL built from string concatenation (CWE-89), OS command from non-constant input (CWE-78), dynamic code evaluation (CWE-95), weak hash/crypto algorithms (CWE-327/328), insecure deserialization calls (CWE-502), disabled TLS verification (CWE-295). Each finding shows the CWE ID.
- **US-031** Repo hygiene (NIST SSDF-aligned): lockfile present, dependencies pinned, SBOM or generation step present, CI config present, secret-scanning/dependency-update config present.
- **US-032** Dependency declaration smells: unpinned ranges (`*`, `latest`), git/URL dependencies, per ecosystem (npm, pip, NuGet).

### Design and architecture documentation
- **US-033** As a tech lead, I learn whether the project documents its design, and what kind, so missing design artifacts are flagged with a concrete next step.
  - Recognized artifacts (by file name, folder, extension, or fenced block; contents are not interpreted in v1):
    - written design: `ARCHITECTURE`/`DESIGN` documents, arc42-style structure, `docs/adr` / `doc/adr` / `docs/architecture/decisions` decision records;
    - diagrams as code: Mermaid (`.mmd`, fenced `mermaid` blocks in Markdown), PlantUML (`.puml .plantuml .pu .wsd .iuml`), Structurizr DSL (`.dsl`), D2 (`.d2`), DBML (`.dbml`);
    - diagram editor and interchange files: draw.io (`.drawio .dio`), Excalidraw (`.excalidraw`), Visio (`.vsdx`), UML/XMI (`.uml .xmi`), ArchiMate exchange (`.archimate`);
    - diagram images in design/doc folders (`.png .svg`), counted as "diagram images, content not inspected";
    - interface specifications (OpenAPI, AsyncAPI) as interface design.
  - Given a repository of meaningful size (configurable, default 20 source files) with no recognized design artifact, then one finding "No design or architecture documentation found" is reported with the suggestion: add a context and a container diagram (C4 model) as Mermaid or PlantUML under `docs/`, record the main decision as an ADR, and link both from the README.
  - Given written docs but no diagrams, then a lower-severity finding suggests adding at least one structural diagram. Given diagrams but no decision records, then it suggests ADRs. Given diagram files that no Markdown file links to, then it notes they are unreferenced.
  - Given a small repository below the size threshold, then the finding is `note` severity, not `warning`.
  - Standards cited: C4 model, UML (ISO/IEC 19505), ISO/IEC/IEEE 42010 (architecture description), arc42, Architecture Decision Records.
- **US-034** (Should) As a tech lead, I am told when design docs look stale: in a Git repo, when the code under the area a design document covers has changed substantially since the document last changed (configurable window and threshold), then a low-confidence finding says the design docs may be out of date.

### License and compliance
- **US-035** As a maintainer, I learn whether my project has a license and which one it is.
  - Given a repository with no license file and no declared license, then a finding says it is effectively "all rights reserved" (others have no permission to use it) and suggests choosing a license (for example MIT or Apache-2.0 for permissive, with a pointer to choosealicense.com).
  - Given a `LICENSE`/`LICENSE.md`/`COPYING` file, then SiftCode identifies it against the bundled SPDX license list by comparing normalized text; a match above a documented similarity threshold reports the SPDX identifier, a near match reports "modified `<id>`" at lower confidence, and no match reports "unrecognized or custom license".
  - Declared licenses are also read from package manifests (`package.json` `license`, `pyproject.toml`, `.csproj`/`.nuspec` `PackageLicenseExpression`) and from `SPDX-License-Identifier` headers.
- **US-036** As a maintainer, I learn how well the project follows its own license.
  - Checks: declared license (manifest) matches the license file; copyright holder and year are present where the license has a placeholder; required notices exist (for example Apache-2.0's `NOTICE`, attribution for bundled third-party code); source-file headers or SPDX tags are consistent if the project uses them; no conflicting license files in subfolders without being documented.
- **US-037** As a maintainer, I am warned when a dependency's license conflicts with mine, or cannot be determined.
  - License data is read offline from what is present: lockfiles, installed packages (`node_modules/*/package.json`, Python package metadata, NuGet package `.nuspec` files). When it is not available offline, the dependency is reported as "license unknown" instead of guessed.
  - Conflicts come from a documented, versioned compatibility table (for example GPL-2.0-only with Apache-2.0, AGPL network-use obligations in a permissive project, non-commercial or source-available licenses such as CC-BY-NC, SSPL, BSL, and "no license" dependencies), with SPDX expressions (`MIT OR Apache-2.0`) evaluated correctly.
  - Given a permissive project and a dependency under a strong copyleft license that is bundled or linked, then a finding names the dependency, both licenses, and the likely obligation, and suggests an alternative or a license change.
  - Standards cited: SPDX license list and expression syntax, REUSE specification, OSI-approved license list. Compatibility rules are cited to each license's own text.

### Suggestions
- **US-040** Every finding carries: rule ID, severity, confidence, location, message, standard reference(s), rationale, suggestion, and optionally a before/after snippet.
- **US-041** `siftcode explain <rule-id>` prints the rule's rationale, references, and examples without scanning.

### Testing-readiness (Should)
- **US-050** Detect whether a test suite exists and whether mutation testing, property-based testing, or fuzzing tooling is configured; recommend what is missing.
- **US-051** Flag input parsers / binary decoders without fuzz targets (informational).
- **US-052** Flag hardcoded timeouts, missing retry/fallback around remote calls, and missing circuit-breaker wrappers (informational, low confidence).

### Languages
- **US-060** JavaScript and TypeScript (`.js .jsx .mjs .cjs .ts .tsx`).
- **US-061** Python (`.py`).
- **US-062** C# (`.cs`), with `bin/` and `obj/` excluded.

### Operations and quality
- **US-070** Baseline/suppression: accept current findings into a baseline file so CI only fails on *new* ones; inline suppression comments require a reason.
- **US-071** Parse failures never crash a scan: the file is reported as "could not parse" and the scan continues.
- **US-072** Dogfood: CI runs SiftCode on its own source and fails on regressions.

## 6. Blueprint triage

The blueprint (`software_architecture_quality_analysis_blueprint.md`) is a taxonomy of everything we might check. Each item is classified by *how* it can be detected, which decides when it is feasible.

Detection kinds: **S** syntax/AST, **R** repository / Git history, **C** config and CI files, **X** needs execution or external tooling (readiness check only), **D** needs data-flow or type resolution.

| Blueprint item | Kind | v1? | Notes |
|---|---|---|---|
| 1.1 CISQ characteristics | S/C | Partial | Used as the category taxonomy (Reliability, Performance, Security, Maintainability). Measures are implemented through the specific rules below. CISQ text is not reproduced; we cite by name. |
| 1.2 Cyclomatic, Halstead, MI | S | Yes | M2 |
| 1.2 Churn × complexity | R | Yes | M5 |
| 2.1 Saga, CQRS, Event Sourcing, Bulkhead, Circuit Breaker | S/C | Later | Hard to detect reliably from syntax; circuit-breaker/retry presence is a low-confidence "readiness" hint (US-052). |
| 2.2 Hexagonal, Strangler Fig | S/R | Later | Needs project-structure modelling; dependency-direction checks are a candidate for v1.x. |
| 3 Richardson, OpenAPI, AsyncAPI, gRPC, GraphQL | S/C | Later | Needs spec parsers per format. |
| 4 CWE mapping | S | Yes (starter set) | M4; every security rule carries a CWE ID. |
| 4 CERT secure coding | S | Later | CERT C/C++/Java/Perl; none are v1 languages. Python/C# analogues possible later. |
| 4 NIST SSDF supply chain | C/R | Yes | M4: lockfile, pinning, SBOM, signed-commit signal (R). |
| 4 Taint analysis | D | No | Later milestone with its own design. |
| (added by owner) Design and architecture documentation: UML, C4, ADRs, diagrams | C (presence, kind, linkage); R (freshness); D (content vs. code) | Presence and freshness yes; content-vs-code later | M4 (US-033), M5 (US-034). Drift/conformance checks are a later track and depend on parsing text-based diagram formats. |
| (added by owner) License presence, identification, adherence, and dependency license compatibility | C (files, manifests, lockfiles, installed packages) | Yes, as its own milestone | M4b (US-035 to US-037). Related to NIST SSDF supply-chain checks (US-031). Not legal advice. |
| 5.1 SOLID / GRASP | S | Partial | SRP and ISP heuristics, DIP via IoC; others need type info. |
| 5.2 Law of Demeter | S | Yes | M3 |
| 5.3 IoC / Service Locator | S | Yes | M3 |
| 6 Mutation, property-based, fuzzing, chaos | X | Readiness only | Detect tooling/config presence and risky patterns; do not run tools. (The blueprint names Pitest, a Java tool; the analogue differs per language: Stryker for JS/TS and .NET, mutmut for Python.) |
| 7 WCAG, Web Vitals, state management | S/C | Later | Frontend track after the core is solid. |
| 8 SARIF | out | Yes | M1 |
| 8 LSP | out | No | Later; engine is designed so a language server can reuse it. |

## 7. Non-functional requirements

- **NFR-1 Offline and private:** no network access during a scan, no telemetry. Source code never leaves the machine.
- **NFR-2 Safe on untrusted code:** the scanned code is parsed, never executed, imported, or built. Limits on file size and parse time; symlinks are not followed outside the scan root.
- **NFR-3 Deterministic:** the same input and config produce byte-identical JSON/SARIF (stable ordering, no timestamps in the finding data).
- **NFR-4 Performance:** scan 50k lines across mixed languages in under 30 seconds on a typical laptop; memory bounded by streaming files, not holding every tree. Measured in M2 (with metrics): 52k lines in 2.2 s, about 107 MB peak (see ARCHITECTURE). Re-measure as rules are added.
- **NFR-5 Portability:** Windows, macOS, Linux; Node LTS; no native compilation required to install.
- **NFR-6 Signal over noise:** every rule has a confidence level; rules that are heuristic default to `warning` or lower; a false-positive report is a bug.
- **NFR-7 Accessible reports:** HTML report meets WCAG 2.2 AA (keyboard operable, contrast, no color-only meaning). Terminal output respects `NO_COLOR` and does not depend on emoji.
- **NFR-8 Supply chain:** minimal dependencies, lockfile committed, pinned versions, SBOM and provenance on release.

## 8. Success metrics

- A fresh clone scans its own repo cleanly in CI (dogfood passes).
- On three real open-source repos (one per language), at least 80% of reviewed findings are judged "useful or at least valid" by the owner in a manual sample of 30 (set the bar after the first sample).
- Every shipped rule has a standard reference, a suggestion, and a test with a positive and a negative case.

## 9. Assumptions

- A1. Implementation in TypeScript on Node, parsing via tree-sitter (see ADR 0001).
- A2. v1 is a CLI and a library API; npm package name `siftcode` (availability not yet checked).
- A3. Deterministic rule-based suggestions; no AI in v1.
- A4. Thresholds (e.g., cyclomatic > 10, Demeter depth > 3) come from the blueprint and common practice and are configurable.
- A5. Standards are referenced by name, number, and link. Their text is not copied into the repo (CWE is free to reference with attribution; ISO/CISQ material is copyrighted).
- A7. Design-documentation detection is deliberately format-tolerant and content-blind in v1: a diagram's presence is evidence the team thought about design, not evidence it is correct.
- A6. Project name in docs is "SiftCode"; CLI binary is `siftcode`.

## 10. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | False positives erode trust | High | Confidence levels, conservative defaults, baseline/suppression, fixtures from real code, per-rule precision review before release |
| R2 | Syntax-only analysis limits accuracy, especially in C# and typed TS (no type resolution) | Medium | State limits in each rule's docs; keep type-dependent rules out of v1; revisit Roslyn / TS checker adapters later |
| R3 | Scope creep from the very large blueprint | High | Triage table above; one vertical slice at a time; owner approves each milestone |
| R4 | Grammar coverage differences between languages produce inconsistent metrics | Medium | A language-neutral code model with per-language adapters and shared metric tests across all three languages |
| R5 | Tool itself becomes a supply-chain risk (reads all of a user's code) | High | Offline, minimal deps, pinned, provenance, no execution of scanned code |
| R6 | Performance on large repos | Medium | Per-file streaming, worker threads (M2+), benchmark in CI |
| R7 | Heuristic rules (Demeter, SRP) are subjective | Medium | Mark as `heuristic`, default `info`/`warning`, explain trade-offs in the suggestion |
| R8 | License findings read as legal assurance, or the compatibility table is wrong or out of date | High | Say "not legal advice" in output; confidence levels; table is data, versioned, cited to license texts, and covered by tests; unknown is reported as unknown, never guessed; owner reviews the table before release |

## 11. Open questions

1. ~~License~~ Resolved 2026-10-31: Apache-2.0, see [ADR 0002](adr/0002-apache-2-license.md).
2. ~~Package name~~ Resolved 2026-10-31 by the owner: publish as plain `siftcode`. It was unclaimed on npm on 2026-10-31 (unclaimed is not reserved), so claim it early.
3. ~~Brand assets~~ Resolved 2026-10-31: the SiftCode brand exists in `Brand Logos` (`brands/siftcode`); README assets are bundled in `docs/brand/`. Still open: the brand has no tagline or domain set, so the README has no tagline until the owner provides one.
4. ~~Minimum Node version~~ Resolved in M0: Node 24 or newer, see [ADR 0003](adr/0003-toolchain-and-install-policy.md).

## 12. Glossary

| Term | Meaning |
|---|---|
| Finding | One detected issue at a location, produced by a rule |
| Rule | A check with an ID (e.g., `SC-MET-001`), a category, default severity, standard references, and a suggestion |
| Suggestion | The recommended improvement attached to a finding or rule |
| Code Model | The language-neutral representation (files, classes, functions, calls, imports) built from each language's syntax tree |
| Language adapter | The module that parses one language and fills the Code Model |
| Reporter | Output writer for one format (terminal, Markdown, JSON, SARIF, HTML) |
| Hotspot | A file that is both complex and frequently changed |
| Confidence | How sure a rule is that a finding is real: `high`, `medium`, `low` |
| Baseline | A saved list of accepted findings, so CI fails only on new ones |
