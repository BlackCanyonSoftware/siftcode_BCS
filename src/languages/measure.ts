import type { Node } from 'web-tree-sitter';
import type { RawMeasure } from './model/formulas.js';
import type { GrammarId } from './registry.js';

/** What counts as a decision point and as a level of nesting, per language family. */
interface SyntaxSpec {
  /** Node types that each add one decision point (a branch, loop, case, catch, or condition). */
  readonly decisions: ReadonlySet<string>;
  /** Node types that open a level of nesting. */
  readonly nests: ReadonlySet<string>;
  /** Decision points that need more than the node type to recognize. */
  readonly extraDecision?: (node: Node) => boolean;
}

const JAVASCRIPT_LIKE: SyntaxSpec = {
  decisions: new Set([
    'if_statement',
    'for_statement',
    'for_in_statement',
    'while_statement',
    'do_statement',
    'switch_case',
    'catch_clause',
    'ternary_expression',
  ]),
  nests: new Set([
    'if_statement',
    'for_statement',
    'for_in_statement',
    'while_statement',
    'do_statement',
    'switch_statement',
    'try_statement',
  ]),
};

const PYTHON: SyntaxSpec = {
  decisions: new Set([
    'if_statement',
    'elif_clause',
    'for_statement',
    'while_statement',
    'except_clause',
    'except_group_clause',
    'conditional_expression',
    // comprehension parts and `case ... if` guards
    'for_in_clause',
    'if_clause',
  ]),
  nests: new Set([
    'if_statement',
    'for_statement',
    'while_statement',
    'match_statement',
    'try_statement',
  ]),
  // Every `case` except the wildcard `case _:`, which is the default branch.
  extraDecision: (node) => node.type === 'case_clause' && node.namedChildren[0]?.text !== '_',
};

const CSHARP: SyntaxSpec = {
  decisions: new Set([
    'if_statement',
    'for_statement',
    'foreach_statement',
    'while_statement',
    'do_statement',
    'catch_clause',
    'conditional_expression',
  ]),
  nests: new Set([
    'if_statement',
    'for_statement',
    'foreach_statement',
    'while_statement',
    'do_statement',
    'switch_statement',
    'try_statement',
  ]),
  extraDecision: (node) =>
    // each `case` label of a switch statement (not `default`), and each arm of a switch
    // expression except the discard `_ =>`
    (node.type === 'case' && node.parent?.type === 'switch_section') ||
    (node.type === 'switch_expression_arm' && node.namedChildren[0]?.type !== 'discard'),
};

const SPECS: Readonly<Record<GrammarId, SyntaxSpec>> = {
  javascript: JAVASCRIPT_LIKE,
  typescript: JAVASCRIPT_LIKE,
  tsx: JAVASCRIPT_LIKE,
  python: PYTHON,
  csharp: CSHARP,
};

/** Nodes that hold a short-circuit operator: `a && b`, `a or b`, `a ??= b`. */
const LOGICAL_HOLDERS = new Set([
  'binary_expression',
  'boolean_operator',
  'augmented_assignment_expression',
  'assignment_expression',
]);
const LOGICAL_OPERATORS = new Set(['&&', '||', '??', '&&=', '||=', '??=', 'and', 'or']);

/** Separators and grouping that carry no operation, so they are not counted as Halstead operators. */
const SEPARATORS = new Set(['(', ')', '{', '}', '[', ']', ',', ';', ':']);

/** Strings, regular expressions, and characters are one operand, however they are built inside. */
const ATOMIC_OPERAND = /string|regex|char(?:acter)?_literal/;

interface Frame {
  readonly node: Node;
  readonly nesting: number;
}

/**
 * Measures the code under `root` the same way for every language: McCabe cyclomatic complexity,
 * deepest control-structure nesting, Halstead counts, and lines of code.
 *
 * Walks with an explicit stack, not recursion, so deeply nested or machine-generated code cannot
 * overflow the call stack.
 */
export function measure(
  grammar: GrammarId,
  root: Node,
): RawMeasure & { readonly maxNesting: number } {
  const spec = SPECS[grammar];
  const operators = new Map<string, number>();
  const operands = new Map<string, number>();
  const codeRows = new Set<number>();
  let decisions = 0;
  let maxNesting = 0;

  const stack: Frame[] = [{ node: root, nesting: 0 }];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { node } = frame;
    if (node.type === 'comment') {
      continue;
    }

    if (isDecision(spec, node)) {
      decisions += 1;
    }

    const isToken = node.childCount === 0 || (node.isNamed && ATOMIC_OPERAND.test(node.type));
    if (isToken) {
      countToken(node, operators, operands, codeRows);
      continue;
    }

    let nesting = frame.nesting;
    if (spec.nests.has(node.type) && !isElseIf(node)) {
      nesting += 1;
      maxNesting = Math.max(maxNesting, nesting);
    }
    for (const child of node.children) {
      stack.push({ node: child, nesting });
    }
  }

  return {
    cyclomatic: 1 + decisions,
    maxNesting,
    codeLines: codeRows.size,
    halstead: {
      distinctOperators: operators.size,
      distinctOperands: operands.size,
      totalOperators: sum(operators),
      totalOperands: sum(operands),
    },
  };
}

function isDecision(spec: SyntaxSpec, node: Node): boolean {
  if (spec.decisions.has(node.type) || spec.extraDecision?.(node) === true) {
    return true;
  }
  return (
    LOGICAL_HOLDERS.has(node.type) &&
    node.children.some((child) => !child.isNamed && LOGICAL_OPERATORS.has(child.type))
  );
}

/** An `else if` continues a chain; it does not nest one level deeper than the `if` before it. */
function isElseIf(node: Node): boolean {
  if (node.type !== 'if_statement') {
    return false;
  }
  const parent = node.parent;
  if (parent?.type === 'else_clause') {
    return true; // JavaScript and TypeScript
  }
  // C#: the `else` branch is the parent `if`'s `alternative`
  return parent?.type === 'if_statement' && parent.childForFieldName('alternative')?.id === node.id;
}

function countToken(
  node: Node,
  operators: Map<string, number>,
  operands: Map<string, number>,
  codeRows: Set<number>,
): void {
  if (node.endIndex === node.startIndex) {
    return; // zero-width placeholder, not source text
  }
  for (let row = node.startPosition.row; row <= node.endPosition.row; row++) {
    codeRows.add(row);
  }
  if (node.isNamed) {
    increment(operands, node.text);
  } else if (!SEPARATORS.has(node.type)) {
    increment(operators, node.type);
  }
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sum(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}
