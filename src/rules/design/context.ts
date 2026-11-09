import { isTestFile, isVendored } from '../shared.js';

export { enclosingUnit, isTestFile, normalizeName } from '../shared.js';

/**
 * Code the design rules leave alone: tests (written differently) and vendored code (someone else's,
 * and not the project's to restructure).
 */
export function isOutOfScope(path: string): boolean {
  return isTestFile(path) || isVendored(path);
}

/** "Class", "Struct", or "Record", for messages. */
export function classLabel(kind: 'class' | 'struct' | 'record'): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** A file that only gathers and re-exports other modules, so its imports say nothing about design. */
export function isBarrelFile(path: string): boolean {
  const file = (path.split('/').pop() ?? '').toLowerCase();
  return /^(index|__init__)\.[a-z]+$/.test(file);
}
