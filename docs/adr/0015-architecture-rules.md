# ADR 0015: Architecture rules: folder cycles and declared layers

- Status: accepted
- Date: 2026-11-18

## Context

The roadmap's "Architecture styles" track asked for layering and dependency-direction rules. Both need the same thing the other rules do not have: who imports whom among the project's own files. The scan already holds every file's imports (ADR 0006); what was missing was resolving an import to a file and grouping files into the units a design is described in.

## Decisions

### Resolving an import to a file (`src/rules/architecture/resolve.ts`)

| Language | An import is a dependency when | Not resolved |
|---|---|---|
| JavaScript, TypeScript | It is relative (`./x`, `../y`) and names a file: the path as written, with `.ts`, `.tsx`, `.js`, ... added, `/index.*`, and `.js` read as `.ts` (TypeScript's ESM style) | Packages, `tsconfig` path aliases, `import()` of a variable |
| Python | It is absolute (`pkg.mod`, tried from the repository root, `src/`, and each folder above the file) or relative (`.`, `..a`); the longest module that exists wins, and the names of a `from` import are tried as submodules | The standard library and installed packages (no project file), `importlib` |
| C# | A `using` names a namespace that some project file declares (the new `namespaces` fact) | A namespace declared in more than one project is left out (below) |

Only imports that land on a file of the project are edges. Not guessing is deliberate: a missing edge hides a cycle, a wrong edge invents one, and the second is what a user stops trusting.

### Components

A cycle between two files is ordinary; a cycle between the parts a design is drawn in is the problem. A component is:

- for C#, the folder under a project (the folder of its `.csproj`), because project references cannot form a cycle (the compiler refuses), so project-level cycles would only ever be mistakes of the namespace matching;
- otherwise, the folder directly under the **component root**: the walk goes down into the folder that holds at least 70% of the code (`src/`, then `src/pip/`, then `src/pip/_internal/`) while only a few files lie beside it (two, or a tenth), and stops where the code divides.

Files that are not inside a component belong to none: those beside the root (`src/index.ts`, a package's `__init__.py`), at the top of a C# project, or outside the root (a docs script). A package and its own modules importing each other (`from pkg import __version__` inside a subpackage) is the universal Python shape, not a design defect, and it was the first thing the real code showed.

### `SC-ARC-001`: folders import each other in a cycle

Reports each group of components that can all reach each other, as the shortest cycle through the group plus the first import behind each step. A tangle of many folders names the first five and counts the rest. Severity `info`, confidence `medium`: the rule is a heuristic over a graph that is built from names, and a cycle between folders is ordinary in some styles (aggregates that refer to each other in a domain model). Standards: Martin's Acyclic Dependencies Principle; Lakos on levelization.

### `SC-ARC-002`: a layer imports a layer it may not depend on

Needs a declaration, because no tool can guess which direction a project means. Each layer has a name, gitignore-style `paths`, and `mayImport`; a file belongs to the first layer that matches, files in no layer are left alone, and a layer may import itself. An unknown layer name in `mayImport`, a repeated name, and a layer with no paths are refused at load time. Severity `warning`, confidence `high`: the project said this is a rule. It reports where the import is written. Standard: Martin's Dependency Rule.

## Evidence

Scanned and every finding read: Express, Flask, pip, httpie, zod, ardalis/CleanArchitecture, dotnet/eShop, GitVersion, and this repository.

| Repository | Cycles | What they are |
|---|---|---|
| express, flask, zod | 0 | |
| GitVersion | 0 | |
| pip | 1 | A tangle of 15 folders under `pip/_internal`. Real: `build_env/installer.py` imports `cli`, and `cli/req_command.py` imports `build_env`. |
| httpie | 1 | `cli`, `output`, and `plugins` (`cli/argparser.py` imports `output`, `output/models.py` imports `cli`). Real. |
| eShop | 1 | `ClientApp/Animations` and `ClientApp/Helpers`. Real. |
| ardalis/CleanArchitecture | 3 | `Domain` imports `Infrastructure.Data` (`Order.cs`, in a template of the architecture that forbids it); two aggregate folders and `Interfaces` refer to each other, which is common in a domain model and is why the rule is `info`. |
| this repository | 1, then 0 | `config`, `core`, `discovery`, and `rules` all imported `core` for four leaf modules (errors, issues, string comparison, severity). They moved to `src/shared/` and the cycle is gone. |

The first version reported 6 cycles and read them: 5 were wrong (this repository's was real), and each fix was a rule about the graph, not about the repository:

- **Files beside the root in a cycle with their own subfolders** (pip: `src/pip` with `src/pip/_internal`; httpie: `httpie` with `httpie/cli`). Such files are now in no component.
- **Files outside the root** (a docs script, the parent package) were given a component made of the wrong folder. They are in none.
- **A C# namespace declared in several projects** (eShop and GitVersion both extend `Microsoft.Extensions.Hosting`, and many GitVersion projects share the root namespace `GitVersion`) drew an edge from every importer to every declarer, and invented cycles between projects that cannot have one. The import is left out when its files are in more than one project.
- **A project's `GlobalUsings.cs`** names namespaces for the whole project; imports from it are not dependencies of any folder.
- **A root that stopped too early** (pip has three entry files beside `_internal`): a tenth of the code may lie beside the dominant folder.

`SC-ARC-002` was run on this repository with a layering written from `AGENTS.md`. It reported 20 imports, all `reporters` importing `core` and `rules` types (`import type`): the documented direction ("languages and reporters never import rules") is not what the code does, which says the document is out of date, not the rule. The test is in `test/unit/architecture-rules.test.ts`; no layering is committed for this repository.

## Consequences

- Two rules, 48 in all. Both are in the registry and need no flag: `SC-ARC-002` reports nothing without `layers`.
- `FileUsage.imports` now holds the full import facts (module, bindings, line) instead of module names, and `FileUsage.namespaces` lists the namespaces a C# file declares. Neither reaches any report.
- Limits, in the roadmap as TD-30: path aliases, dynamic imports, a `using` that is never used counts, type-only imports count, and grouping by folder can show a cycle that is ordinary for a layered-by-type C# project.
