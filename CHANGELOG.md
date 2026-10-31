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
- Apache-2.0 license.
