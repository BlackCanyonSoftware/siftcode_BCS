import type { GrammarId } from '../registry.js';

/**
 * The language-neutral view of a source file that rules run against. Language adapters fill it
 * from a syntax tree; rules never see tree-sitter types, so one rule works for every language.
 */
export interface CodeFile {
  /** Path relative to the scan root, with forward slashes. */
  readonly path: string;
  /** Name shown to users, e.g. "TypeScript". */
  readonly language: string;
  readonly grammar: GrammarId;
  readonly lineCount: number;
  readonly units: readonly CodeUnit[];
}

export type UnitKind = 'function' | 'method';

/**
 * A named function or method. Anonymous callbacks and lambdas are not units: they are measured as
 * part of the code that contains them. Lines are 1-based and inclusive.
 */
export interface CodeUnit {
  readonly kind: UnitKind;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
}
