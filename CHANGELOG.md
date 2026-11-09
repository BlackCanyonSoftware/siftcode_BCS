# Changelog

All notable user-visible changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `siftcode scan <path>` walks a folder (or one file), parses JavaScript, TypeScript, Python,
  and C# files with tree-sitter, and reports findings. Files with syntax errors are reported as
  not checked and the scan continues.
- First rule, `SC-MET-001`: functions and methods longer than a limit (default 50 lines). Each
  finding carries the standard behind it, why it matters, and a suggested fix.
- Report formats: terminal text, JSON, Markdown, and SARIF 2.1.0 (`--format`, `--output`).
- `siftcode.config.json`: ignore patterns, per-rule enable/severity/options, and `failOn`.
  The project's `.gitignore` is respected.
- `--fail-on <level>`: exit code 1 when a finding is at least that severe. Exit code 2 for usage
  and configuration errors.
- `siftcode explain <rule-id>` shows why a rule exists, its standards, and an example.
- Code metrics for JavaScript, TypeScript, Python, and C#, measured the same way in every
  language: cyclomatic complexity, Halstead measures, Maintainability Index, lines of code,
  nesting depth, and parameter count. The JSON report lists them for every file and function.
- Rules `SC-MET-002` (cyclomatic complexity, default limit 10), `SC-MET-003` (parameters, 5),
  `SC-MET-004` (nesting depth, 4), and `SC-MET-005` (Maintainability Index below 20), each with
  a configurable limit, the standards behind it, and a suggested fix.
- Design rules, all heuristics: `SC-DES-001` Law of Demeter (a chain reaching through more than 3
  members), `SC-DES-002` Service Locator (fetching a dependency from a container instead of
  receiving it), `SC-DES-003` class with too many methods (25), `SC-DES-004` class whose methods fall
  into 3 or more groups that share no state, `SC-DES-005` module importing more than 25 modules.
  They skip test code, barrel files, and composition roots. The JSON report lists each class with
  its method, field, and cohesion figures.
- Security rules, each mapped to a CWE entry, an OWASP Top 10 category, and an OWASP cheat sheet:
  `SC-SEC-001` hardcoded credentials (never printed; known key formats are errors), `SC-SEC-002` SQL
  injection, `SC-SEC-003` command injection, `SC-SEC-004` dynamic code evaluation, `SC-SEC-005`
  weak hash or cipher, `SC-SEC-006` insecure deserialization, `SC-SEC-007` disabled certificate
  verification. They skip test code. SARIF output tags each rule with its CWE.
- TypeScript declaration files (`.d.ts`) are no longer parsed or reported as "not checked".
- Supply-chain rules, which read the project's manifests and files: `SC-SUP-001` dependencies with
  no lockfile, `SC-SUP-002` a dependency that accepts any version, `SC-SUP-003` a dependency from a
  git repository or web address (npm, Python, and NuGet), `SC-SUP-004` no CI configuration,
  `SC-SUP-005` no Dependabot or Renovate, `SC-SUP-006` no SBOM, `SC-SUP-007` no secret scanner.
  The last four only run when the scanned folder is the top of a Git repository.
- Design-documentation rules: `SC-DOC-001` no design or architecture documentation (a warning from
  20 source files, otherwise a note), `SC-DOC-002` documents but no diagrams, `SC-DOC-003` diagrams
  but no decision records, `SC-DOC-004` a diagram no document mentions. Recognizes architecture and
  design documents, ADRs, Mermaid, PlantUML, D2, DBML, Structurizr, draw.io, Excalidraw, Visio, UML
  and ArchiMate files, diagram images, fenced diagram blocks in Markdown, and OpenAPI/AsyncAPI.
- `npm run sbom` writes a CycloneDX bill of materials for the production dependencies.
- License rules: `SC-LIC-001` no license, `SC-LIC-002` a modified or unrecognized license file, `SC-LIC-003` a declaration that is not valid SPDX or disagrees with the license file, `SC-LIC-004` unfilled placeholders or no copyright holder, `SC-LIC-005` a bundled folder with its own undocumented license, `SC-LIC-006` inconsistent `SPDX-License-Identifier` headers, `SC-LIC-007` a dependency whose license conflicts with the project's, `SC-LIC-008` a dependency whose license is missing, unclear, or not granted.
- SiftCode identifies licenses offline: the SPDX list of 727 identifiers and the text of 56 common licenses are bundled, license files are matched by normalized text, and SPDX expressions (`MIT OR Apache-2.0`) are parsed. Dependency licenses are read from `package-lock.json`, installed `node_modules`, a Python virtual environment, or restored NuGet packages; a dependency whose license cannot be found is reported as unknown. Proprietary "All rights reserved" license files are recognized.
- Hotspots, `SC-HOT-001`: the complex files that were also changed in the most commits over the last 12 months, ranked (commits times total cyclomatic complexity), top 10. `SC-DOC-005`: a design document that predates a large rewrite of the code it covers (information only, low confidence). Both read the project's Git history by running `git` without running anything the project configures. In a folder that is not in a Git repository, or without Git, they are skipped and the report lists the reason under Notes (text, Markdown, and the JSON `notes` field).
- Apache-2.0 license.
