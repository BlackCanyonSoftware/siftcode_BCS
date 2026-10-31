<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="docs/brand/lockup/banner/lockup-horizontal-dark-banner.png">
    <img alt="SiftCode" width="480"
         src="docs/brand/lockup/banner/lockup-horizontal-light-banner.png">
  </picture>
</p>

SiftCode scans a software project and finds places where it departs from proven standards:
complexity metrics, design principles, security weaknesses, supply-chain hygiene, and missing
design documentation. For each finding it names the standard behind it and suggests a concrete
improvement. It runs offline, and it parses your code without ever running it.

> **Status: early development (Milestone 0).** Today the CLI can only walk a project, parse
> JavaScript/TypeScript, Python, and C# files, and summarize what it found. Findings and
> suggestions arrive in the next milestones; see the [roadmap](docs/ROADMAP.md).

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
Scanned 5 files
  C#          1
  JavaScript  1
  Python      1
  TypeScript  2
Skipped: 1 unsupported, 0 too large, 0 symbolic links
```

Exit codes: `0` success, `2` usage error (bad arguments, path not found).

## Scripts

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run build`        | Copies the grammars into `grammars/` and compiles TypeScript to `dist` |
| `npm run dev`          | Recompiles on change                                                   |
| `npm test`             | Unit tests                                                             |
| `npm run test:e2e`     | Builds, then runs the built CLI end to end                             |
| `npm run lint`         | ESLint (strict, type-aware)                                            |
| `npm run typecheck`    | TypeScript in strict mode, no output                                   |
| `npm run format`       | Prettier, write                                                        |
| `npm run format:check` | Prettier, check only                                                   |
| `npm run check`        | Format check, lint, type check, and unit tests                         |
| `npm run hooks:install`| Enables the pre-commit hook (run once per clone)                       |

## Project structure

```text
src/
  cli/         argument handling and exit codes
  core/        scan orchestration and shared types
  discovery/   finding supported files
  languages/   language registry and the tree-sitter parser
scripts/       build helpers (grammar copy)
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
