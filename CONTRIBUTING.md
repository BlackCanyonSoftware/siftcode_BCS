# Contributing to SiftCode

Thanks for helping. This file makes the project's standards concrete. Product background lives in
[docs/PRD.md](docs/PRD.md); design decisions in [docs/adr/](docs/adr/).

## Setup

Requires Node 24 or newer (`.nvmrc` pins 24).

```bash
git clone https://github.com/BlackCanyonSoftware/siftcode_BCS.git
cd siftcode_BCS
npm ci
npm run hooks:install   # enables the pre-commit check
npm run build
npm test
```

`npm ci` runs no install scripts and installs exact locked versions. The tree-sitter grammar
packages are dev-only; `npm run build:grammars` copies their compiled `.wasm` files into
`grammars/` (generated, git-ignored). See [ADR 0003](docs/adr/0003-toolchain-and-install-policy.md).

## Workflow

1. Pick an item from [docs/ROADMAP.md](docs/ROADMAP.md); read its story IDs in the PRD.
2. Build the smallest version that works end to end, with tests (test first for logic and bug
   fixes). Keep the app working after every commit.
3. Review your own diff the way a demanding reviewer would: naming, duplication, dead code,
   security, scope.
4. Update affected docs in the same commit.

## Branches and commits

- Work on a short-lived branch and open a pull request; keep `main` working.
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`. Explain why, not what. Keep commits under about 400 changed
  lines (excluding generated files). Do not mix formatting or refactoring with behavior changes.

## Code conventions

- TypeScript `strict`, ESM, relative imports end in `.js`. Prettier decides formatting.
- One responsibility per module; organize by feature; expose a small public surface through
  `index.ts`; do not reach into another module's internals.
- Validate input once at the boundary; make invalid states unrepresentable; handle errors
  explicitly with specific error types; never swallow errors.
- Comments explain why, not what. Name things with the PRD glossary's terms.
- Adding a dependency needs a reason (maintenance, size, license) and a verified package name.

## Writing a rule (from Milestone 1)

A rule is a small module plus a catalog entry with: id (`SC-<AREA>-NNN`), category, default
severity and confidence, standard reference(s) (CWE, SOLID, ...), rationale, suggestion, and an
optional before/after snippet. Add fixtures under
`test/fixtures/<language>/<rule>/{positive,negative}` and tests that cover both. Heuristic rules
must say so and default to `warning` or lower.

## Testing

- Unit tests in `test/unit` (fast, deterministic, no network); end-to-end tests in `test/e2e`
  run the built CLI.
- Test behavior through public interfaces; Arrange-Act-Assert; names state the expected behavior;
  put story IDs in test names.
- Mock only at system boundaries. Coverage is a signal, not a target.

## Quality gates

| Where                | What runs                                                                         |
| -------------------- | --------------------------------------------------------------------------------- |
| Pre-commit hook      | `format:check`, `lint`, `typecheck`                                               |
| CI (every push, PR)  | install, format check, lint, typecheck, unit tests, build + end-to-end, prod audit |
| CI matrix            | Node 24 and 26 on Ubuntu and Windows                                              |

Never bypass a hook or silence a check to get green; fix the cause or explain in the PR.

## Definition of Done

See [AGENTS.md](AGENTS.md#definition-of-done): acceptance criteria met, tests and gates pass, you
ran it, security rules hold, docs and changelog updated, no leftovers, focused commit.

## Security

SiftCode reads code it does not trust. It must never execute, import, or build scanned code, and
it must not use the network during a scan. Report vulnerabilities privately to the maintainers
rather than in a public issue.

## License

By contributing you agree your contribution is licensed under Apache-2.0 (see [LICENSE](LICENSE)).
