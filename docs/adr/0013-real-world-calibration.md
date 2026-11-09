# ADR 0013: Calibration on real C# and Python projects (2026-11-08)

- Status: accepted
- Date: 2026-11-08

## Context

The design, security, and documentation rules had been reviewed on this project's own code, on the Python standard library and ESLint, and on 26 small C# files (TD-8, TD-19). Two gaps were open: no C# project with SQL, process, or deserialization code, and no old repository with design documents to test the freshness rule. The owner asked for trustworthy GitHub repositories to fill both.

## The corpus

Cloned with full history into a scratch folder (read-only use; nothing from them is run). Chosen for reputation, a license that allows reading, and size; none is modified.

| Repository | Why | Size, history |
|---|---|---|
| OWASP/WebGoat.NET | OWASP's deliberately insecure .NET app: does the security rule find real SQL, crypto, and deserialization problems? | 150 C# files, 2011 to 2013 |
| Tyrrrz/CliWrap (MIT) | Starts processes; modern C# with conditional compilation | 66 C# files, 762 commits |
| ardalis/CleanArchitecture (MIT), kgrzybek/modular-monolith-with-ddd (MIT) | Modern layered C# with a DI container, fluent configuration, and decision records | 364 and 1,056 C# files |
| pallets/flask (BSD-3-Clause), pallets/click (BSD-3-Clause) | Python with a `docs/design` document | 83 and 91 files, 5,566 and 3,407 commits |
| pypa/pip (MIT) | Architecture documents untouched for up to six years over heavily changed code | 695 files, 16,501 commits |

A first search of GitHub code search for `ARCHITECTURE.md` returned only small auto-generated repositories and was not used. The earlier FluentValidation and school-assignment reviews (ROADMAP TD-8) stand.

## What was found, and what was done

Every item below was a false positive, a false negative, or a file that could not be read, found by reading the findings against the code; each has a test and its own commit.

| Finding | Evidence | Change |
|---|---|---|
| `SC-DES-001` reports fluent builder chains (EF Core, Autofac, Quartz, FluentValidation, ASP.NET host builders) | The repeated patterns on CleanArchitecture (64 findings) and modular-monolith (83) were all fluent configuration: `builder.Property().IsRequired()...`, `RegisterType().As()...`, `TriggerBuilder.Create()...Build()` | A chain is fluent configuration, and left alone, when it is a statement of calls (after at most one leading property) whose value is thrown away, when it ends in `Build()`, or when it starts from a `*Builder`. Needs a new fact: `MemberChain.discarded`. 60 of 64 and 81 of 83 disappeared. A chain that uses its value or reaches through properties is still reported |
| `SC-DES-002` reports `GetRequiredService()` in startup, seeding, and registration code | 12 on CleanArchitecture, 1 on modular-monolith | Files named like `*Startup`, `*Config`, `*Configuration`, `*ServiceExtensions`, `*Module`; functions named `Seed*`, `Migrate*`, `Initialize*`, `Add*Services` are composition roots. A plain `AddItem` in business code is still checked |
| `SC-DES-002` takes `resolver` for a container | pip's dependency resolver, 8 findings | `resolver` is no longer a container name |
| `SC-DES-002` judged `get` by any part of the receiver path | `this.container.children.get(i)` in a bundled jQuery plugin | `get` counts only when the object it is called on is named like a container |
| Vendored code is scanned by the metric and design rules | pip's `_vendor` is 116,688 lines against 36,686 of its own, and gave 204 of 372 function-length findings | `_vendor`, `_vendored`, `externals` count as vendored; metric and design rules skip vendored code. Security rules still scan it: hiding a security finding is the wrong default |
| `SC-DOC-005` covers the wrong folder for a nested docs tree | pip's `docs/html/development/architecture/index.rst` covered `docs/html/development`, which holds no code, so six-year-old architecture documents were never checked | The covered folder is the one above the first documentation folder |
| `SC-DOC-005` counts tests | Click: 51% of the code changed with tests, 41% without | Tests and vendored code are left out of both the lines changed and the size of the area |
| Decision records in `architecture-decision-log` taken for design documents | 12 ADRs on modular-monolith: a false `SC-DOC-003`, and four false freshness findings once coverage was fixed | Decision-log and decision-records folder names are recognized |
| C# files with `#if` splitting a member fail to parse | CliWrap's `SimplexStream.cs` (`#if X public override #else private #endif async Task M()`) | A C# file that fails and contains `#if` is read again as the first branch of each block (other branches and directives blanked, line numbers unchanged). The report says how many files were read this way. A real syntax error is still "not checked" |
| `SC-SEC-003` misses `new ProcessStartInfo { Arguments = "-c " + user }` | WebGoat.NET | `FileName` and `Arguments` set to a built string through an initializer or an assignment are flagged, in files that use `System.Diagnostics` |
| Minified JavaScript is scanned | WebGoat's bundled jQuery: `eval`, `.get()`, and 228 complexity findings | `*.min.js`, `*.min.mjs`, `*.min.cjs`, `*-min.js` are built-in ignores; `!*.min.js` in the config brings them back |

