import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, sep } from 'node:path';
import type { Discovery } from '../discovery/discover.js';
import type { RepoView } from '../rules/types.js';

/** Files larger than this are not read by repository-level rules. */
const MAX_READ_BYTES = 1024 * 1024;

/**
 * Gives repository-level rules a view of the scanned folder: which files exist, and a size-limited,
 * cached way to read them. Nothing is read until a rule asks, and each file is read at most once.
 *
 * `read` and `list` also reach folders that discovery ignores (`node_modules`, a virtual
 * environment), because installed packages hold the license of each dependency. They never leave
 * the scan root: a path that escapes it, or a link that points outside it, reads as missing.
 */
export function createRepoView(discovery: Discovery): RepoView {
  const known = new Set(discovery.allFiles);
  const reads = new Map<string, Promise<string | undefined>>();
  const realRoot = realpath(discovery.root);

  /** The real path of `path` when it lies inside the scan root, otherwise undefined. */
  async function resolveInside(path: string): Promise<string | undefined> {
    const normalized = posix.normalize(path);
    if (isAbsolute(path) || normalized === '..' || normalized.startsWith('../')) {
      return undefined;
    }
    try {
      const real = await realpath(join(discovery.root, normalized));
      const fromRoot = relative(await realRoot, real);
      const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
      return outside ? undefined : real;
    } catch {
      return undefined;
    }
  }

  async function readLimited(path: string): Promise<string | undefined> {
    const real = await resolveInside(path);
    try {
      if (real === undefined || (await stat(real)).size > MAX_READ_BYTES) {
        return undefined;
      }
      return await readFile(real, 'utf8');
    } catch {
      return undefined;
    }
  }

  return {
    isRepositoryRoot: discovery.isRepositoryRoot,
    files: discovery.allFiles,
    sourceFileCount: discovery.files.length,
    has: (path) => known.has(path),
    read(path) {
      let pending = reads.get(path);
      if (!pending) {
        pending = readLimited(path);
        reads.set(path, pending);
      }
      return pending;
    },
    async list(directory) {
      const real = await resolveInside(directory);
      try {
        return real === undefined ? [] : (await readdir(real)).sort();
      } catch {
        return [];
      }
    },
  };
}
