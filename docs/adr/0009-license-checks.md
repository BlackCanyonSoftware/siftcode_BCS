# ADR 0009: License detection and compliance (Milestone 4b)

- Status: accepted (Milestone 4b), compatibility table awaiting owner review
- Date: 2026-11-05

## Context

PRD US-035 to US-037 ask SiftCode to tell a maintainer whether the project has a license and which one, whether it follows that license, and whether a dependency's license conflicts with it. Risk R8 applies throughout: a license finding must not read as legal assurance, the compatibility rules must be data with sources, and "unknown" must be reported as unknown. Everything works offline from files on disk.

## Decisions

### Bundled SPDX data
- `spdx-license-list` 6.12.0 is a **dev-only** dependency (exact pin, install scripts disabled): published by Sindre Sorhus, license CC0-1.0, the data is the SPDX License List (github.com/spdx/license-list-data). `npm run build:licenses` writes two committed, shipped files: `data/licenses/ids.json` (all 727 SPDX ids with name and OSI status, deprecated ids included, 55 KB) and `data/licenses/texts.json` (the full text of 56 licenses SiftCode can recognize, 0.65 MB). The scanner reads them from disk and never uses the network. `NOTICE` credits the source.
- Only 56 texts are bundled (the permissive, weak and strong copyleft, public-domain, and restricted licenses in the compatibility table) instead of all 727, to keep the package small. Every other id is still *valid* in an expression; its text is just not matchable.

### SPDX expressions
A 100-line parser (no dependency) handles `AND`, `OR`, `WITH`, `+`, and parentheses, with `AND` binding tighter than `OR`. Deprecated ids map to their current ones (`GPL-2.0` is `GPL-2.0-only`, `GPL-2.0+` is `GPL-2.0-or-later`). Text that is not SPDX syntax (`MIT License`, `Apache 2.0`, `MIT or Apache-2.0`) is reported as not valid instead of being guessed at. `LicenseRef-…` and unknown ids parse as "not known".

### Identifying a license file
Normalize (lower case, punctuation and spacing removed, `http`/`https` equal, copyright and "All rights reserved" lines removed, a short leading title removed, the optional "how to apply" appendix cut) and compare word pairs with the Dice coefficient, as the SPDX matching guidelines describe in spirit. Result:
- **match** at 0.90 or more (`verbatim` at 0.97 or more), unless a stretch of 14 or more words was added or removed in one piece, which makes it **modified**; **modified** from 0.80; below that, **unrecognized**.
- **multiple** when the file holds the full text of two licenses (parts of another license, like MIT-0 inside MIT, do not count), or the full text of one license among other terms.
- Licenses with identical text (GPL-3.0-only and -or-later) are reported together.

Evidence: the 130 LICENSE files of this repository's `node_modules` all identify as the license their package declares: 124 matches, 4 modified (extra attribution text), 2 multiple (bundled-license lists), in 0.5 s. The 0.90 match tier exists because SPDX's ISC text says "ISC disclaims" where almost every real file says "the author disclaims", which already costs a 100-word license 5 points. **Known limit (TD-16):** a real change of terms shorter than 14 words, in a license over about 100 words, scores above 0.90 and is reported as a match.

### The project's license
Order of evidence: license files at the top of the project (`LICENSE*`, `COPYING*`, `UNLICENSE*`, and a REUSE `LICENSES/` folder); the license declared in `package.json` (a string, `{type}`, or `licenses`), `pyproject.toml` (`license = "…"` or `{ text = "…" }`, Poetry too; `{ file = "…" }` names no license), or a `.csproj` (`PackageLicenseExpression`). The effective license for dependency comparison is the declared SPDX expression when valid, otherwise the license files (several files are an `OR`, GPL twins count as `-only`). A file that reserves all rights and grants none is a **proprietary** project (`UNLICENSED` is the same).

### Rules
| Rule | Reports | Default severity |
|---|---|---|
| SC-LIC-001 | No license file and no declared license (at a Git repository root with code) | warning |
| SC-LIC-002 | License file is a modified standard license, or not recognized | info |
| SC-LIC-003 | Declaration is not an SPDX expression or names an unknown id; declaration and license files disagree | info; warning for a disagreement |
| SC-LIC-004 | License file with unfilled placeholders, or MIT/BSD/ISC with no copyright line | warning; info for no copyright line |
| SC-LIC-005 | A folder with its own, different license that no README, NOTICE, or THIRD_PARTY file mentions | warning |
| SC-LIC-006 | Source files tagged `SPDX-License-Identifier` with a license other than the project's; untagged files among tagged ones | warning; info for untagged |
| SC-LIC-007 | A runtime dependency's license conflicts with the project's, per the compatibility table | warning; info for weak-copyleft obligations |
| SC-LIC-008 | Dependency with no license, an unclear one (`BSD`, `SEE LICENSE IN …`), one outside the table, or no license information offline | info; warning when no license is granted |

