# ADR 0017: Diagram drift rules

- Status: accepted
- Date: 2026-11-18

## Context

SiftCode already reports a project that has no diagrams (`SC-DOC-002`), diagrams nobody links to (`SC-DOC-004`), and documents that name files that are gone (`SC-DOC-006`). The roadmap's next step was the one that makes a diagram checkable: compare what it draws with what the code has, first the boxes, "a component in the diagram has no matching module in the code, and vice versa".

## Decisions

### What is read

Mermaid flowcharts (`graph`, `flowchart`: every node shape, quoted labels, `subgraph` titles), Mermaid C4 (`Container`, `Component`, `System`), and PlantUML components (`[Name]`, `component Name`), from diagram files (`.mmd`, `.puml`, ...) and from fenced diagrams. Sequence, class, state, and entity diagrams, Structurizr, D2, draw.io, and pictures are not read: their boxes are not modules, or they cannot be read as text.

A diagram counts only when it is a claim about this project's structure: a diagram file that is not test code, or a diagram inside a design document (an architecture or design document, the README's design section; the same detection `SC-DOC-001` uses). The first version read every Markdown file and found 700 "missing modules" in Mermaid's own syntax tutorials, 4 in a voice-pipeline walk-through, and 1 in an unrelated sample README: a flowchart in a tutorial draws steps and examples, not modules.

### When a box is a claim

A box says something checkable about the code only when it is written like a module name: `cli: args, exit codes` (the part before the colon), `core/scan`, `Catalog.API`, `repo-files`, `OrderService`, a lowercase word such as `rules`. Free text (`Developer / CI`, `Project files`, `Terminal, Markdown, JSON`), a single capitalized word with no description (`Reviewer`, `Orders`: as likely a person or an idea), URLs, and a short list of words that name what is around a system (`user`, `browser`, `database`, `queue`, `api`, `service`) are not claims.

### `SC-DOC-007`: a diagram names a module the code does not have

A claim is found when the project has, under that name: a folder, a file (with or without its extension, so `policy.py` finds `policy.py`), a C# project or namespace, a class, an imported module, or a dependency in a manifest (`@scope/stripe` is also `stripe`). Names are compared as lowercase letters and digits, and `orders` and `order` are one name. A qualified name that no folder is called but the code writes out (`chrome.storage.local`) is found in the source text; a plain word is not looked for there, because `suggestions` appears in comments whether or not the module exists (the first version of this fallback hid two of this repository's three real findings). One finding per name per diagram, at the line of the box. `info`, confidence `low`: the code may spell a module differently from the picture.

### `SC-DOC-008`: a part of the code is not in the diagrams

Only when the diagrams draw at least three boxes written as module names, so a project that diagrams only its context is not expected to diagram its folders. Components are the ones `SC-ARC-001` uses (ADR 0015); a component with at least `minFiles` (3) source files whose name has no word in any diagram's text is reported, in one finding that names up to eight. `note`, confidence `low`.

## Evidence

Scanned and every finding read, with the first version's false positives fixed one class at a time:

- **This repository** (`docs/ARCHITECTURE.md`): three real findings. The diagram drew a `repo-files` module and a `suggestions` module that do not exist (an earlier design), and not `src/shared`, which a refactor in the same session had just made. The diagram was corrected (`core/repo-view`, `core/finding`, `core/accept`, `shared`) and the rules are silent.
- **Off-Limits Filter** (a project of the owner's): `src/selftest`, with 3 or more files, is in no diagram. Real.
- **DropGoblin, StockTake, Conduit** (the owner's): the first version reported 6 boxes that exist (`sw.js`, `app.js`, `policy.py`, `versions.py`, `pytest_plugin.py`) or that the code writes out (`chrome.storage.local`). Names with a file extension are now looked up without it, every project file counts as a name (not only parsed source), and a qualified name is looked for in the code.
- **Mermaid** (2,431 results at first, 0 after), **openai-agents-python** (5, then 0), **autogen** (1, then 0): tutorials and walk-throughs, now not read.
- **pydantic and langgraph**: nothing, because neither draws its modules in a design document.

I did not find a reputable JavaScript, Python, or C# project outside the owner's with a design document that draws its modules in Mermaid or PlantUML and also has the code next to it, so the evidence for real documents is four projects of the owner's, one of which is this repository. The rules are `info` and `note`, with low confidence, for that reason.

## Consequences

- Two rules, 56 in all. No flag or setting beyond `minFiles`. A project with no diagrams, or with diagrams only in tutorials, sees nothing.
- Boxes are compared with the code; arrows are not (TD-32). A diagram that draws the dependencies backwards is not noticed.
- Parsing is a few regular expressions over the diagram text, not a Mermaid or PlantUML parser, so an unusual form is not read; what is not read is never reported.
