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
  'externals',
  '_vendor',
  '_vendored',
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
const TEST_FOLDERS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', '__mocks__']);
/** Dot-separated parts of a .NET project folder: `App.Tests`, `App.UnitTests`, `App.Tests.Benchmarks`. */
const TEST_PROJECT_PART = /^(?:(?:unit|integration|functional|acceptance|e2e)?tests?|benchmarks?)$/;
/** Names in any case style: `test_x.py`, `x_test.go`, `x.test.ts`, `test.py`. */
const TEST_FILE = /(^test_)|(_tests?\.)|(\.(test|spec)\.)|(^tests?\.[a-z]+$)/;
/** .NET names, which keep their capitals: `BillingTests.cs`, `BillingTester.cs` (but not `Contest.cs`). */
const TEST_CLASS_FILE = /[a-z0-9]Test(?:s|er)?\.[A-Za-z]+$/;
/** A project folder named like `AppTests`. */
const TEST_CLASS_FOLDER = /[a-z0-9]Tests?$/;

export function isTestFile(path: string): boolean {
  const segments = path.split('/');
  const file = segments.pop() ?? '';
  const inTestFolder = segments.some(
    (segment) =>
      TEST_FOLDERS.has(segment.toLowerCase()) ||
      TEST_CLASS_FOLDER.test(segment) ||
      segment
        .toLowerCase()
        .split('.')
        .some((part) => TEST_PROJECT_PART.test(part)),
  );
  return inTestFolder || TEST_FILE.test(file.toLowerCase()) || TEST_CLASS_FILE.test(file);
}