Every license finding ends with "This is a check against published license data, not legal advice." Dependencies that share a manifest and an issue are reported as one finding that names the first five.

### Dependency licenses, offline
npm: `package-lock.json` (version 2 or 3 records `license`; development packages are skipped), falling back to the installed `node_modules/<pkg>/package.json`, or to the installed copy of each direct dependency when there is no lockfile. Python: the `*.dist-info/METADATA` of a virtual environment at the project (`.venv`, `venv`, `env`), following `Requires-Dist` (optional `extra ==` requirements skipped). NuGet: `.nuspec` files of restored packages inside the project. This needs `RepoView.read` and `list` to reach ignored folders; they cannot leave the scan root. A dependency whose license cannot be found is **unknown**, never guessed; it is reported once per manifest. Not read: the NuGet global package cache and Python environments outside the project (they are outside the scan root), and yarn or pnpm lockfiles (they do not record licenses).

### The compatibility table
`src/rules/licenses/compatibility.ts`, version `1 (2026-11-05)`, is data with the sources named beside it: the GNU license list and GPL FAQ, the GPL, LGPL, and AGPL texts, the Apache Software Foundation's GPL-compatibility page, the MPL 2.0 FAQ, and the SSPL, BUSL, Elastic, and Creative Commons NC texts. Licenses are sorted into permissive, public domain, weak copyleft, strong copyleft, network copyleft, restricted (source-available or limits on use), and proprietary. What it reports:
- **Restricted** dependency (SSPL, BUSL, Elastic-2.0, CC-BY-NC, ...): warning, whatever the project license is.
- **Strong or network copyleft** dependency in a permissive, weak-copyleft, or proprietary project: warning (info if the project is MPL-2.0, which allows the combination).
- **GNU version rules** between GNU-licensed project and dependency: GPL-2.0-only with anything version 3; GPL-3 with GPL-2.0-only; AGPL with GPL-2.0-only.
- **Apache-2.0 with GPL-2.0-only**; FSF-listed GPL-incompatible licenses (BSD-4-Clause, Apache-1.x, CDDL, EPL-1.0, MPL-1.1, OSL-3.0, AFL-3.0, OpenSSL) in a GPL project; EPL-2.0 as info.
- **Weak copyleft** (LGPL, MPL, EPL, CDDL) dependency in a non-copyleft project: info, with the obligation.
- `OR` in a dependency's license lets the user pick the easier side; `AND` asks for both; a dual-licensed project can choose the alternative that fits; a GPL license `WITH` a classpath-style exception counts as weak copyleft.
- A license not in the table is reported as outside it (info), not judged.

**The table is for the owner to review before release** (HANDOFF, PRD R8). It does not know whether a dependency is linked, bundled, or only run, so the wording is conditional ("if it is bundled or linked").

## Evidence

- 19 local repositories (calibration, then re-run): the first run reported seven proprietary "All rights reserved" files as unrecognized, read `license = { file = "LICENSE" }` as a license name, called a file holding MIT plus extra terms unrecognized, and did not know `MIT-CMU` (pillow). All fixed (this ADR describes the fixed behavior). It also found real items: a source-available dependency (Remotion's own license) and a MPL-2.0 package in a proprietary project, seven repositories without a license, and Javadoc-generated `legal/LICENSE` folders.
- A synthetic scan of this repository's 171-package lockfile as production dependencies: under MIT, one grouped info finding (12 platform builds of `lightningcss`, MPL-2.0); under GPL-2.0-only, the Apache-2.0 packages are flagged as incompatible, which is correct. Before grouping, the first case was 12 findings.
- Dogfood: this repository (Apache-2.0, MIT and ISC dependencies) is clean.

## Consequences

- A license finding is a prompt to look, not a verdict; the not-legal-advice sentence is part of each message and tested.
- Adding a license to the matcher is one line in `scripts/build-licenses.mjs` plus a row in the table; refreshing the SPDX list is `npm run build:licenses`.
- Package size grows by about 0.7 MB.
- Whole-project license checks (001 to 006) only run at the top of a Git repository, like the other whole-project checks (ADR 0008); 007 and 008 run on any folder.
