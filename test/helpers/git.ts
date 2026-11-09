import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** What one commit in a test repository changes. A file set to `null` is deleted. */
export interface TestCommit {
  readonly files: Readonly<Record<string, string | null>>;
  /** The commit time as an ISO date, e.g. `2026-03-01T12:00:00Z`. */
  readonly date: string;
}

function git(folder: string, date: string | undefined, ...args: string[]): void {
  execFileSync('git', args, {
    cwd: folder,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      ...(date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    },
  });
}

/** Turns an existing folder into a Git repository with the given commits (oldest first). */
export async function initRepository(
  folder: string,
  commits: readonly TestCommit[],
): Promise<void> {
  git(folder, undefined, 'init', '-q', '-b', 'main');
  git(folder, undefined, 'config', 'commit.gpgsign', 'false');
  for (const [index, commit] of commits.entries()) {
    for (const [path, content] of Object.entries(commit.files)) {
      const target = join(folder, path);
      if (content === null) {
        git(folder, commit.date, 'rm', '-q', '--', path);
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
        git(folder, commit.date, 'add', '--', path);
      }
    }
    git(folder, commit.date, 'commit', '-q', '--allow-empty', '-m', `commit ${index + 1}`);
  }
}

/** A date `days` before now, as an ISO string, for commits that must fall inside or outside a window. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
