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
- Apache-2.0 license.
