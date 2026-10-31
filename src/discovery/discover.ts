import { readdir, stat } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { UsageError } from '../core/errors.js';
import { languageForFile, type GrammarId } from '../languages/registry.js';

/** Folders that hold dependencies, build output, or caches rather than the project's own code. */
export const DEFAULT_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  '.venv',
  '__pycache__',
  'bin',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'obj',
  'venv',
]);

/** Files larger than this are skipped: they are almost always generated or minified. */
export const MAX_FILE_BYTES = 1024 * 1024;

export interface SourceFile {
  readonly absolutePath: string;
  /** Path relative to the scan root, always with forward slashes. */
  readonly relativePath: string;
  readonly grammar: GrammarId;
  readonly displayName: string;
}

export interface SkippedCounts {
  readonly unsupported: number;
  readonly tooLarge: number;
  readonly symlinks: number;
}

export interface Discovery {
  /** Absolute path of the scan root. */
  readonly root: string;
  readonly files: readonly SourceFile[];
  readonly skipped: SkippedCounts;
}

/**
 * Finds the supported source files under `path` (a folder, or a single file).
 * Order is deterministic. Symbolic links are never followed, so a scan cannot
 * escape the root it was given.
 */
export async function discoverFiles(path: string): Promise<Discovery> {
  const root = resolve(path);
  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat) {
    throw new UsageError(`Path not found: ${path}`);
  }

  const files: SourceFile[] = [];
  const skipped = { unsupported: 0, tooLarge: 0, symlinks: 0 };

  async function consider(absolutePath: string, relativePath: string): Promise<void> {
    const language = languageForFile(absolutePath);
    if (!language) {
      skipped.unsupported += 1;
      return;
    }
    if ((await stat(absolutePath)).size > MAX_FILE_BYTES) {
      skipped.tooLarge += 1;
      return;
    }
    files.push({
      absolutePath,
      relativePath,
      grammar: language.grammar,
      displayName: language.displayName,
    });
  }

  async function walk(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skipped.symlinks += 1;
      } else if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(absolutePath);
        }
      } else if (entry.isFile()) {
        await consider(absolutePath, relative(root, absolutePath).split(sep).join('/'));
      }
    }
  }

  if (rootStat.isDirectory()) {
    await walk(root);
  } else {
    await consider(root, basename(root));
  }
  return { root, files, skipped };
}
