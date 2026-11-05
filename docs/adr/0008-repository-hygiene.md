# ADR 0008: Repository hygiene: supply chain and design documentation (Milestone 4a)

- Status: accepted (Milestone 4a)
- Date: 2026-11-05

## Context

PRD US-031 to US-033 ask for checks that look at the project, not at one source file: whether dependencies are locked and pinned, whether CI, dependency updates, an SBOM, and secret scanning are in place, and whether the design is documented. Their input is the set of files in the repository (manifests, lockfiles, CI configuration, Markdown, diagrams). All of it is read, never run, and nothing leaves the machine.

## Decisions

### A repository-level rule type
- `Discovery` now keeps every non-ignored file path (`allFiles`), whether the scan root is a folder, and whether it is the top of a Git repository (it holds `.git`).
- `defineRepoRule` declares a rule whose `check(repo, options)` receives a `RepoView`: `files`, `sourceFileCount`, `isRepositoryRoot`, `has(path)`, and `read(path)` (a file's text, capped at 1 MiB, read at most once). Its hits name the file they are about (`RepoHit.path`). The scan runs repository rules once, after the files, only when the scan root is a folder.
- A repository rule has no per-file check; a file rule has no repository check. Both kinds share metadata, options, severity overrides, fingerprints, and every report format.

### Where each check applies
- **Manifest checks** (lockfile, floating versions, remote dependencies) run on every manifest found anywhere under the scan root, so a monorepo is checked package by package.
- **Whole-project checks** (CI, dependency updates, SBOM, secret scanning, design documentation) only run when the scan root is the top of a Git repository and has source code. Scanning a subfolder would otherwise report that "the project" has no CI because the CI configuration lives one level up. A folder that is not a Git repository gets no whole-project findings; that is deliberate, not a gap to silently fill.

### Manifests are read without new dependencies
`package.json` (JSON), `requirements*.txt` (line by line), `pyproject.toml` and `Pipfile` (a small line reader for the dependency arrays and tables, not a TOML parser), and `*.csproj` (`PackageReference` elements). Each dependency is classified as pinned, ranged, floating, git, URL, or local. Reading `pyproject.toml` this way covers PEP 621 `dependencies`, optional dependencies, dependency groups, and Poetry and Pipenv tables; other TOML is ignored. Unknown or unparseable content yields no dependencies, never an error.

### Rules
| Rule | Reports | Default severity |
|---|---|---|
| SC-SUP-001 | Manifest with dependencies and no lockfile in its folder or above it (npm: package-lock, yarn, pnpm, bun; Python: poetry, uv, pdm, Pipfile.lock, or a fully pinned requirements file; NuGet: `packages.lock.json`) | warning; `info` for `pyproject.toml` (libraries often leave locking to the consumer) and for NuGet, where lock files are opt-in and the whole solution is one finding |
| SC-SUP-002 | Dependency that accepts any version: npm `*`, `latest`, `x`, empty, a dist-tag; Python with no specifier or `*`; NuGet `1.*` or an open-ended range | warning |
| SC-SUP-003 | Dependency fetched from a git repository or a web address | warning; `info` when pinned to a full commit or checksum |
| SC-SUP-004 | No CI configuration (GitHub Actions, GitLab, Azure Pipelines, CircleCI, Jenkins, Travis, Bitbucket, Drone, AppVeyor, Buildkite, Cloud Build, Woodpecker, Cirrus, CodeBuild) | info |
| SC-SUP-005 | Dependencies but no Dependabot or Renovate configuration | info |
| SC-SUP-006 | Dependencies but no SBOM file and no CycloneDX, SPDX, Syft, or SBOM step in CI, hooks, `package.json`, or task runners | note |
| SC-SUP-007 | No secret scanner (gitleaks, detect-secrets, trufflehog, talisman) in files, hooks, or CI | note |
| SC-DOC-001 | No design documentation of any kind | warning from 20 source files (`minSourceFiles`), otherwise note |
| SC-DOC-002 | Written design documents but no diagram of any kind | info |
| SC-DOC-003 | Diagrams but no decision records | note |
| SC-DOC-004 | Diagram source file that no document mentions | note |

Standards: OpenSSF Scorecard (Pinned-Dependencies, CI-Tests, Dependency-Update-Tool), NIST SSDF (PO.3, PS.3), SLSA, OWASP Top 10 (A06, A08), CWE-494, CWE-829, CWE-798, CycloneDX, SPDX, C4, UML (ISO/IEC 19505), ISO/IEC/IEEE 42010, arc42, and Architecture Decision Records. The note-level checks (SC-SUP-006, SC-SUP-007, SC-DOC-003, SC-DOC-004) are hints at low confidence: the first two cannot see platform settings such as GitHub secret scanning.

### What counts as design documentation
By file and folder name only, plus fenced diagram blocks:
- **Written documents:** a text or office file named architecture, design, system design, arc42, C4, HLD, LLD, and similar (UI "design system", "design tokens", and "design guidelines" files are not counted), a Markdown file under `architecture/`, `design/`, `arc42/`, `c4/`, or `rfcs/`, or a README section headed Architecture or Design.
- **Decision records:** files under `adr/`, `adrs/`, `decisions/`, or `architecture-decisions/`, or named `adr-NNN`.
- **Diagram sources:** Mermaid, PlantUML, D2, DBML, Graphviz, and Structurizr `workspace.dsl`, plus editor and interchange files: draw.io, Excalidraw, Visio, XMI/UML, ArchiMate, StarUML, OmniGraffle.
- **Diagram images:** an image under a `diagrams/`, `architecture/`, `design/`, `uml/`, `c4/`, `arc42/`, or `adr/` folder, or named like a diagram.
- **Embedded diagrams:** fenced `mermaid`, `plantuml`, `d2`, `graphviz`, `dot`, and similar blocks in Markdown, plus reStructuredText and AsciiDoc directives.
- **API descriptions:** OpenAPI, Swagger, and AsyncAPI files count as a design artifact.
- Vendored folders (`vendor`, `third_party`, `external`, `site-packages`) are not searched. At most 300 prose files are opened.

Whether a document is any good, or matches the code, is not judged (PRD out-of-scope; freshness is M5).

## Evidence

The rules ran on 19 repositories in the owner's Documents folder (10 to 586 files each: JavaScript, Python, mixed).
- **Real, actionable findings:** 6 floating Python requirements and 2 URL or git requirements in two repositories; requirements files with unpinned versions and no lock in six; five repositories with an `ARCHITECTURE.md` and no diagram; six with no design documentation; one with a DBML schema but no decision records.
- **Noisy on purpose, kept at note or info:** SC-SUP-007 (18 of 19), SC-SUP-006 (15), SC-SUP-005 (12). Most small projects lack these; they cost one line each and are easy to switch off.
- **Duplicates from tool folders:** one repository holds agent working copies under `.claude/worktrees/`, which tripled its manifest findings. Not special-cased; a project can ignore the folder in its config.
- **This repository (dogfood):** SC-SUP-006 was true (no SBOM step), so `npm run sbom` (npm's built-in CycloneDX generator) was added. SC-SUP-007 is switched off in `siftcode.config.json` because GitHub push protection, which SiftCode cannot see, is enabled for this repository.

## Consequences

- Adding a repository rule is a file with `defineRepoRule` plus a line in the registry; the engine, reports, fingerprints, and config work unchanged.
- No new runtime dependency. The hand-written TOML reading is narrow by design; a project with an unusual `pyproject.toml` layout may show fewer dependencies than it has, never wrong ones. If this proves too weak, a TOML parser is the first thing to add (TD-14).
- Heuristic detection by name will miss design documents with unusual names, and will count a "DESIGN.md" about the user interface. Both are accepted; the checks only say "no design documentation" when nothing matches at all.
- Findings from repository rules use the rule's severity unless a hit sets its own; a severity in the config file overrides both, as for every rule.
