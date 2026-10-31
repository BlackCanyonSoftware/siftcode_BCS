# SiftCode: Architecture

Status: plan, nothing built yet. Decisions: see [ADR 0001](adr/0001-typescript-and-tree-sitter.md). Requirements: see [PRD](PRD.md).

## 1. Stack and rationale

| Concern | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript (`strict`) on Node LTS | ADR 0001 |
| Parsing | `web-tree-sitter` + WASM grammars (JS, TS/TSX, Python, C#) | One framework for many languages, no native compile |
| Config validation | Zod | Schema is the single source for the config type and its error messages (names to be verified in M0) |
| CLI parsing | A small, well-maintained library, or `node:util` `parseArgs` | Prefer the standard library; decide in M0 |
| Tests | Vitest | Fast, TypeScript-native |
| Lint / format | ESLint + Prettier, `tsc --noEmit` | Kickoff standard |
| Build | `tsup` or `esbuild` to ESM + type declarations | Small, boring |
| CI | GitHub Actions | Repo is on GitHub |

All package names and versions are verified against the registry and official docs in Milestone 0 before being added.

## 2. Context

```mermaid
flowchart LR
    Dev[Developer / CI] -->|siftcode scan| Tool[SiftCode CLI]
    Tool -->|reads source files| FS[(Project files)]
    Tool -->|reads history, read-only| Git[(Git repository)]
    Tool -->|writes| Out[Terminal, Markdown, JSON, SARIF, HTML]
    Out --> GH[GitHub code scanning]
    Out --> Human[Reviewer]
```

No network access during a scan. No code execution of the scanned project.

## 3. Containers and the scan pipeline

```mermaid
flowchart TD
    CLI[cli: args, exit codes] --> Cfg[config: load + validate]
    CLI --> Scan[core/scan: orchestrator]
    Cfg --> Scan
    Scan --> Disc[discovery: walk, ignore, size limits]
    Disc --> Lang[languages: adapters per language]
    Lang -->|Code Model| Rules[rules: metrics, design, security, supply-chain]
    Git[git: churn reader] --> Rules
    Repo[repo-files: lockfiles, CI, manifests] --> Rules
    Rules -->|Findings| Sugg[suggestions: catalog lookup + enrichment]
    Sugg --> Rank[ranking + baseline filter]
    Rank --> Rep[reporters: terminal, md, json, sarif, html]
```

Key idea: **languages produce a Code Model, rules consume a Code Model.** A rule written once against the model works for every language that has an adapter. Rules that need raw syntax (e.g., a security sink pattern) are declared per language and use that language's tree-sitter queries.

## 4. Folder structure and module boundaries

Organized by feature, not file type. Each folder exposes a small public surface through its `index.ts`; nothing imports another module's internals.

```
src/
  cli/              argument parsing, exit codes, calls core/scan
  config/           schema, loading, defaults
  core/             scan orchestrator, finding model, severity/confidence types
  discovery/        file walking, ignore handling, limits
  languages/
    typescript/     adapter (covers JS/JSX/TS/TSX)
    python/         adapter
    csharp/         adapter
    model/          Code Model types (language-neutral)
  rules/
    metrics/        cyclomatic, halstead, maintainability
    design/         demeter, service-locator, srp
    security/       CWE pattern rules
    supply-chain/   lockfile, pinning, SBOM, CI signals
    readiness/      testing-readiness hints
    catalog/        rule metadata + suggestion text (one file per rule)
  git/              read-only history access (churn)
  reporters/        terminal, markdown, json, sarif, html (+ html/ assets)
  index.ts          public library API
test/
  fixtures/<language>/<rule>/{positive,negative}/...
```

Dependency direction (enforced by lint and by SiftCode's own rules): `cli → core → {discovery, languages, rules, git, reporters}`; `rules → languages/model` (types only); `languages` and `reporters` never import `rules`.

## 5. Data model

```mermaid
erDiagram
    SCAN_RESULT ||--o{ FILE_RESULT : contains
    SCAN_RESULT ||--o{ FINDING : reports
    FILE_RESULT ||--o{ UNIT : has
    FILE_RESULT ||--o{ FINDING : located_in
    UNIT ||--o{ METRIC : measured_by
    FINDING }o--|| RULE : produced_by
    RULE ||--o{ STANDARD_REF : cites
    RULE ||--|| SUGGESTION : recommends

    FINDING {
        string ruleId
        string severity
        string confidence
        string path
        int startLine
        int endLine
        string message
        string fingerprint
    }
    RULE {
        string id
        string category
        string defaultSeverity
        bool heuristic
    }
    STANDARD_REF {
        string standard
        string id
        string url
    }
    SUGGESTION {
        string rationale
        string recommendation
        string before
        string after
    }
    UNIT {
        string kind
        string name
        int startLine
        int endLine
    }
    METRIC {
        string name
        float value
    }
```

`fingerprint` is a hash of rule ID, file path, and a normalized code snippet (not line numbers) so baselines survive code moving around.

## 6. Critical flow: `siftcode scan`

```mermaid
sequenceDiagram
    participant U as User / CI
    participant C as cli
    participant S as core/scan
    participant D as discovery
    participant L as language adapter
    participant R as rules
    participant P as reporters
    U->>C: siftcode scan ./repo --format sarif
    C->>C: load + validate config (exit 2 if invalid)
    C->>S: scan(options)
    S->>D: list files (ignore, size limits)
    loop each supported file
        S->>L: parse(file)
        alt parse ok
            L-->>S: Code Model
            S->>R: run file-level rules
        else parse error
            L-->>S: ParseFailure (reported, scan continues)
        end
    end
    S->>R: run repo-level rules (git, manifests)
    R-->>S: Findings
    S->>S: attach suggestions, rank, apply baseline
    S->>P: render(result)
    P-->>U: output + exit code (0, 1, or 2)
```

## 7. Cross-cutting concerns

- **Errors:** specific error classes (`ConfigError`, `ParseFailure`, `UsageError`). A file that cannot be parsed never aborts the scan. Usage and config errors exit 2 with a message that says what is wrong and how to fix it. Stack traces appear only with `--debug`.
- **Logging:** human progress and diagnostics go to stderr; results go to stdout or `--output <file>`, so piping works. Levels: error, warn, info, debug. `NO_COLOR` respected.
- **Configuration:** `siftcode.config.json` validated by a schema; CLI flags override the file; defaults live in one module.
- **Determinism:** findings sorted by path, line, rule ID; no timestamps in finding data (the report header may carry one, excluded from SARIF/JSON comparison tests).
- **Security model (the tool analyzes untrusted code):**
  - never execute, import, or build scanned code;
  - cap file size and parse time per file; skip binary files;
  - do not follow symlinks outside the scan root; normalize paths;
  - no network access in the scan path; no telemetry;
  - HTML report escapes all code-derived text and ships no remote scripts or fonts;
  - rule regexes are reviewed for catastrophic backtracking, and run on bounded input;
  - code snippets in reports are redacted for matched secrets (never print a found secret in full).
- **Performance:** files processed one at a time or in bounded batches; syntax trees freed after the Code Model is built; worker threads considered when the M1 benchmark requires it.
- **Extensibility:** a rule is a plain object (`id`, `category`, `run(model) → findings`) plus a catalog entry (standards, rationale, suggestion). New rules and new languages are added without editing the orchestrator.
- **Self-checking:** CI runs SiftCode on its own source (PRD US-072).
