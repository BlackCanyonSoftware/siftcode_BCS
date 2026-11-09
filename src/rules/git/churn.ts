import type { Commit } from '../../git/types.js';

/** The most commits one rule reads; a longer history is cut at the newest ones and says so. */
export const MAX_COMMITS = 20_000;

export const SECONDS_PER_DAY = 24 * 60 * 60;

/** How often a file changed, and how many lines changed in it. */
export interface Churn {
  readonly commits: number;
  readonly lines: number;
}

/**
 * Counts, per file, the commits after `after` (seconds since 1970) that changed it, and the lines
 * added plus deleted. A commit that touches more than `maxFilesPerCommit` files is a mass change
 * (a reformat, a rename of a folder, an import of vendored code) that says nothing about where
 * work happens, so it is left out.
 */
export function churnByFile(
  commits: readonly Commit[],
  maxFilesPerCommit: number,
  after = 0,
): Map<string, Churn> {
  const churn = new Map<string, Churn>();
  for (const commit of commits) {
    if (commit.time <= after || commit.files.length > maxFilesPerCommit) {
      continue;
    }
    for (const file of commit.files) {
      const before = churn.get(file.path);
      churn.set(file.path, {
        commits: (before?.commits ?? 0) + 1,
        lines: (before?.lines ?? 0) + file.added + file.deleted,
      });
    }
  }
  return churn;
}

/** The date `months` calendar months before now. */
export function monthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}
