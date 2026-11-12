# ADR 0014: Release pipeline, dogfood gate, and testing-readiness rules (Milestone 7)

- Status: accepted (Milestone 7)
- Date: 2026-11-12

## Context

Milestone 7 closes the roadmap for 0.1.0: the dogfood gate in CI (US-072), the readiness hints (US-050 to US-052), and what the owner needs to publish: a reviewed package, an SBOM, provenance, and a dry-run publish. The package is `private` at `0.0.0` and has never been published. The name `siftcode` was free on npm on 2026-11-12.

## Decisions

### The dogfood gate
`ci.yml` runs `node dist/cli/main.js scan . --fail-on warning` after the end-to-end step on every matrix leg (Node 24 and 26, Ubuntu and Windows), with a full checkout so the Git rules see history. Information findings (the hotspot ranking, the `SC-TST-002` suggestion) are reported and never fail. One leg keeps the HTML report as an artifact. The gate has caught SiftCode's own mistakes in every milestone by hand (complexity limits, function length); it now runs without anyone remembering to.

### The package was reviewed, and a check keeps it right
`npm pack` shipped 350 files. 105 were source maps pointing at `../src/*.ts`, which is not shipped, so they were useless and are excluded (`"!dist/**/*.map"`); `CHANGELOG.md` was missing and is shipped; npm page metadata (homepage, bugs, keywords) was added. The result is 246 files, 1.2 MB packed, 10.3 MB unpacked (the five grammars are 8.9 MB of that).

`scripts/verify-package.mjs` (`npm run release:check`) makes the review repeatable: it packs the real tarball, fails on a required file that is missing, on anything that must not ship (sources, tests, docs, scripts, CI files, maps, SBOMs, secrets), or on a size budget (2 MB packed, 12 MB unpacked, 400 files), then installs the tarball into an empty project with install scripts off and runs the installed command: version, scan, HTML (self-contained, so the assets are in the package), SARIF, JSON, and `explain`. It was shown to fail on a package deliberately broken to include `src/` and `docs/`.

