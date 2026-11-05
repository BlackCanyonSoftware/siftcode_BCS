# ADR 0007: Security rules (Milestone 4)

- Status: accepted (Milestone 4)
- Date: 2026-11-05

## Context

PRD US-030 asks for a starter set of CWE-mapped security checks. Like the design rules, they work from syntax alone, so they cannot follow data from an untrusted source to a dangerous use (taint analysis is a later track). The goal is a small set of patterns that are individually well-known, rarely noisy, and each mapped to a named weakness. Security output has an extra requirement: it must never repeat a secret it found.

## Decisions

### Milestone 4 is split
The plan bundled security with supply chain and design-documentation checks. They need different inputs: security reads code facts; supply chain and design documentation read repository files that are not source (manifests, lockfiles, CI configuration, diagrams). M4 is now the security rules (US-030). The repository-level checks (US-031 to US-033) are **M4a**, which first adds a repository-level rule type.

### New facts
Besides imports, chains, and classes, each file now yields:
- **Calls:** every call and object creation with its callee (`os.system`), last name, receiver, and the shape of each argument.
- **Named values:** everywhere a name is given a value: declarations, assignments (`=`, and `+=` in C#, where callbacks are attached), object and dictionary entries, keyword and named arguments, field and property initializers.
- **Long strings:** constant string literals of at least 16 characters.
- A **value** is described only by its kind: a constant string, a *dynamic string* (built from something not constant: `"a" + x`, a template with `${x}`, an f-string, `"a%s" % x`, `.format()`, `string.Format`), a number, boolean, null, a name, an object literal with its entries, or other. For a dynamic string only the fixed parts are kept, which is enough to tell SQL from other text. Tagged templates (`sql` + a template) are not calls: they are the safe way to pass values.
- Concatenation chains are flattened with a loop, and expression nesting is cut off at 40 levels, so hostile input cannot overflow the stack (tested with 3,000-term chains and 3,000 nested parentheses).

### Rules (all `warning`, confidence medium, heuristic; test code is skipped except for known credential formats)
| Rule | CWE | Reports |
|---|---|---|
| SC-SEC-001 | 798 | A string in a known credential format (AWS access key ID, GitHub token, Slack token, Stripe live key, Google API key, private key header; `error`), a password inside a URL, or a secret-looking name given a constant that could be the secret (`warning`) |
| SC-SEC-002 | 89 | An SQL statement passed to `execute`, `query`, `ExecuteReader`, `new SqlCommand(...)`, `CommandText =` and similar, built from a variable, directly or through a variable assigned earlier in the same function |
| SC-SEC-003 | 78 | `exec`/`execSync` (or `spawn` with `shell: true`) from `child_process`, `os.system`/`os.popen`/`subprocess` with `shell=True`, `Process.Start`/`ProcessStartInfo`, given a command built from a variable |
| SC-SEC-004 | 95 | `eval`, `new Function`, `vm.run*`, Python `eval`/`exec`, `CSharpScript.EvaluateAsync` given non-constant code |
| SC-SEC-005 | 327, 328 | MD5/SHA-1 and DES/3DES/RC4/RC2/Blowfish/ECB in `crypto`, `hashlib`, PyCrypto, and .NET (Python's `usedforsecurity=False` is respected) |
| SC-SEC-006 | 502 | `pickle`/`marshal`/`dill`/`jsonpickle` loading, `yaml.load` without a safe loader, .NET `BinaryFormatter` and similar, JSON.NET `TypeNameHandling`, `node-serialize` |
| SC-SEC-007 | 295 | `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, Python `verify=False`, `check_hostname = False`, `CERT_NONE`, unverified SSL contexts, .NET callbacks that accept every certificate |

Each rule cites its CWE entry with a link, the matching OWASP Top 10 (2021) category, and an OWASP Cheat Sheet. SARIF carries the CWE as the tag GitHub code scanning displays (`external/cwe/cwe-798`).

### Credentials are never repeated
Findings name the variable and the kind of credential, never its value. A finding's fingerprint key is the format label or the variable name. Tests build credential-shaped strings at run time and write them to temporary projects, so no such string is committed (which also keeps push protection quiet).

### Judging a secret by its name
A name counts as secret-looking when it contains `password`, `passwd`, `pwd`, `passphrase`, or `secret`, or is an `api key`, `secret key`, `private key`, `access key`, `auth key`, or `client secret`, and does not end in a word that describes a credential rather than being one (`name`, `type`, `url`, `path`, `file`, `header`, ...). `token` is ambiguous (a lexer token versus an authentication token), so it needs a value that looks randomly generated: 16 or more characters mixing letters and digits with at least 3.5 bits of entropy per character. The value must not be a placeholder, contain whitespace, be a URL without a password, or be the name of an environment variable.

### Declaration files are skipped
TypeScript declaration files (`.d.ts`, `.d.cts`, `.d.mts`) only describe types. They are no longer parsed: they added nothing and 93 of 101 "not checked" files in the calibration were declarations.

## Calibration evidence (2026-11-05, final defaults)

| Code | Files | SC-SEC-001 | 002 | 003 | 004 | 005 | 006 | 007 |
|---|---|---|---|---|---|---|---|---|
| Python 3.11 standard library | 1,823 | 0 | 1 | 17 | 52 | 4 | 11 | 2 |
| Third-party JS in this repo's `node_modules` | 1,488 | 0 | 0 | 3 | 12 | 2 | 0 | 0 |
| ESLint `lib` | 389 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| TypeScript-ESLint typescript-estree | 44 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The findings read and judged correct include: `os.system(command)` in `mailcap`, `marshal.loads` on bytecode, MD5/SHA-1 required by the APOP and HTTP digest protocols, an injectable `cursor.execute()` in `sqlite3/dump.py`, `new Function` in ajv (which compiles validators) and `eval` in the Emscripten-built tree-sitter runtime. They are real uses of the pattern; whether they are vulnerabilities is the reviewer's call, which is why the rules report at `warning`.

Changes made because of the calibration: `compile()` is not an evaluation (it builds a code object) and was removed from SC-SEC-004 (77 findings became 52); `token` and `credentials` were too ambiguous (16 false findings: Prettier's lexer variables and a `fetch` option); SC-SEC-003 now requires the receiver to be the `child_process` binding (a regular expression's `.exec()` in the same file matched before); a `require('child_process').exec` member is bound to the name it is assigned to; declaration files are skipped.

## Limits and honesty
- **Syntax only, no taint tracking.** "Built from a variable" means the text is not a constant, not that the variable holds untrusted input. Indirection is followed only through a name assigned earlier in the same function.
- **Credential detection is a short list of formats plus a name heuristic.** It is not a substitute for a dedicated secret scanner, which also checks provider rules and entropy across the whole history.
- **`require('child_process').exec(x)` written inline** (without binding the module) is not detected.
- **No real-world C# calibration** (TD-8): the C# detections are verified on fixtures and 26 small files, not on application code.
- **TypeScript grammar:** tree-sitter-typescript 0.23.2 cannot parse labeled tuple elements named `object`, `string`, `number`, and a few more (TD-9). SiftCode hit it again on its own source while adding these rules.
- Test code is skipped, so a real vulnerability in a test helper is not reported (known credential formats are the exception).

## Consequences
- Seventeen rules, all heuristics; nothing is more severe than `warning` by default except a recognizable credential format (`error`, by the finding rather than the rule).
- A finding can carry its own severity; a severity named in the config file still overrides it.
- Fact extraction costs a little more per file; the benchmark (52k lines) went from 2.99 s to about 2.5 s on this run, which is within run-to-run variation, and stays well inside the 30 s target.
