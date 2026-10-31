# AGENTS.md: guide for AI coding assistants

SiftCode is an offline command-line tool that scans a project (JavaScript/TypeScript, Python,
C#) and reports where it departs from proven standards, with a concrete suggestion for each
finding. Rigor tier: **MVP**. Product owner: the repository owner; you are the tech lead.

## Session routine

1. Read `docs/HANDOFF.md` first (current state, next steps, gotchas).
2. Work one roadmap slice at a time (`docs/ROADMAP.md`). Restate its acceptance criteria.
3. At the end: update `docs/HANDOFF.md`, `docs/ROADMAP.md` statuses, and any doc the change
   affects; commit locally; give the report (format below).

## Commands

```bash
npm ci                  # install (scripts disabled, exact versions)
npm run hooks:install   # once per clone: pre-commit runs format:check, lint, typecheck
npm run build           # copy grammars + compile to dist
npm test                # unit tests (test/unit)
npm run test:e2e        # build, then run the built CLI (test/e2e)
npm run lint            # ESLint strict type-checked
npm run typecheck       # tsc --noEmit
npm run format          # Prettier write (format:check to verify)
npm run check           # format:check + lint + typecheck + unit tests
```

Runtime: Node `>=24`. Commands must work on Windows, macOS, and Linux.

## Project map

- `src/cli/` argument parsing, exit codes (0 ok, 1 findings at/above `--fail-on`, 2 usage error)
- `src/core/` scan orchestration, shared types, errors
- `src/discovery/` file walking, ignores, size limits
- `src/languages/` language registry, `grammars.json` (single source for grammar file names),
  tree-sitter parser wrapper
- `src/rules/`, `src/reporters/`, `src/git/`, `src/config/` planned: see `docs/ARCHITECTURE.md`
- `scripts/` build helpers; `grammars/` and `dist/` are generated and git-ignored
- `test/unit`, `test/e2e`, `test/fixtures/<language>/<rule>/{positive,negative}`

Dependency direction: `cli → core → {discovery, languages, rules, git, reporters}`; `languages`
and `reporters` never import `rules`. A folder exposes a small public surface; do not import
another module's internals.

## Conventions

- TypeScript strict; ESM; relative imports end in `.js`. Fix lint warnings; any suppression needs
  a comment saying why.
- Keep it simple (KISS, YAGNI). DRY applies to knowledge, not look-alike code.
- Validate untrusted input once at the boundary; pass typed data inward. Fail fast, never swallow
  errors; user mistakes throw `UsageError`.
- Pure functions for logic; side effects at the edges. No dead code, no commented-out code.
- Tests: Arrange-Act-Assert, behavior through public interfaces, deterministic, no network. Put
  PRD story IDs (`US-012`) in test names. Test first for domain logic and bug fixes.
- Every rule needs: id, category, severity, confidence, standard reference(s), rationale,
  suggestion, and positive and negative fixtures.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`),
  small and focused; do not mix formatting or refactoring with behavior changes.

## Must never be broken

- **Never execute, import, or build the code being scanned.** Parse only. No network access in
  the scan path; no telemetry.
- Never print a detected secret in full; redact it.
- No secrets in code, logs, or git history.
- New dependencies: justify, verify exact package name and publisher, check the license is
  Apache-2.0-compatible (no GPL/AGPL in the shipped package), pin exactly. Ask before adding one.
  Install scripts stay disabled.
- **Commit locally; never push.** The owner reviews and pushes. No history rewriting, no force
  push, no `--no-verify`, no weakening or skipping tests or lint rules to get green.
- Ask before: changing the stack, adding anything with ongoing cost, changing the license or
  security model, or changing a published contract (CLI flags, output formats, rule IDs).
- Brand: load tokens from `docs/brand` / the Brand Logos kit; never retype a brand color, size,
  or font. Do not edit generated brand files by hand.

## Definition of Done

1. Meets the acceptance criteria. 2. Tests at the levels the tier calls for; whole suite passes.
3. Format, lint, type check pass with no new warnings; build succeeds. 4. You ran it (for the CLI,
the built binary; for the HTML report, a browser at 375/768/1280 px, keyboard, no console
errors). 5. Security rules above hold. 6. Affected docs updated (README/AGENTS for commands,
roadmap status, ADR for significant decisions, DESIGN for UI, CHANGELOG for user-visible change).
7. No debug leftovers or untracked TODOs (every TODO has a `docs/ROADMAP.md` entry). 8. Committed
locally as a focused Conventional Commit.

## Report format (end of each session or milestone)

Summary · Done (IDs, key files) · Verification (each check with its actual result; "not
verified" where true; CI is "not verified until pushed") · Try it · Decisions and assumptions
(ADR links) · Deviations · Known issues and tech debt · Next (1 to 3 steps) · Needs you.

More detail: [CONTRIBUTING.md](CONTRIBUTING.md), [docs/PRD.md](docs/PRD.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESIGN.md](docs/DESIGN.md).