### The SBOM: `npm sbom --omit dev` was incomplete
`npm sbom --sbom-format cyclonedx --omit dev` (the repository's existing `npm run sbom`) left out `ignore`, a production dependency, and named the root component `SiftCode_BCS` after the folder. `ignore` exists at 7.0.14 in the production tree and at 5.3.2 under ESLint in the development tree, and npm resolved the collision the wrong way; the SPDX format had the same gap. An SBOM that omits a shipped dependency is worse than none, because it looks complete.

`scripts/make-sbom.mjs` builds the SBOM from a clean copy with `devDependencies` removed, at the versions in `package-lock.json` (checked: same integrity values), and fails if any dependency declared in `package.json` is missing from it or the root is misnamed (`scripts/sbom-check.mjs`, covered by a test that feeds it the exact incomplete output npm produced). `npm run sbom` and the release workflow use it. The result lists `ignore`, `web-tree-sitter`, and `zod` with licenses and package URLs.

### The release workflow
`release.yml` runs on a version tag or by hand. The build job repeats every check including the dogfood gate and `release:check`, packs the tarball, writes the SBOM, attests the tarball's build provenance and its SBOM (`actions/attest-build-provenance`, `actions/attest-sbom`, both pinned by commit), keeps the files as an artifact, and dry-runs the publish. A separate publish job runs only for a tag, or when the manual run ticks "publish", and only after the owner approves the `npm` environment. It refuses to publish a tarball whose `package.json` still says `private`, and publishes with `npm publish --provenance`. On a tag it creates the GitHub release with the tarball and SBOM. The tag must equal `v` plus the package version.

- **You publish.** Nothing publishes by itself: the environment needs the owner as a required reviewer, and the package stays `private` until the release commit removes the flag. Both are steps in `docs/RELEASING.md`.
- **Credentials** are the owner's choice: npm trusted publishing (no secret) or an `NPM_TOKEN` secret scoped to the `npm` environment. The workflow works with either and stores neither.
- **`npm publish` refuses a private package even for `--dry-run`.** The workflow's dry run clears the flag on the runner's copy only; locally the same dry run succeeded the same way (246 files, 1.2 MB, `siftcode@0.0.0`) with the flag flipped and then restored.

**Not yet verified:** the workflow has not run on GitHub (the owner pushes). Locally verified: its YAML, that every action is pinned to a full commit SHA, the tag-versus-version rule (matching tag, wrong tag, branch), the private-package guard on the real tarball, the package verification, the SBOM, and the dry-run publish. Not verifiable locally: the two attestation steps, the artifact upload and download, and the environment approval. `RELEASING.md` therefore starts with a manual run that does not publish.

### Testing-readiness and resilience rules (US-050 to US-052)
Six rules, all at information or note level (one `warning` for a large project with no tests at all), none of which fail a scan at the usual `--fail-on` settings. Detection is from files and dependency manifests (npm, Python, NuGet) and, for calls, from the syntax facts; the two cross-file checks read the project's source files again as text, only when they could otherwise report.

| Rule | Reports | Severity, confidence |
|---|---|---|
| `SC-TST-001` | No test files and no test framework among the dependencies, in a project with source files | warning at 20 or more files, else note; medium |
| `SC-TST-002` | Tests exist, but none of mutation, property-based, or fuzz tooling is configured (names tools by language) | note; low |
| `SC-TST-003` | A file that reads fixed-size values out of bytes in 3 or more places (`struct.unpack`, `Buffer.readUInt32LE`, `BitConverter.ToInt32`), when the project has no fuzz target; at most 5 files | info; low |
| `SC-RES-001` | A call to `requests`, `urllib.request.urlopen`, `fetch`, or `axios` with no timeout (`None` and `0` count as none) | info; medium |
| `SC-RES-002` | A timeout written as a number into the call; one note per file listing the values | note; low |
| `SC-RES-003` | Three or more files call remote services, no retry or circuit-breaker library is a dependency, and none of those files mentions retries | note; low |

`SC-RES-001` is the one that points at a real defect class (CWE-400): Python `requests` has no default timeout. It stays quiet when the timeout may be given where the syntax does not show it (`**kwargs`, a spread, options held in a variable, `axios.defaults.timeout`, `axios.create({ timeout })`). Tools known for a language and their detection sets are in `src/rules/testing/tooling.ts` and `src/rules/resilience/retry.ts`.

## Evidence

Calibrated on 20 of the owner's local repositories (a 21st, `Brand Logos`, has a space in its path and was not scanned) and three reputable clones that use HTTP clients (httpie/cli, Tyrrrz/YoutubeExplode, streamlink/streamlink), by reading every finding of the timeout rules against its source line. First pass on the local repositories: `SC-RES-001` 26, `SC-RES-002` 16. Reading them found these false-positive classes, each now left out and covered by a test:

- A **Python function named `fetch`** (`fetch()`, `fetch(top_n=top_n)`) taken for the JavaScript global: 3 findings. `fetch` is only the global in JavaScript and TypeScript files, and not in a file that defines its own.
- **Same-origin and local requests** (`fetch("../catalogue.json")`, `fetch("/__alive")`, `fetch(chrome.runtime.getURL(f))`, `http://127.0.0.1:${port}/...`): about a third of the JavaScript findings.
- **`fetch(dataUrl)`**, the idiom for turning a data URL into a blob, and **service workers**, which pass requests through by design.
- **An `e2e/` folder** is test code (`isTestFile` did not know it).
- `SC-RES-002` was correct on every finding and every finding was on code that sets a timeout, which is the right thing to do; 16 notes would teach people to ignore the rule, so it reports once per file.

Final, on 23 repositories (every finding read): `SC-RES-001` 13 (10 local, 3 on the clones), `SC-RES-002` 11, `SC-RES-003` 3, `SC-TST-001` 4, `SC-TST-002` 17, `SC-TST-003` 4. Of the 13 `SC-RES-001` findings the ones that were checked in detail were true: httpie's startup update check `requests.get(PACKAGE_INDEX_LINK, verify=False)` has no timeout, so a slow server hangs the CLI; its contributors script retries in a loop but with no timeout; streamlink's `update-user-agents.py` has none; and this repository's `scripts/fetch-sarif-schema.mjs` had none (a stuck download would hang CI), now fixed. `SC-RES-003` was correctly quiet on YoutubeExplode, whose files handle retries themselves. `SC-TST-001` on `MyEdMaster-FinancialEducation-Chatbot` (96 source files) is true: 131 tracked files, none test-like, no test framework in either manifest. Scan time and memory did not change meaningfully (benchmark 2.40 s, 117 MB; the 778-file repository took 11.9 s).

## Consequences

- **`SC-TST-002` fires on most projects** (17 of 23), because most projects have example-based tests and nothing else. It is a one-line note that suggests tools, and it can be switched off with one line of config. It is the PRD's "recommend what is missing", not a defect.
- **`SC-RES-002` is the noisiest of the six** even at one note per file, and it points at code that does the right thing. It can be switched off the same way (TD-27).
- `SC-RES-001` does not see a client configured elsewhere (a `requests.Session` with an adapter, a shared agent), only the module-level calls; `SC-TST-003` and `SC-RES-003` read source text, so they see an API name in a comment (TD-28).
- A package.json `private` flag, a first-release credential choice, and the environment approval are the owner's, by design.
- The GitHub Action wrapper (a "Could") was not built.
