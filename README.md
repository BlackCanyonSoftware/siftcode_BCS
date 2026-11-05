<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="docs/brand/lockup/banner/lockup-horizontal-dark-banner.png">
    <img alt="SiftCode" width="480"
         src="docs/brand/lockup/banner/lockup-horizontal-light-banner.png">
  </picture>
</p>

SiftCode scans a software project and finds places where it departs from proven standards:
complexity metrics, design principles, security weaknesses, supply-chain hygiene, licensing, and
missing design documentation. For each finding it names the standard behind it and suggests a
concrete improvement. It runs offline, and it parses your code without ever running it.

> **Status: early development (Milestone 4a).** The engine, configuration, and report formats
> (terminal, JSON, Markdown, SARIF) work, with 28 rules for JavaScript/TypeScript, Python, and C#:
> five code metrics, five design heuristics, seven security checks, seven supply-chain checks, and
> four design-documentation checks. More rules arrive in the next milestones; see the
> [roadmap](docs/ROADMAP.md).

## Quick start

Requires Node 24 or newer.

```bash
git clone https://github.com/BlackCanyonSoftware/siftcode_BCS.git
cd siftcode_BCS
npm ci
npm run build
node dist/cli/main.js scan path/to/your/project
```

Example output:

```text
SiftCode scan: /home/you/project
Scanned 12 files
  JavaScript  4
  TypeScript  8

Findings: 1 (0 error, 0 warning, 1 info, 0 note)

src/billing.ts
  src/billing.ts:14  info  SC-MET-001  Function "processOrder" is 72 lines long (limit 50).
      Why: Long functions are harder to read, test, and change, and they usually do several jobs at once.
      Try: Extract cohesive blocks into small, well-named functions so each one does a single job.
      Standard: Refactoring (Fowler): Extract Function (https://refactoring.com/catalog/extractFunction.html)

Skipped: 3 unsupported, 0 too large, 0 symbolic links
```

## Commands

```text
siftcode scan <path> [options]     scan a folder or file
siftcode explain <rule-id>         why a rule exists, the standards behind it, how to fix it

  -f, --format <name>     text (default), json, markdown, or sarif
  -o, --output <file>     write the report to a file instead of printing it
  -c, --config <file>     config file (default: siftcode.config.json in the scanned folder)
      --fail-on <level>   exit 1 if a finding is at least this severe: error, warning, info, note
```

Exit codes: `0` success, `1` a finding at or above `--fail-on`, `2` usage or configuration error.

Upload results to GitHub code scanning with `--format sarif`. `--format json` also includes the
measurements of every file and function: cyclomatic complexity, Halstead measures, Maintainability
Index, lines of code, nesting depth, and parameter count (how they are defined:
[ADR 0005](docs/adr/0005-metric-definitions.md)).

## Rules

Each rule's option goes under `options` in the config file. `siftcode explain <rule-id>` shows the
rationale, the standards behind it, and an example.

| Rule | Finds | Option (default) | Severity |
| --- | --- | --- | --- |
| `SC-DES-001` | A chain reaches through several objects (Law of Demeter) | `maxChain` (3), `includeDataChains` (false) | info |
| `SC-DES-002` | A dependency is fetched from a container (Service Locator) | none | warning |
| `SC-DES-003` | A class has too many methods | `maxMethods` (25) | info |
| `SC-DES-004` | A class holds groups of methods that share no state | `minMethods` (6), `minGroups` (3) | info |
| `SC-DES-005` | A module imports too many other modules | `maxImports` (25) | info |
| `SC-DOC-001` | No design or architecture documentation at all | `minSourceFiles` (20) | warning from 20 source files, otherwise note |
| `SC-DOC-002` | Design documents but no diagram | `minSourceFiles` (20) | info |
| `SC-DOC-003` | Diagrams but no architecture decision records | `minSourceFiles` (20) | note |
| `SC-DOC-004` | A diagram file that no document mentions | none | note |
| `SC-SEC-001` | A credential is written into the code (CWE-798) | `minLength` (8) | warning; error for a known key format |
| `SC-SEC-002` | An SQL statement is built from a variable (CWE-89) | none | warning |
| `SC-SEC-003` | An OS command is built from a variable (CWE-78) | none | warning |
| `SC-SEC-004` | Code is built and run at run time (CWE-95) | none | warning |
| `SC-SEC-005` | A weak hash or cipher is used (CWE-327, CWE-328) | none | warning |
| `SC-SEC-006` | A deserializer that can run code is used (CWE-502) | none | warning |
| `SC-SEC-007` | Certificate verification is switched off (CWE-295) | none | warning |
| `SC-MET-001` | Function or method is too long | `maxLines` (50) | info |
| `SC-MET-002` | Cyclomatic complexity is too high | `maxComplexity` (10) | warning |
| `SC-MET-003` | Too many parameters | `maxParameters` (5) | info |
| `SC-MET-004` | Control structures nested too deeply | `maxDepth` (4) | info |
| `SC-MET-005` | Low Maintainability Index (0 to 100) | `minIndex` (20) | info |
| `SC-SUP-001` | Dependencies with no lockfile | none | warning; info for `pyproject.toml` and NuGet |
| `SC-SUP-002` | A dependency accepts any version (`*`, `latest`, no version) | none | warning |
| `SC-SUP-003` | A dependency comes from a git repository or web address | none | warning; info if pinned to a commit |
| `SC-SUP-004` | No CI configuration | none | info |
| `SC-SUP-005` | Dependencies but no Dependabot or Renovate configuration | none | info |
| `SC-SUP-006` | Dependencies but no SBOM or SBOM generation step | none | note |
| `SC-SUP-007` | No secret scanner configured | none | note |

