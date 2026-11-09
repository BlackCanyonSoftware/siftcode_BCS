import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The most output read from one Git command. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
/** The longest a Git command may run. */
const TIMEOUT_MS = 30_000;

/** Why a Git command failed, in a form fit for a user: the program is missing, the folder is not a repository, and so on. */
export class GitUnavailable extends Error {}

/**
 * Settings for every Git command: no pager and no file-system monitor (both are programs the
 * repository's own configuration can name, and SiftCode never runs what the scanned project
 * chose), and paths that are not quoted. Commands that read history also pass `--no-ext-diff` and
 * `--no-textconv`, which are the other two ways a repository can name a program.
 */
const SAFE_OPTIONS = ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false'];

/** The environment variables that would point Git somewhere other than the scanned folder. */
const DROPPED_VARIABLES = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_EXTERNAL_DIFF',
]);

function environment(): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !DROPPED_VARIABLES.has(name)),
  );
  return { ...kept, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
}

function explain(error: unknown, stderr: string): GitUnavailable {
  const code = (error as { code?: unknown }).code;
  const killed = (error as { killed?: unknown }).killed === true;
  if (code === 'ENOENT') {
    return new GitUnavailable('Git is not installed');
  }
  if (killed) {
    return new GitUnavailable('reading the Git history took too long');
  }
  if (/not a git repository/i.test(stderr)) {
    return new GitUnavailable('the folder is not in a Git repository');
  }
  if (/dubious ownership/i.test(stderr)) {
    return new GitUnavailable('Git does not trust the owner of this folder');
  }
  const first = stderr.split('\n').find((line) => line.trim() !== '');
  return new GitUnavailable(first ? `Git said: ${first.trim()}` : 'Git could not read the history');
}

/** True when `path` is `folder` or lies inside it. */
function isInside(folder: string, path: string): boolean {
  const from = relative(resolve(folder), resolve(path));
  return from === '' || (!from.startsWith(`..${sep}`) && from !== '..' && !isAbsolute(from));
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The full path of the `git` program on the search path, or undefined. A program is never taken from
 * the scanned folder: on Windows a program launched in a folder is looked for in that folder first,
 * so a project could carry its own `git.exe`. Entries of the search path that are relative, or that
 * lie inside the scanned folder, are skipped, and the result is launched by its full path.
 */
export function locateGit(
  scannedFolder: string,
  searchPath: string = process.env.PATH ?? '',
): string | undefined {
  const names = process.platform === 'win32' ? ['git.exe'] : ['git'];
  for (const entry of searchPath.split(delimiter)) {
    if (!isAbsolute(entry) || isInside(scannedFolder, entry)) {
      continue;
    }
    const found = names.map((name) => join(entry, name)).find(isExecutable);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * Runs `git` in `directory` with `args` and returns its output. The arguments are passed to the
 * program directly, never through a shell.
 */
export function runGit(directory: string, args: readonly string[]): Promise<string> {
  const git = locateGit(directory);
  if (git === undefined) {
    return Promise.reject(new GitUnavailable('Git is not installed'));
  }
  return new Promise((done, reject) => {
    execFile(
      git,
      [...SAFE_OPTIONS, ...args],
      {
        cwd: directory,
        env: environment(),
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(explain(error, stderr));
        } else {
          done(stdout);
        }
      },
    );
  });
}
