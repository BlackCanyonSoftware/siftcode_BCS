# ADR 0003: Toolchain versions and install policy

- Status: accepted with the plan (Milestone 0)
- Date: 2026-10-31

## Context

ADR 0001 chose TypeScript, Node, and tree-sitter. Milestone 0 had to verify the actual packages (names, publishers, licenses, versions) and decide how they are installed and shipped. Findings on 2026-10-31:

- Node 24 (Krypton) and Node 26 (Lithium) are both LTS.
- The tree-sitter runtime (`web-tree-sitter`) and the JavaScript, TypeScript/TSX, Python, and C# grammar packages are published by the tree-sitter maintainers, MIT-licensed, and each ships a prebuilt `.wasm`. The grammar packages also carry 7 to 68 MB of C sources and native-build install scripts.
- `typescript-eslint` supports TypeScript below 6.1; TypeScript 7.x is current but out of range.
- A third-party bundle of grammars (`tree-sitter-wasms`, single individual maintainer) and a Microsoft bundle (`@vscode/tree-sitter-wasm`, built for VS Code's internal use) exist.

## Decision

1. **Runtime:** Node `>=24` (`engines`, `.nvmrc` = 24). CI tests Node 24 and 26 on Linux and Windows.
2. **TypeScript 6.0.x**, exact-pinned, until `typescript-eslint` supports 7.
3. **Only `web-tree-sitter` is a runtime dependency.** The official grammar packages are devDependencies; `npm run build:grammars` copies just the `.wasm` files and licenses into `grammars/`, which ships in the package with a `manifest.json` recording each grammar's version and license. Third-party grammar bundles are not used.
4. **Install scripts are off** (`ignore-scripts=true` in `.npmrc`) and **versions are exact** (`save-exact=true`), with the lockfile committed. This keeps native compilers out of the picture and matches the supply-chain stance SiftCode will recommend to others (NIST SSDF). Consequence: npm `pre`/`post` hooks do not run, so scripts call their prerequisites explicitly (for example `npm test` runs `build:grammars` first).
5. **Standard library over dependencies:** CLI parsing uses `node:util` `parseArgs`; the build is plain `tsc` (no bundler); pre-commit hooks are a small script under `.githooks/` instead of husky plus lint-staged.
6. **Config validation (Zod) is deferred to Milestone 1**, when there is a config file to validate.

## Consequences

- A fresh `npm ci` is deterministic and does not compile anything; the package that ships is small (grammars are compiled `.wasm` only).
- Contributors run `npm run hooks:install` once to enable the pre-commit hook.
- Upgrading a grammar is a devDependency bump plus a check that `web-tree-sitter` still loads it (the parser unit tests cover this).
- Dependabot opens weekly update PRs for npm and GitHub Actions; GitHub Actions are pinned by commit SHA.