The security rules (`SC-SEC-*`) look for well-known risky patterns in the syntax; they cannot tell
whether a value comes from an untrusted source, so they report at `warning`, skip test code, and
never print a credential they find (only where it is). SARIF output carries the CWE as the
`external/cwe/...` tag that GitHub code scanning displays. TypeScript declaration files (`.d.ts`)
are skipped.

The supply-chain and documentation rules (`SC-SUP-*`, `SC-DOC-*`) read the project's files instead
of its code: package manifests (`package.json`, `requirements*.txt`, `pyproject.toml`, `Pipfile`,
`*.csproj`), lockfiles, CI configuration, Markdown, and diagram files. The manifest checks
(`SC-SUP-001` to `003`) run on every manifest found; the rest only run when you scan the top of a
Git repository (a folder holding `.git`), because scanning a subfolder cannot tell whether the
project as a whole has CI or documentation. Design documentation is found by file and folder names
and fenced diagram blocks (Mermaid, PlantUML, D2, draw.io, ADRs, C4, OpenAPI, and more); see
[ADR 0008](docs/adr/0008-repository-hygiene.md). `SC-SUP-006` and `SC-SUP-007` cannot see settings
kept on the hosting platform (such as GitHub secret scanning); switch a rule off with
`"SC-SUP-007": { "enabled": false }`.

The design rules (`SC-DES-*`) are heuristics: they read the shape of the code, not its types, so
they skip test code and a few idioms (see [ADR 0006](docs/adr/0006-design-heuristics.md)) and report
at `info` with low confidence. `SC-DES-001` also needs a method call in the chain by default, so the
example `user.getAccount().getSubscription().cancel()` (3 members) is caught with `maxChain: 2`.

## Configuration

Optional `siftcode.config.json` in the scanned folder. Unknown keys are rejected so typos are caught.

```json
{
  "ignore": ["generated/", "*.min.js"],
  "rules": {
    "SC-MET-001": { "severity": "warning", "options": { "maxLines": 80 } }
  },
  "failOn": "warning"
}
```

- `ignore`: gitignore-style patterns, added to the built-in ignores (`node_modules`, `bin`, `obj`,
  `dist`, `build`, ...) and the project's `.gitignore`. A pattern like `!bin/` re-includes a folder.
- `rules`: per rule id, `enabled` (default `true`), `severity`, and rule-specific `options`.
- `failOn`: same as `--fail-on`; the flag wins.

## Scripts

| Command                  | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `npm run build`          | Copies the grammars into `grammars/` and compiles TypeScript to `dist`      |
| `npm run dev`            | Recompiles on change                                                        |
| `npm test`               | Unit tests (downloads the SARIF schema on first run)                        |
| `npm run test:e2e`       | Builds, then runs the built CLI end to end                                  |
| `npm run lint`           | ESLint (strict, type-aware)                                                 |
| `npm run typecheck`      | TypeScript in strict mode, no output                                        |
| `npm run format`         | Prettier, write                                                             |
| `npm run format:check`   | Prettier, check only                                                        |
| `npm run check`          | Format check, lint, type check, and unit tests                              |
| `npm run benchmark`      | Builds, then times a scan of a generated 50,000-line project                |
| `npm run hooks:install`  | Enables the pre-commit hook (run once per clone)                            |

## Project structure

```text
src/
  cli/         commands (scan, explain), argument handling, exit codes
  config/      config file schema and loading
  core/        scan pipeline, findings, severity, errors
  discovery/   finding supported files; .gitignore and ignore patterns
  languages/   language registry, tree-sitter parser, Code Model, function extraction
  reporters/   text, JSON, Markdown, SARIF, and `explain` output
  rules/       one file per rule, plus the registry
scripts/       build helpers, SARIF schema download, benchmark
test/          unit tests, end-to-end tests, fixtures
docs/          product and engineering documentation
```

## Documentation

- [Product requirements](docs/PRD.md) and [roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/adr/)
- [Design](docs/DESIGN.md) (terminal output, HTML report, brand use)
- [Contributing](CONTRIBUTING.md) · [AI assistant guide](AGENTS.md) · [Changelog](CHANGELOG.md)

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Bundled tree-sitter grammars are
MIT-licensed; their licenses ship in `grammars/licenses/`.
