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
  /** Named classes, structs, and records, with the facts the design rules use. */
  readonly classes: readonly ClassFact[];
}

/**
 * A file as rules see it: the summary plus facts that are only needed while rules run (every
 * import and member-access chain), which are dropped afterwards to keep reports small.
 */
export interface AnalyzedFile extends CodeFile {
  readonly facts: FileFacts;
}

export interface FileFacts {
  readonly imports: readonly ImportFact[];
  readonly chains: readonly MemberChain[];
}

/** One module a file depends on. */
export interface ImportFact {
  /** The module as written: `lodash`, `./util`, `os.path`, `..pkg`, `System.IO`. */
  readonly module: string;
  /** Names the import makes available (for a C# `using`, the namespace's first segment). */
  readonly bindings: readonly string[];
  readonly line: number;
}

/** One step along a chain: `.name` or `.name(...)`. */
export interface MemberHop {
  readonly name: string;
  /** True when the member is called, as in `.name(...)`. */
  readonly call: boolean;
}

/**
 * An expression that follows members from one object to another, such as
 * `order.customer.address.city` or `repo.find(id).owner.name()`. Calls and indexing in the middle
 * are part of the chain; only the member hops are recorded.
 */
export interface MemberChain {
  /** What the chain starts from: a name, `this` or `self`, `f()` for a call result, or `…`. */
  readonly root: string;
  readonly rootKind: 'name' | 'self' | 'other';
  /** In reading order, nearest the root first. Never empty. */
  readonly hops: readonly MemberHop[];
  readonly startLine: number;
  readonly endLine: number;
}

export type ClassKind = 'class' | 'struct' | 'record';

export interface ClassFact {
  readonly name: string;
  readonly kind: ClassKind;
  readonly startLine: number;
  readonly endLine: number;
  /** Methods, including static ones; not constructors. */
  readonly methods: number;
  /** Fields and properties (and, in Python and JavaScript, attributes assigned through `this`/`self`). */
  readonly fields: number;
  readonly cohesion: ClassCohesion;
}

/**
 * How well a class's instance methods work together (LCOM4). Only methods that use the class's own
 * state, or are used by one that does, take part. `components` is how many separate groups they
 * form when methods that touch the same member are joined: 1 is cohesive, 2 or more means the class
 * holds groups that do not share state.
 */
export interface ClassCohesion {
  readonly methods: number;
  readonly components: number;
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
