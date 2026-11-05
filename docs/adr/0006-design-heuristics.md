# ADR 0006: Design heuristics (Milestone 3)

- Status: accepted (Milestone 3)
- Date: 2026-11-05

## Context

Milestone 3 adds rules for the Law of Demeter, the Service Locator anti-pattern, and the Single Responsibility Principle. These are judgment calls, not facts, and they have to work from syntax alone (no types) in JavaScript/TypeScript, Python, and C#. Naive versions are noisy: on first contact with real code they flagged every xUnit test class, every barrel file, and a quarter of all classes. The definitions below are the result of measuring against real code, and the evidence is recorded here so the choices can be revisited.

## Decisions

### Facts in the Code Model
Alongside measurements, each cleanly parsed file now carries facts that rules read: **imports** (module and the names it binds), **member chains**, and **classes** (name, kind, line range, method and field counts, cohesion). Imports and chains are only needed while rules run and are dropped from the scan result; classes appear in the JSON report under `metrics.files[].classes`. Rules stay language-neutral.

### Member chains and SC-DES-001 (Law of Demeter)
A chain is an expression that follows members from one object to the next (`a.b.c(d).e[0].f`); calls and indexing in the middle belong to it, and only the member hops are recorded. Only the whole chain is reported, not shorter pieces of it. C# `?.` is followed.
- **Counted hops:** every member hop except the first one after `this`/`self` (the object's own component), calls to idiomatic chaining methods (array, string, promise, LINQ, Entity Framework and similar: a list in the rule file), and size reads (`length`, `size`, `count`).
- **Exempt chains:** rooted at an imported module, namespace, or binding (`os.path.join`, `System.IO.Path.Combine`), or at a call that starts a fluent assertion or query (`expect()`, `assert()`, `$()`, `require()`, `cy`).
- **Needs a method call:** by default a chain is reported only if at least one counted hop is a call. A chain that only reads properties (`node.loc.start.line`) is a weaker case, and on ESLint's AST code it was most of the noise (38 findings, 3 after this rule). `includeDataChains: true` reports them too.
- **Limit:** more than **3** counted hops. The blueprint's example, `user.getAccount().getSubscription().cancel()`, has exactly 3 hops, so catching it needs `maxChain: 2`.

### SC-DES-002 (Service Locator)
A call is a locator call when its method is one that hands out a dependency (`resolve`, `resolveAll`, `getService`, `getRequiredService`, `getInstance`, `getAllInstances`, `getExportedValue`, and their snake_case forms) and something along its receiver path is named like a container (`container`, `locator`, `injector`, `kernel`, `serviceProvider`, `resolver`, `ioc`, `moduleRef`, or a `provider`/`services`). The plain `get` counts only on a clear container. So `path.resolve`, `Promise.resolve`, `cache.get`, and `registry.get` do not match. Skipped: composition roots (files named `Program`, `Startup`, `main`, `app`, `bootstrap`, `composition`, `container`, `di`, `ioc`, `setup`, `module(s)`, `wiring`, `registration(s)`, or inside folders named `composition`, `di`, `ioc`, `container`, `bootstrap`) and functions named like wiring (`main`, `configure*`, `register*`, `bootstrap*`, `compose*`, `setup*`). Default severity `warning`, confidence medium.

### SC-DES-003 to SC-DES-005 (SRP family)
- **Class facts:** `methods` counts methods including static ones, not constructors. `fields` counts declared fields, properties, events, primary-constructor parameters, and, in JavaScript and Python, attributes assigned through `this`/`self`.
- **SC-DES-003:** more than **25** methods. (Python standard library: p95 is 19 methods, 2.8% of classes exceed 25.)
- **SC-DES-004 (cohesion, LCOM4):** methods that use the same member, or where one uses another, are joined; the number of groups is the cohesion figure. Only instance methods that use the class's own state, or are used by one that does, take part. A class is reported when at least **6** methods take part and they form at least **3** groups. Two groups was far too noisy (27% of eligible classes in the Python standard library); three flags 9%.
- **SC-DES-005 (fan-out):** more than **25** distinct imported modules (a module imported twice counts once). Python standard library: 4 of 740 non-test files.

### Code the design rules skip
- **Test code** (a folder named `test`, `tests`, `__tests__`, `spec`, `specs`, `__mocks__`, or a file named `test_*`, `*_test.*`, `*.test.*`, `*.spec.*`, `*Tests.*`). A test class with 78 test methods, a mock chain, and a wide import list are normal there. This removed 239 of 314 "too many methods" findings in the Python standard library.
- **Barrel files** (`index.*`, `__init__.py`) for the fan-out rule: ESLint's `rules/index.js` imports 293 modules because it is a registry.

## Calibration evidence (2026-11-05, default thresholds)

| Code | Non-test files | Classes | SC-DES-001 | SC-DES-002 | SC-DES-003 | SC-DES-004 | SC-DES-005 |
|---|---|---|---|---|---|---|---|
| Python 3.11 standard library | 740 | 2,702 | 0 | 0 | 75 | 43 | 4 |
| ESLint `lib` (JavaScript) | 394 | 65 | 3 | 0 | 1 | 1 | 1 |
| TypeScript-ESLint typescript-estree (compiled) | 88 | 7 | 2 (before the data-chain change) | 0 | 1 | 0 | 0 |
| 26 C# files (generated converters, interfaces) | 24 | 23 | 0 | 0 | 0 | 0 | 0 |

Examples of findings that were read and judged correct: `Decimal` (117 methods), `pydoc` (32 imports), `ESLint CodePathState` (43 methods), `sourceCode.getLastToken().loc.end.line`.

## Limits and honesty
- **No type information.** A chain may be a data structure or a fluent API we do not know; hence confidence `low`, severity `info`, and the exemption lists.
- **SC-DES-002 is unvalidated on real DI code.** It produced no findings on about 2,200 real files (no false positives), but none of that code uses a DI container, so detection is verified on fixtures only.
- **C# has no real application code in the calibration.** Only 26 small files were available locally.
- **tree-sitter-typescript 0.23.2 cannot parse labeled tuple elements** whose label is `object`, `string`, `number`, `readonly`, `keyof`, `infer`, `abstract`, `any`, `unknown`, or `never` (valid TypeScript). Such files are reported as "not checked", not crashed on. SiftCode found this on its own source and avoided it.

## Consequences
- Five rules, all heuristics at `info` except SC-DES-002 (`warning`); none can be more severe than `warning` by default (NFR-6).
- Extracting facts costs about 35% more scan time (benchmark: 2.18 s to 2.99 s for 52k lines; see ARCHITECTURE).
- The thresholds are data from two real corpora; revisit them when more code (especially C#) is available.
