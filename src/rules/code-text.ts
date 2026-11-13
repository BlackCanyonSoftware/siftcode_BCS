import type { CodeFile } from '../languages/model/types.js';
import { isTestFile, isVendored } from './shared.js';
import type { RepoView } from './types.js';

/** A project source file and its text. */
export interface CodeText {
  readonly path: string;
  readonly text: string;
}

/** The project's own source files: not tests, not vendored. */
export function projectCode(repo: RepoView): readonly CodeFile[] {
  return repo.codeFiles.filter((file) => !isTestFile(file.path) && !isVendored(file.path));
}

/**
 * The project's own source files with their text, for rules that must look at the text itself. A
 * rule that looks for an API by name should use `file.usage` from `projectCode` instead: it is read
 * from the syntax, so a name in a comment or a string does not count. The files were parsed already;
 * reading them again is a second pass, so callers read only when they would otherwise report.
 */
export async function readProjectCode(repo: RepoView): Promise<readonly CodeText[]> {
  const paths = projectCode(repo).map((file) => file.path);
  const read = await Promise.all(
    paths.map(async (path) => ({ path, text: (await repo.read(path)) ?? '' })),
  );
  return read.filter((file) => file.text !== '');
}

/** The 1-based line of `index` in `text`. */
export const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length;
