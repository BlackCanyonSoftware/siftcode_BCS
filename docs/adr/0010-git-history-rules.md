# ADR 0010: Git history rules: hotspots and design document freshness (Milestone 5)

- Status: accepted (Milestone 5)
- Date: 2026-11-08

## Context

PRD US-013 asks for hotspots (files that are both complex and changed often, ranked, skipped with a note outside a Git repository), and US-034 asks for a low-confidence finding when a design document looks stale. Both need the project's Git history, which until now no rule could see. SiftCode must stay offline and must never run the code it scans.

## Decisions

### Reading history by running `git`
No Git library is added (a pure-JavaScript Git reader would be a large dependency to parse pack files, and the project's own `git` already does it correctly). `src/git/` runs the `git` program with `execFile`, never through a shell:
- **Found safely.** On Windows a program started in a folder is searched for in that folder first, so a project could carry its own `git.exe`. `locateGit` walks the search path itself, skips relative entries and anything inside the scanned folder, and starts the result by its full path (tested).
- **Read-only and free of the project's own programs.** No pager; `core.fsmonitor=false`; `--no-ext-diff` and `--no-textconv` on `git log`; `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, and `GIT_EXTERNAL_DIFF` removed from the environment; `GIT_OPTIONAL_LOCKS=0` so it does not even refresh the index; no network. `git log` runs no hooks. A test confirms the `.git` folder is unchanged by a scan.
- **Bounded.** 30 s timeout, 64 MiB of output, 20,000 commits (a longer history is cut at the newest and a note says so).
- **Failure is a reason, not an error.** Git missing, not a repository, an owner Git does not trust ("dubious ownership"), a timeout, or any other Git message becomes `{ available: false, reason }`. A repository without commits is an empty history.

`git log --no-merges --no-renames --numstat --relative` over the scanned folder gives each commit's time and the lines added and deleted per file, with paths relative to the scanned folder (so scanning a subfolder works). Renames are not followed: a renamed file's history starts again, which can hide a hotspot for a window.

### What rules see
`RepoView` gains `git()` (opened once per scan), `codeFiles` (the parsed files with their measurements), and `note(message)`. A note is shown beside the findings (text, Markdown, and the JSON `notes` array) and is how a rule says "skipped, and why" without it being a finding or an error. SARIF does not carry notes yet.

### SC-HOT-001: hotspots (US-013)
Score = commits that changed the file in the window × the file's total cyclomatic complexity, the "change frequency times complexity" ranking of Tornhill, supported by the churn-and-defects studies of Graves et al. and Nagappan and Ball. Defaults: 12 months, at least 5 commits, complexity at least 30, top 10, info severity. Commits that touch more than 100 files (mass reformats, vendored imports) are ignored; test files and vendored folders are never ranked. The message gives the rank, the commit count, the complexity, and the line count.

### SC-DOC-005: design document freshness (US-034)
For each design document or diagram source (not decision records: those are meant to stay as written; at most 20): when it last changed (`git log -1`), and if that was at least 90 days ago, the lines changed in the code it covers since then. **Covers** means the folder around the document, minus documentation folders on the way up (`src/auth/docs/design.md` covers `src/auth`; `docs/architecture.md` covers the whole project). It reports when at least 500 lines changed and that is at least 50% of the covered code's current size. Info severity, low confidence: it is a guess from history, and says so.

## Evidence

- Unit tests build real Git repositories with chosen commit dates (ranking, window, mass commits, top N, vendored and test code, subfolder scans, no commits, truncation, no repository).
- 19 local repositories: hotspots found in 14 (0 to 10 each); the ranking matches what the developers would name, for example `skills.py` in `streamer_AI_BCS` (135 commits in 12 months, complexity 1,240, 8,423 lines) at #1. The first run put a vendored 3,935-line file at #1 in `StockTake_BCS`; vendored folders are now left out. This repository's own `manifests.ts` is reported (5 commits, complexity 96).
- Freshness: at the default thresholds nothing fired, because these projects are weeks to months old. With relaxed thresholds (age 0, 100 lines, 20%) it fired where expected, for example an architecture document 11 days old over code in which 174 commits changed 94% of the lines. The thresholds are therefore not tuned on real stale documents (TD-19).
- Cost: Git adds about 0.5 to 2.3 s to a scan of these repositories (745 files and 8 s in the largest, of which about 0.6 s is Git).

## Consequences

- Both rules need the `git` program. Without it they are skipped with a note; every other rule is unaffected.
- A finding depends on the date of the scan as well as the code: the same checkout gives different hotspots next month. The report has no timestamp, but the rule output is no longer a pure function of the files.
- Scanning a copy of a project without its `.git` folder gives no hotspots and a note.
- The ranking counts commits, not authors or ownership; combining churn with how many people touch a file is a later refinement.
