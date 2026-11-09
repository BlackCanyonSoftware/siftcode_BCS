import type { AnalyzedFile, CodeUnit } from '../languages/model/types.js';

/** Lowercase, without underscores, so `get_service`, `GetService`, and `getService` compare equal. */
export function normalizeName(name: string): string {
  return name.replace(/_/g, '').toLowerCase();
}

/** The smallest function or method that contains `line`, if any. */
export function enclosingUnit(file: AnalyzedFile, line: number): CodeUnit | undefined {
  let best: CodeUnit | undefined;
  for (const unit of file.units) {
    const contains = unit.startLine <= line && line <= unit.endLine;
    if (contains && (!best || unit.endLine - unit.startLine < best.endLine - best.startLine)) {
      best = unit;
    }
  }
  return best;
}

/** Folders that hold other people's code copied into the project. */
const VENDORED_FOLDERS = new Set([
  'vendor',
  'vendors',
  'vendored',
  'third_party',
  'third-party',
  'external',
  'site-packages',
]);

/** True for code under a vendored folder: not worked on here, so not worth ranking or documenting. */
export function isVendored(path: string): boolean {
  return path
    .toLowerCase()
    .split('/')
    .some((segment) => VENDORED_FOLDERS.has(segment));
}

/** Test code is written differently (many small test methods, mocks, fixtures); most rules skip it. */
const TEST_FOLDERS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', '__mocks__']);
const TEST_FILE = /(^test_)|(_tests?\.)|(\.(test|spec)\.)|(tests?\.[a-z]+$)/;

export function isTestFile(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const file = segments.pop() ?? '';
  return segments.some((segment) => TEST_FOLDERS.has(segment)) || TEST_FILE.test(file);
}
