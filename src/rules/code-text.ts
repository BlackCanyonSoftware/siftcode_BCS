import { isTestFile, isVendored } from './shared.js';
import type { RepoView } from './types.js';

/** A project source file and its text. */
export interface CodeText {
  readonly path: string;
  readonly text: string;
}

/**
 * The project's own source files (not tests, not vendored) with their text, for rules that look for
 * an API by name across the whole project. The files were parsed already; reading them again is a
 * second pass over the same text, so callers read only when they would otherwise report something.
 */
export async function readProjectCode(repo: RepoView): Promise<readonly CodeText[]> {
  const paths = repo.codeFiles
    .map((file) => file.path)
    .filter((path) => !isTestFile(path) && !isVendored(path));
  const read = await Promise.all(
    paths.map(async (path) => ({ path, text: (await repo.read(path)) ?? '' })),
  );
  return read.filter((file) => file.text !== '');
}

/** The 1-based line of `index` in `text`. */
export const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length;
