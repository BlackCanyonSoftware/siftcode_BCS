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
  /** Physical lines, not counting the empty "line" after a trailing newline. */
  readonly lineCount: number;
  /** Measurements of the whole file. */
  readonly metrics: CodeMetrics;
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
  readonly metrics: UnitMetrics;
}

/** Raw Halstead counts: operators are keywords and operator symbols, operands are names and literals. */
export interface HalsteadCounts {
  readonly distinctOperators: number;
  readonly distinctOperands: number;
  readonly totalOperators: number;
  readonly totalOperands: number;
}

/** Halstead's software-science measures, derived from the counts. */
export interface HalsteadMetrics extends HalsteadCounts {
  /** n = distinct operators + distinct operands */
  readonly vocabulary: number;
  /** N = total operators + total operands */
  readonly length: number;
  /** V = N * log2(n) */
  readonly volume: number;
  /** D = (distinct operators / 2) * (total operands / distinct operands) */
  readonly difficulty: number;
  /** E = D * V */
  readonly effort: number;
}

/**
 * What is measured about any stretch of code (a function or a whole file). A nested function is
 * part of the code around it, so its decisions and tokens count toward the enclosing function too.
 */
export interface CodeMetrics {
  /** Lines containing at least one token other than a comment. */
  readonly codeLines: number;
  /** McCabe cyclomatic complexity: 1 plus the number of decision points. */
  readonly cyclomatic: number;
  readonly halstead: HalsteadMetrics;
  /** 0 (hard to maintain) to 100 (easy), Visual Studio's variant of the Maintainability Index. */
  readonly maintainabilityIndex: number;
}

export interface UnitMetrics extends CodeMetrics {
  /** Declared parameters, not counting a receiver (`self`, `cls`, TypeScript `this`, C# `this`). */
  readonly parameters: number;
  /** Deepest nesting of control structures (`else if` does not add a level). 0 means none. */
  readonly maxNesting: number;
}
