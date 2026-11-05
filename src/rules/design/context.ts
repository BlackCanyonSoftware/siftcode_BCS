import type { AnalyzedFile, CodeUnit } from '../../languages/model/types.js';

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

/** "Class", "Struct", or "Record", for messages. */
export function classLabel(kind: 'class' | 'struct' | 'record'): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Test code is written differently (many small test methods, mocks, wide imports); design rules skip it. */
const TEST_FOLDERS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', '__mocks__']);
const TEST_FILE = /(^test_)|(_tests?\.)|(\.(test|spec)\.)|(tests?\.[a-z]+$)/;

export function isTestFile(path: string): boolean {
  const segments = path.toLowerCase().split('/');
  const file = segments.pop() ?? '';
  return segments.some((segment) => TEST_FOLDERS.has(segment)) || TEST_FILE.test(file);
}

/** A file that only gathers and re-exports other modules, so its imports say nothing about design. */
export function isBarrelFile(path: string): boolean {
  const file = (path.split('/').pop() ?? '').toLowerCase();
  return /^(index|__init__)\.[a-z]+$/.test(file);
}
