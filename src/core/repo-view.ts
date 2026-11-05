import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Discovery } from '../discovery/discover.js';
import type { RepoView } from '../rules/types.js';

/** Files larger than this are not read by repository-level rules. */
const MAX_READ_BYTES = 1024 * 1024;

/**
 * Gives repository-level rules a view of the scanned folder: which files exist, and a size-limited,
 * cached way to read them. Nothing is read until a rule asks, and each file is read at most once.
 */
export function createRepoView(discovery: Discovery): RepoView {
  const known = new Set(discovery.allFiles);
  const reads = new Map<string, Promise<string | undefined>>();

  async function readLimited(path: string): Promise<string | undefined> {
    const absolute = join(discovery.root, path);
    try {
      if ((await stat(absolute)).size > MAX_READ_BYTES) {
        return undefined;
      }
      return await readFile(absolute, 'utf8');
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
      if (!known.has(path)) {
        return Promise.resolve(undefined);
      }
      let pending = reads.get(path);
      if (!pending) {
        pending = readLimited(path);
        reads.set(path, pending);
      }
      return pending;
    },
  };
}
