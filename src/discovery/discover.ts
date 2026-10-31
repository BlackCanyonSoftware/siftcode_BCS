import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { compareStrings } from '../core/compare.js';
import { UsageError } from '../core/errors.js';
import { languageForFile, type GrammarId } from '../languages/registry.js';
import { IgnoreStack } from './ignore-stack.js';

/** Folders that hold dependencies, build output, or caches rather than the project's own code. */
export const DEFAULT_IGNORED_DIRECTORIES: readonly string[] = [
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
];

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

export interface DiscoverOptions {
  /** Extra gitignore-style patterns; they override the defaults and any `.gitignore`. */
  readonly ignore?: readonly string[];
}

/**
 * Finds the supported source files under `path` (a folder, or a single file), skipping what the
 * built-in defaults, any `.gitignore`, and `options.ignore` exclude. Order is deterministic.
 * Symbolic links are never followed, so a scan cannot escape the root it was given. A file named
 * directly is scanned even if an ignore rule would exclude it.
 */
export async function discoverFiles(
  path: string,
  options: DiscoverOptions = {},
): Promise<Discovery> {
  const root = resolve(path);
  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat) {
    throw new UsageError(`Path not found: ${path}`);
  }

  const walk = new Walk();
  if (rootStat.isDirectory()) {
    const ignores = IgnoreStack.create(
      DEFAULT_IGNORED_DIRECTORIES.map((name) => `${name}/`),
      options.ignore ?? [],
    );
    await walk.directory(root, '', ignores);
  } else {
    await walk.file(root, basename(root));
  }
  return { root, files: walk.files, skipped: walk.skipped };
}

class Walk {
  readonly files: SourceFile[] = [];
  readonly skipped = { unsupported: 0, tooLarge: 0, symlinks: 0 };

  async directory(absolute: string, relativePath: string, inherited: IgnoreStack): Promise<void> {
    const ignores = await this.withLocalGitignore(inherited, absolute, relativePath);
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => compareStrings(a.name, b.name));

    for (const entry of entries) {
      const childPath = join(absolute, entry.name);
      const childRelative = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        this.skipped.symlinks += 1;
      } else if (entry.isDirectory()) {
        if (!ignores.isIgnored(childRelative, true)) {
          await this.directory(childPath, childRelative, ignores);
        }
      } else if (entry.isFile() && !ignores.isIgnored(childRelative, false)) {
        await this.file(childPath, childRelative);
      }
    }
  }

  async file(absolute: string, relativePath: string): Promise<void> {
    const language = languageForFile(absolute);
    if (!language) {
      this.skipped.unsupported += 1;
      return;
    }
    if ((await stat(absolute)).size > MAX_FILE_BYTES) {
      this.skipped.tooLarge += 1;
      return;
    }
    this.files.push({
      absolutePath: absolute,
      relativePath,
      grammar: language.grammar,
      displayName: language.displayName,
    });
  }

  private async withLocalGitignore(
    ignores: IgnoreStack,
    absolute: string,
    relativePath: string,
  ): Promise<IgnoreStack> {
    const content = await readFile(join(absolute, '.gitignore'), 'utf8').catch(() => undefined);
    return content === undefined ? ignores : ignores.withGitignore(relativePath, content);
  }
}
