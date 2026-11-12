# Releasing SiftCode

How a version gets to npm. The release workflow (`.github/workflows/release.yml`) builds, verifies, and
attests the package, and publishes it only after you approve. **You publish**: nothing here runs by
itself, and nothing is published until you tag and approve. Decisions behind it:
[ADR 0014](adr/0014-release-pipeline.md).

## What is in place

- **Before every merge** (`ci.yml`): format, lint, type check, unit and end-to-end tests on Node 24 and 26,
  on Ubuntu and Windows; a scan of this repository by SiftCode that fails on a warning or worse; and
  `npm audit --omit=dev`. The HTML report of that scan is kept as an artifact.
- **For a release** (`release.yml`, on a tag like `v0.1.0`, or by hand): all of the above, then
  `npm run release:check` (packs the tarball, checks what is and is not inside it, installs it into an empty
  project, and runs the installed command), a fresh SBOM, signed attestations of the tarball's build
  provenance and of its SBOM, and a publish dry run. The files are kept as the `release` artifact for 30 days.
- **Publishing** is a separate job that waits for your approval of the `npm` environment. It refuses to
  publish a package that still says `"private": true`, and publishes with npm provenance.

The package name `siftcode` was free on npm on 2026-11-12 (`npm view siftcode` gave 404). Names are
first come, first served, so publish soon after you decide.

## One-time setup (you)

1. **npm account** with two-factor authentication on, and the right to publish `siftcode`.
2. **Environment.** In the GitHub repository: Settings, Environments, New environment, named `npm`. Add
   yourself under "Required reviewers". Optionally limit "Deployment branches and tags" to `v*`.
3. **Credentials**, one of:
   - **Trusted publishing (no secret to store).** On npmjs.com, once the package exists (the first release
     needs option b), open the package's settings and add a trusted publisher: this repository and the
     workflow file `release.yml`. Leave `NPM_TOKEN` unset.
   - **A token.** Create an npm access token that can publish (a granular token scoped to this package is
     best) and add it as the secret `NPM_TOKEN` of the `npm` environment (not the whole repository). Use this
     for the first release, then switch to trusted publishing and delete the token.
4. **Pick the first version.** The package is `0.0.0` and `private`. `0.1.0` is the version the roadmap names.

## Releasing (each time)

1. **Be on a green `main`.** `git status -sb` clean, and the latest `CI` run green (`gh run list --limit 3`).
2. **Update the changelog.** In `CHANGELOG.md`, rename `## [Unreleased]` to the version and date
   (`## [0.1.0] - 2026-MM-DD`) and add a new empty `## [Unreleased]` above it.
3. **Set the version, and make the package public** (the first release only needs the second change):
   ```bash
   npm version 0.1.0 --no-git-tag-version
   npm pkg delete private
   ```
4. **Check the package locally.**
   ```bash
   npm run release:check
   ```
   It must end with "The package is complete, free of what must not ship, and works when installed."
5. **Update the README's quick start** so it says how to install from npm (`npx siftcode scan .`) once the
   package is published, and remove "early development" from the status line if that is no longer true.
6. **Commit and push**, e.g. `chore: release 0.1.0`. Wait for CI.
7. **Try the release workflow without publishing.** Actions, Release, Run workflow, leave "Also publish to
   npm" unticked. Everything runs except the publish. Download the `release` artifact and look inside.
8. **Tag and push the tag.**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The tag must equal the package version with a `v` in front; the workflow stops if it does not. The build
   job runs; then the publish job waits for you. Open it, read the version it prints, and approve.
9. **Check the result.**
   ```bash
   npm view siftcode version
   npx siftcode@0.1.0 --version
   gh release view v0.1.0                    # the tarball and the SBOM are attached
   gh attestation verify siftcode-0.1.0.tgz -R BlackCanyonSoftware/siftcode_BCS
   npm audit signatures                      # in a project that depends on siftcode
   ```

## If something is wrong

- **The build job failed.** Nothing was published. Fix on `main`, then delete the tag locally and on GitHub
  (`git tag -d v0.1.0`, `git push origin :refs/tags/v0.1.0`) and tag again.
- **The publish job failed after npm accepted the package.** Check `npm view siftcode`. A version number can
  never be reused, even after an unpublish: the next release is a new patch version.
- **A bad version is out.** `npm deprecate siftcode@0.1.0 "reason, use 0.1.1"` and publish a fix. Unpublishing
  is allowed only within 72 hours and only if nothing depends on it; deprecating is almost always better.

## What this does not do

- It does not decide the version or write the changelog. That is yours (steps 2 and 3).
- It does not publish a GitHub Action wrapper. That is a separate, optional piece of work.
- It has not been run on GitHub yet: the first run is step 7, with publish unticked. Everything in it
  except the Actions-only steps (the attestations and the upload) was run locally: the checks, the package
  verification and install, the SBOM, the tag-versus-version rule, the private-package guard, and the dry-run
  publish.
- It does not rotate or store credentials for you.
