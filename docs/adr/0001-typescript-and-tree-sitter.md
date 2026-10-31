# ADR 0001: TypeScript on Node, with tree-sitter parsing

- Status: proposed (accepted on owner approval of the plan)
- Date: 2026-10-31

## Context

SiftCode must analyze several languages (v1: JavaScript/TypeScript, Python, C#) with one rule engine, run offline via a single command, be easy to install (`npx`), work on Windows/macOS/Linux, and later power an IDE extension. The owner's machine has Node 26, Python 3.11, and .NET 9 installed; Go and Rust are not.

## Options considered

1. **TypeScript on Node + tree-sitter (WASM grammars).** One parser framework for many languages; installs with no native compile when using the WASM build; same language as VS Code extensions and the LSP ecosystem; distribution via npm/`npx`.
2. **Python + tree-sitter or `ast`.** Good for Python analysis, but Python's own `ast` covers only Python; distribution (pipx) is less frictionless for JS/.NET users; weaker fit for a later VS Code extension.
3. **.NET + Roslyn.** Excellent semantic analysis for C#, but only for C#; other languages would need separate parsers anyway.
4. **Rust or Go single binary.** Fast and easy to ship, but neither toolchain is installed, and the learning/maintenance cost is higher for a project that will mostly iterate on rule content.

## Decision

Option 1. TypeScript (`strict`) on a current Node LTS, parsing with `web-tree-sitter` and per-language grammars (JavaScript, TypeScript/TSX, Python, C#). Language adapters convert syntax trees into a shared language-neutral Code Model; rules run on the model, and may use language-specific tree-sitter queries when they need syntax detail.

## Consequences

- Positive: one engine for all languages; adding a language is "write an adapter + fixtures"; no native build step; reusable core for CLI, GitHub Action, and a future LSP.
- Negative: syntax-only analysis. No type resolution, so rules that need types (some SOLID/LSP checks, precise Demeter exemptions, data-flow) are out of v1. Roslyn or the TypeScript compiler API can be added later as optional deeper adapters behind the same Code Model.
- Negative: grammar quality varies by language; mitigated by shared cross-language metric tests (PRD risk R4).
- To verify in Milestone 0 before installing: exact package names and publishers for `web-tree-sitter` and each grammar (look-alike packages are a known risk), grammar license and maintenance status, WASM build availability, and the minimum Node version.
- Reversible at moderate cost: the Code Model and rule layer do not depend on tree-sitter types, so the parser layer can be swapped.
