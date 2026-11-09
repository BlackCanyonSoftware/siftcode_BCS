# ADR 0005: How code metrics are defined (Milestone 2)

- Status: accepted (Milestone 2)
- Date: 2026-11-05

## Context

Cyclomatic complexity, Halstead measures, the Maintainability Index, and "lines of code" are defined loosely in the literature and differ between tools. Milestone 2 has to pick one precise definition, apply it identically to JavaScript/TypeScript, Python, and C#, and document it, so that numbers are reproducible and comparable across languages. All figures come from the syntax tree alone (no type information), and only for files that parse without errors.

## Decisions

### Scope of a measurement
- Metrics are computed per **function or method** (named units only, see ADR 0004) and per **file**.
- A unit's figures describe its **whole subtree: nested functions, callbacks, and lambdas included**, because the reader has to understand them to understand the function. A nested named function is also reported as its own unit. File figures are computed over the whole file, not summed from units.

### Cyclomatic complexity (McCabe)
`1 + decision points`. A decision point is one occurrence of:

| | JavaScript / TypeScript | Python | C# |
|---|---|---|---|
| branches | `if` (an `else if` is another `if`) | `if`, `elif` | `if` (an `else if` is another `if`) |
| loops | `for`, `for...in/of`, `while`, `do` | `for`, `while` | `for`, `foreach`, `while`, `do` |
| cases | each `case` (not `default`) | each `case` except the wildcard `case _` | each `case` label (not `default`); each switch-expression arm except `_ =>` |
| errors | `catch` | each `except` | each `catch` |
| expressions | `?:` | `x if c else y`; comprehension `for` and `if` clauses; `case ... if` guard | `?:` |
| short-circuit | `&&`, `\|\|`, `??`, `&&=`, `\|\|=`, `??=` | `and`, `or` | `&&`, `\|\|`, `??`, `??=` |

Not counted: `else`, `default`, `finally`, `try`, `?.` optional chaining, `with`/`using`, and ordinary operators. Default limit **10**, from McCabe and NIST SP 500-235.

### Nesting depth
The deepest chain of nested control structures inside a unit: `if`, loops, `switch`/`match`, and `try` each add one level. `else if` and `elif` continue a chain and add none. Functions themselves add no level. Default limit **4**.

### Parameter count
Declared parameters, **not counting the receiver**: Python's first `self`/`cls` in a method, TypeScript's `this: T`, and the `this` of a C# extension method. Counted: defaults, rest/`*args`/`**kwargs`/`params`, destructured parameters (one each), `ref`/`out`/`in`. Not counted: Python's `/` and `*` separators. Default limit **5**.

### Lines of code
`codeLines` is the number of physical lines that contain at least one token other than a comment. Blank and comment-only lines are excluded; a multi-line string counts every line it spans; a line holding only `}` counts. (Function length, rule SC-MET-001, is a different thing: physical lines from the first to the last line of the function, default limit 50.)

### Halstead
Computed from tokens, with one definition for all languages:
- **Operands:** identifiers and literals (any named leaf in the syntax tree), and each string, regular expression, or character as **one** operand however it is built inside.
- **Operators:** keywords and operator symbols (any anonymous token).
- **Ignored:** comments and the separators `( ) { } [ ] , ; :`.
- n1/n2 are distinct operators/operands, N1/N2 are total uses. Vocabulary `n = n1 + n2`, length `N = N1 + N2`, volume `V = N log2 n`, difficulty `D = (n1/2)(N2/n2)`, effort `E = D V`. Reported rounded to two decimals.

Absolute values are specific to this definition and are not comparable with other tools; they are comparable across the three languages and across runs.

### Maintainability Index
Visual Studio's 0 to 100 form of the Oman and Hagemeister index: `max(0, (171 - 5.2 ln V - 0.23 G - 16.2 ln LOC) * 100 / 171)`, capped at 100, using unrounded V, cyclomatic complexity G, and `codeLines` as LOC. Code with no tokens scores 100. Microsoft's bands: 20 and above good, 10 to 19 moderate, below 10 low. Default rule threshold: **below 20**, on functions and methods.