### Before and after

| Repository | Before | After |
|---|---|---|
| WebGoat.NET | `SC-DES-001` 52, `SC-MET-002` 228, `SC-MET-004` 40, `SC-SEC-004` 5, `SC-DES-002` 3 | 1, 20, 1, 1, 0. Still found: `SC-SEC-002` SQL injection 67, `SC-SEC-006` `BinaryFormatter` 4, `SC-SEC-005` SHA1 1 |
| CleanArchitecture | `SC-DES-001` 64, `SC-DES-002` 12 | 4, 0 |
| modular-monolith-with-ddd | `SC-DES-001` 83, `SC-DES-002` 1, `SC-DOC-003` 1 | 2, 0, 0 |
| CliWrap | 2 files not checked | 1 not checked (C# 14, below), 1 read as the first `#if` branch, with a note |
| pip | `SC-MET-001` 372, `SC-MET-002` 269, `SC-MET-006` 87, `SC-DES-003` 22, `SC-DOC-005` 0 | 168, 81, 21, 4, 4 |
| Click, Flask | `SC-DOC-005` 1 (Click) | 0 and 0 |

## Security recall on WebGoat.NET

Found: SQL built from variables (67 places, `SqliteMembershipProvider` and others), `BinaryFormatter` (4), SHA1 (1). Not findings, correctly: `RijndaelManaged` is AES; a constant `Process.Start` is fixed. Not found, by design or by limit:
- `FileName = cmd, Arguments = args` where both are plain method parameters: following a value from a parameter needs data-flow analysis (TD-12). A plain variable is not flagged, because `FileName = path` is overwhelmingly benign.
- `password = "123456"` (6 characters): under `SC-SEC-001`'s 8-character floor, which cuts noise.

## What the freshness rule can and cannot tell (TD-19)

After the fixes `SC-DOC-005` flags four of pip's architecture documents (55%, 107%, 137%, and 168% of the code changed since they were last edited). Each document's names were then checked against the code (identifiers and file paths in backticks or roles):
- `package-finding.rst` names 17 identifiers and 1 file, all still present; `upgrade-options.rst` names 1, present; `index.rst` names none. These are probably still accurate.
- `anatomy.rst` names 6 files that no longer exist (`pep425tags.py`, `Freeze.py`, `build_env.py`, and others). It is verifiably stale, and with vendored code excluded it falls under the 50% line and is not flagged.

So the share of code changed is a weak predictor: a document at the level of ideas does not go stale from churn, and one that names files does when they move. A rule that reports the names a design document uses that no longer exist in the project would be verifiable and much more reliable. It is recorded as a follow-up, not built here.

## Not fixed

- **Fluent chains that use their value and pass through sub-configurators.** The 9 `SC-DES-001` findings left on the C# repos are all still fluent APIs, not reaching through objects: Serilog's `new LoggerConfiguration().ReadFrom.Configuration().Enrich.FromLogContext().WriteTo.Console().CreateLogger()` (5), CliWrap's own `command.WithStandardOutputPipe().WithStandardErrorPipe().Execute...()` (3), and one chain in a bundled jQuery plugin. They are reported because the value is used and the chain has property hops. The rule is `info` at low confidence (TD-25).
- **C# 14 `extension(...)` blocks** (CliWrap's `ProcessExtensions.cs`): `tree-sitter-c-sharp` 0.23.5, the latest published, cannot parse them. Such files are "not checked" (TD-24).
- `SC-SEC-007` (certificate checks) and `SC-SEC-001` on pip were not reviewed against its code.

## Consequences

- Three rules changed behavior (`SC-DES-001`, `SC-DES-002`, `SC-DOC-005`), and a default changed (minified files are ignored). All of this reduces findings; none adds a rule or changes an id or a contract. The one new fact (`MemberChain.discarded`) is internal.
- Scans skip more code by default: vendored folders for metrics and design, minified files for everything. A project that wants them back can say so in the config.
- The corpus is not in the repository (several hundred MB). To repeat the review, clone the repositories above and scan them; HANDOFF lists the commands.
