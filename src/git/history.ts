import { parseLog, RECORD_SEPARATOR } from './parse.js';
import { GitUnavailable, runGit } from './run.js';
import type { CommitLog, GitAccess } from './types.js';

/** `git log` fails on a repository without commits; that is an empty history, not a failure. */
const NO_COMMITS = /does not have any commits yet|unknown revision|bad default revision/i;

async function emptyIfNoCommits<T>(read: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof GitUnavailable && NO_COMMITS.test(error.message)) {
      return empty;
    }
    throw error;
  }
}

/** The non-merge commits since `since`, newest first, at most `limit` of them. */
async function readCommits(directory: string, since: Date, limit: number): Promise<CommitLog> {
  const output = await runGit(directory, [
    'log',
    '--no-merges',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    '--numstat',
    `--format=${RECORD_SEPARATOR}%ct`,
    `--since=${since.toISOString()}`,
    `--max-count=${limit + 1}`,
    '--relative',
    '--',
    '.',
  ]);
  const commits = parseLog(output);
  return { commits: commits.slice(0, limit), truncated: commits.length > limit };
}

/** When `path` last changed in a commit, in seconds since 1970. */
async function readLastChange(directory: string, path: string): Promise<number | undefined> {
  const output = (
    await runGit(directory, ['log', '-1', '--no-renames', '--format=%ct', '--', path])
  ).trim();
  const time = Number(output);
  return output === '' || !Number.isFinite(time) ? undefined : time;
}

/**
 * Opens the Git history of `directory` (which may be a subfolder of the repository; paths are then
 * relative to it). Returns the reason instead when there is none: Git missing, not a repository,
 * or unreadable.
 */
export async function openGit(directory: string): Promise<GitAccess> {
  try {
    const inside = await runGit(directory, ['rev-parse', '--is-inside-work-tree']);
    if (inside.trim() !== 'true') {
      return { available: false, reason: 'the folder is not in a Git work tree' };
    }
  } catch (error) {
    return {
      available: false,
      reason: error instanceof GitUnavailable ? error.message : 'Git failed',
    };
  }
  return {
    available: true,
    commitsSince: (since, limit) =>
      emptyIfNoCommits(() => readCommits(directory, since, limit), {
        commits: [],
        truncated: false,
      }),
    lastChange: (path) => emptyIfNoCommits(() => readLastChange(directory, path), undefined),
  };
}
