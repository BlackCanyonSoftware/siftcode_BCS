/** The lines one commit added to and removed from one file. */
export interface FileChange {
  /** Relative to the scanned folder, with forward slashes. */
  readonly path: string;
  readonly added: number;
  readonly deleted: number;
}

/** One non-merge commit and the files it changed. */
export interface Commit {
  /** Commit time, in seconds since 1970. */
  readonly time: number;
  readonly files: readonly FileChange[];
}

export interface CommitLog {
  /** Newest first. */
  readonly commits: readonly Commit[];
  /** True when there were more commits in the window than the limit allowed. */
  readonly truncated: boolean;
}

/**
 * Read-only access to the Git history of the scanned folder, or the reason there is none. History
 * is read by running the `git` program; nothing in the repository is changed or run.
 */
export type GitAccess =
  | {
      readonly available: true;
      /** The commits since `since`, at most `limit` of them. */
      commitsSince(since: Date, limit: number): Promise<CommitLog>;
      /** When the file last changed in a commit, in seconds since 1970; undefined if it never did. */
      lastChange(path: string): Promise<number | undefined>;
    }
  | { readonly available: false; readonly reason: string };
