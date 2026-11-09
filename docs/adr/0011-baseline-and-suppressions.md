# ADR 0011: Baseline and inline suppressions (Milestone 6)

- Status: accepted (Milestone 6)
- Date: 2026-11-08

## Context

PRD US-070: accept the current findings into a baseline file so CI fails only on new ones, and let a comment in the code accept one finding if it gives a reason. Without both, a team that adopts SiftCode on an existing codebase either fixes everything first or switches the tool off, and a finding that is a deliberate choice stays red forever.

## Decisions

### Two ways to accept a finding, and one outcome
A finding is either **active** (reported, counted by `--fail-on`) or **accepted** (kept in `ScanResult.accepted` with how, never counted). Reports say how many were set aside; JSON lists them under `accepted` with `acceptedBy`; SARIF lists them with `suppressions` (`inSource` with the reason, or `external` for the baseline), which GitHub code scanning shows as dismissed. The SARIF and JSON `findings` and the exit code therefore mean what they always meant: what still needs a decision.

A comment is applied first, then the baseline takes what is left. A finding covered by both is shown as accepted by the comment, because the comment carries a reason.

### Inline comments: `siftcode-ignore <rule-id>[, <rule-id>...]: <reason>`
- **Both parts are required.** There is no blanket "ignore everything" form, because that is how a suppression outlives the reason for it. A comment without a reason, without a rule id, or naming an id SiftCode does not have does nothing, and a note says why (`a.js:12: siftcode-ignore needs a reason after the rule id...`). The finding stays, so a typo cannot silently hide a problem.
- **Where it applies.** The finding must start on the comment's line (a comment after code), or on the next line of code when the comment stands alone (blank lines and other `siftcode-ignore` comments in between are skipped, so several can be stacked). `siftcode-ignore-file` covers the whole file. It does not reach past a line of code.
- **A directive starts its comment.** After at most one comment opener (`//`, `#`, `/*`, `*`), the line begins with `siftcode-ignore`. A comment that only mentions it, or a documentation comment quoting an example (this repository's own sources do both), is ignored. Anticipated from those sources and pinned by a test; the first version of the matcher would have read them as directives and printed bogus notes on every scan of this repository.
- **Read from the syntax tree.** `comment` nodes of the parser, not a text search, so the same words inside a string literal are not a directive (tested). A comment that is too long to be a directive (400 characters) is not read.
- **Unused comments are reported** (`matched no finding`), except for rules that are switched off in the scan, which may be off on purpose.
- **Project-level findings have no line.** A missing license or CI file cannot carry a comment; the baseline or the config (`"enabled": false`) covers them.

### Baseline: `siftcode-baseline.json`
- `siftcode baseline <path>` scans (ignoring any existing baseline, applying comments) and writes the findings that are active. `-o` chooses the file; otherwise the config's `baseline` key; otherwise `siftcode-baseline.json` in the scanned folder.
- `siftcode scan --baseline <file>` or `"baseline"` in the config reads it. The flag is relative to the working folder, the config key to the scanned folder. A missing or invalid file is a usage error (exit 2) that says how to create it: failing quietly would let CI pass with the safety net gone.
- **Matching is by fingerprint** (rule, file, what was flagged, occurrence), the identity every finding already had (described in ARCHITECTURE.md and emitted as the SARIF `partialFingerprints`). Line numbers are not used, so moving code does not bring a finding back. Renaming a file does: the path is part of the identity.
- **The file is for diffs.** `{ "version": 1, "findings": [{ fingerprint, ruleId, path, message }] }`, sorted by path, rule, fingerprint; no dates, no absolute paths, no machine data. `ruleId`, `path`, and `message` are there for the reader of the pull request; only `fingerprint` is matched. Messages never contain a detected secret (a standing rule of the tool).
- **Stale entries are reported, not an error:** "The baseline lists N findings that no longer occur. Run siftcode baseline to refresh it." Fixing a finding should never break the build.
- **No automatic expiry.** A baseline can hide a finding indefinitely; adding review dates is a later option if teams ask for it.

### Contract changes
New command (`baseline`), flag (`--baseline`), config key (`baseline`), a JSON `accepted` array and `summary.accepted` (additive: `schemaVersion` stays 1, and `findings` still lists only what needs action), SARIF results with `suppressions`, and SARIF notifications for the scan notes (closing TD-20). This is part of the milestone scope in the PRD and roadmap.

## Evidence

- Unit tests: comment forms in JavaScript, TypeScript, Python, and C# (line, hash, block, trailing, own-line, stacked, file-wide, several ids), every malformed form with its note, a directive inside a string, a comment that only mentions the directive, the baseline round trip and its validation, code moving, stale entries, comment-over-baseline precedence, and the CLI (exit codes 0, 1, and 2, config key, refresh).
- Run on the FluentValidation clone (C#, 145 non-test files): `siftcode baseline` accepted 94 findings; the same scan with `--baseline --fail-on info` reported none and exited 0, where it exits 1 without it.
- The dogfood scan on this repository: no notes from its own documentation comments.

## Consequences

- Accepted findings are still computed on every scan, so the baseline does not make scans faster. It is a reporting filter.
- The scan keeps the (short) directive comments of every parsed file in memory until the findings are filtered; this is a few strings per file.
- Hotspot and documentation-freshness findings depend on the scan date (ADR 0010), so a baseline can list a hotspot that later falls out of the ranking; it then appears as a stale entry.