### Rules shipped
`SC-MET-001` function length, `SC-MET-002` cyclomatic complexity (default severity `warning`, high confidence; the others are heuristics at `info`), `SC-MET-003` parameter count, `SC-MET-004` nesting depth, `SC-MET-005` maintainability index of a function, `SC-MET-006` file length (added after the milestone; see below). Every limit is a rule option. All measures, for every file and function, are also in the JSON report under `metrics`.

### File length, not a file-level maintainability index (`SC-MET-006`)
A file-level rule on the index was built and removed. Tested on real code, the index at file level is almost entirely a function of file length: median 15 for files of 300 to 600 lines, 3 for 600 to 1,000, and 0 (clamped) beyond that. At Microsoft's threshold of 20 it flagged 38% of the Python standard library's files (693 of 1,823) and 21% of ESLint's, and below 10 still 24% and 8%, so it cannot separate "long" from "bad". The file-level figure stays in the JSON report. The owner asked for the plain file-size rule that this points to, and it is now `SC-MET-006` (the id was free: the index rule never shipped).

**Definition.** Physical lines of the file (the same figure as `lines` in the JSON report; ESLint `max-lines` and Pylint `too-many-lines` count the same way). Default limit **500**, severity `info`, confidence medium. Test code, vendored folders, and generated files are left out: a C# `.g.cs`, `.generated.`, or `.Designer.cs` file, protobuf output (`_pb2.py`), minified bundles, and `migrations` folders. The message adds how many functions and methods the file holds, so the reader can tell a file of one big table from a file doing several jobs.

**Why 500.** Martin (Clean Code, chapter 5) gives about 200 lines as typical and 500 as an upper bound; ESLint defaults to 300, SonarQube to 750, and Pylint to 1,000. On 1,931 non-test source files from 20 corpora (19 local repositories plus ESLint `lib` and FluentValidation, most of them small tools), the median file is 126 lines and the 90th and 95th percentiles are 436 and 601:

| Limit | Files over it |
|---|---|
| 300 | 355 (18.4%) |
| 400 | 221 (11.4%) |
| **500** | **144 (7.5%)** |
| 600 | 99 (5.1%) |
| 750 | 58 (3.0%) |
| 1,000 | 35 (1.8%) |

At 500 the rule points at about one file in thirteen, where the index flagged a third of the Python standard library. The longest files include data tables (a 10,417-line public-suffix list) that the generated-file exclusions cannot recognize; the suggestion says to exclude such a file in the config.

## Calibration evidence (2026-11-05, default thresholds)
| Code scanned | Files | Functions | SC-MET-001 | SC-MET-002 | SC-MET-003 | SC-MET-004 | SC-MET-005 |
|---|---|---|---|---|---|---|---|
| Python 3.11 standard library (no site-packages) | 1,823 | 59,225 | 1,479 | 1,030 | 471 | 184 | 18 |
| ESLint `lib` (JavaScript) | 394 | 3,518 | 487 | 435 | 12 | 29 | 40 |

All files parsed except three intentionally invalid test files in CPython (`badsyntax_*`), which were reported as not checked. Extremes are plausible: `re/_parser.py::_parse` has complexity 122, ESLint's `no-extra-parens` `create` has 296.

## Consequences
- Cross-language figures are consistent (the same program gives complexity 11, nesting 2, and 2 parameters in JavaScript, TypeScript, Python, and C#; enforced by shared fixtures).
- The walk that measures code is iterative, so deeply nested or machine-generated code cannot overflow the stack (tested at 4,000 nesting levels).
- Measuring costs about three times the M1 scan time (see ARCHITECTURE for numbers).
- Syntax-only limits: no type information, so for example operator overloading and implicit conversions are invisible, and C# pattern combinators (`and`/`or` in patterns) and `when` filters are not counted as decisions. These are conservative omissions.
