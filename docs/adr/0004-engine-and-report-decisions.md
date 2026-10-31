# ADR 0004: Engine, config, and report decisions (Milestone 1)

- Status: accepted (Milestone 1)
- Date: 2026-10-31

## Context

Milestone 1 builds the pipeline every later rule plugs into: configuration, a language-neutral Code Model, a rule interface, findings, and four report formats. Several choices shape the public contract (config file, JSON layout, rule ids) or add dependencies.

## Decisions

1. **Dependencies added** (all MIT, exact-pinned, verified on the registry on 2026-10-31):
   - `zod` 4.6.7 (runtime): one schema is the source of the config type and its error messages; rules use it for their own options. Planned in ARCHITECTURE.
   - `ignore` 7.0.14 (runtime, no dependencies): implements gitignore pattern semantics, which are subtle enough that a home-made matcher would be a bug source. It is what ESLint and Prettier use.
   - `ajv` 8.20.0 and `ajv-draft-04` 1.0.0 (dev only): the official SARIF schema is JSON Schema draft-04; these validate our output against it in tests.
2. **The SARIF schema is not committed.** OASIS publishes it under its IPR policy, not a standard open-source license, so it does not belong in an Apache-2.0 repository. `npm run fetch:sarif-schema` downloads it from the canonical OASIS URL into the git-ignored `test/.cache/`, checked against a pinned SHA-256 (the OASIS and GitHub copies are byte-identical). `npm test` runs it, so the first test run needs network access. JSON Schema `format` keywords (uri, date-time) are not validated.
3. **Config is JSON, `siftcode.config.json`**, looked for in the scanned folder (or `--config`). Unknown keys are errors. Per rule: `enabled`, `severity`, `options`. Ids are validated against the registry, options against the rule's own schema, before any file is read.
4. **Ignore semantics.** Built-in defaults, the root `.gitignore`, and the config `ignore` patterns form one ordered list at the scan root, so a later `!pattern` can re-include something excluded earlier (for example `!bin/`). Nested `.gitignore` files apply below their folder. A file named directly on the command line is always scanned. Only `.gitignore` files inside the scanned folder are read.
5. **Code Model contains named functions and methods only.** Anonymous callbacks and lambdas are measured as part of the code around them. This avoids flagging, for example, a long `describe(() => {...})` block as a "long function".
6. **Rules run only on files that parse without syntax errors.** Findings on half-parsed code would be unreliable; such files are reported as "not checked" in every format (SARIF: tool notifications).
7. **A rule's description lives with the rule** (`RuleMeta`: standards, rationale, suggestion, example) instead of in a separate catalog folder. One file per rule keeps the rule and its explanation from drifting apart. ARCHITECTURE is updated accordingly.
8. **Fingerprints** are `sha256(ruleId, path, key, occurrence)` truncated to 32 hex characters; `key` is chosen by the rule and never contains line numbers. SARIF carries it as `partialFingerprints["siftcodeFingerprint/v1"]`.
9. **Output contracts.** JSON has `schemaVersion: 1`; removing or re-meaning a field bumps it. JSON and SARIF contain no absolute paths or timestamps. SARIF maps `error`→error, `warning`→warning, `info` and `note`→note.
10. **Exit codes:** 0 success, 1 a finding at or above `--fail-on` (or `failOn` in the config; the flag wins), 2 usage or configuration error, 70 unexpected internal error. Without `--fail-on`, findings never fail the run.

## Consequences

- Adding a rule is one file plus one line in `src/rules/index.ts`, with fixtures and tests.
- Rule ids, the JSON layout, the config keys, and exit codes are now public contracts: changing them needs a deliberate decision.
- Contributors need network access for the first `npm test` (schema download). CI has it.
- The ignore semantics are close to Git's, not identical (see decision 4).
