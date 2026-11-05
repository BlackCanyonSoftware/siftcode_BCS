import type { Node } from 'web-tree-sitter';
import type { PropFact, ValueFact } from '../model/types.js';
import type { GrammarId } from '../registry.js';

/** How one language writes strings, numbers, and concatenation. */
interface ValueSyntax {
  /** A string literal. Interpolated strings are told apart by their children. */
  readonly strings: ReadonlySet<string>;
  /** Children of a string literal that hold its fixed text. */
  readonly stringContent: ReadonlySet<string>;
  /** Children of a string literal that mean a value is spliced in. */
  readonly interpolations: ReadonlySet<string>;
  /** Adjacent literals that form one string (Python `"a" "b"`). */
  readonly joined: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly booleans: ReadonlySet<string>;
  readonly nulls: ReadonlySet<string>;
  /** The node type for `a + b`, and the operators on it that join strings. */
  readonly binary: string;
  readonly concatOperators: ReadonlySet<string>;
  /** Object or dictionary literal, and its entry node type. */
  readonly object?: readonly [type: string, entry: string];
  /** Dotted names: `a.b.c`. */
  readonly names: ReadonlySet<string>;
}

const JAVASCRIPT_LIKE: ValueSyntax = {
  strings: new Set(['string', 'template_string']),
  stringContent: new Set(['string_fragment']),
  interpolations: new Set(['template_substitution']),
  joined: new Set(),
  numbers: new Set(['number']),
  booleans: new Set(['true', 'false']),
  nulls: new Set(['null', 'undefined']),
  binary: 'binary_expression',
  concatOperators: new Set(['+']),
  object: ['object', 'pair'],
  names: new Set(['identifier', 'member_expression', 'this']),
};

const SYNTAX: Readonly<Record<GrammarId, ValueSyntax>> = {
  javascript: JAVASCRIPT_LIKE,
  typescript: JAVASCRIPT_LIKE,
  tsx: JAVASCRIPT_LIKE,
  python: {
    strings: new Set(['string']),
    stringContent: new Set(['string_content']),
    interpolations: new Set(['interpolation']),
    joined: new Set(['concatenated_string']),
    numbers: new Set(['integer', 'float']),
    booleans: new Set(['true', 'false']),
    nulls: new Set(['none']),
    binary: 'binary_operator',
    concatOperators: new Set(['+', '%']),
    object: ['dictionary', 'pair'],
    names: new Set(['identifier', 'attribute']),
  },
  csharp: {
    strings: new Set([
      'string_literal',
      'verbatim_string_literal',
      'raw_string_literal',
      'interpolated_string_expression',
    ]),
    stringContent: new Set(['string_literal_content', 'string_content']),
    interpolations: new Set(['interpolation']),
    joined: new Set(),
    numbers: new Set(['integer_literal', 'real_literal']),
    booleans: new Set(['boolean_literal']),
    nulls: new Set(['null_literal']),
    binary: 'binary_expression',
    concatOperators: new Set(['+']),
    names: new Set(['identifier', 'member_access_expression']),
  },
};

const MAX_TEXT = 300;

/** How deep expressions are followed: a hostile file nesting parentheses cannot go beyond this. */
const MAX_DEPTH = 40;

const truncate = (text: string): string =>
  text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;

const OTHER = (node: Node): ValueFact => ({ kind: 'other', text: truncate(node.text) });

/** The full text of a string literal, without its quotes, and whether a value is spliced into it. */
function readString(syntax: ValueSyntax, node: Node): { text: string; spliced: boolean } {
  let text = '';
  let spliced = false;
  let hasContent = false;
  for (const child of node.children) {
    if (syntax.stringContent.has(child.type)) {
      text += child.text;
      hasContent = true;
    } else if (syntax.interpolations.has(child.type)) {
      spliced = true;
    }
  }
  if (!hasContent && !spliced) {
    // `@"verbatim"` and `"""raw"""` literals have no content child: strip the quotes by hand.
    text = node.text.replace(/^[A-Za-z@$]*("""|'''|"|'|`)/, '').replace(/("""|'''|"|'|`)$/, '');
  }
  return { text, spliced };
}

/**
 * Describes an expression as a {@link ValueFact}: a constant or built string, a number, a name, an
 * object literal, or anything else. Long `a + b + c + ...` chains are flattened with a loop, and
 * nesting is cut off at a fixed depth, so hostile input cannot overflow the stack.
 */
export function describeValue(grammar: GrammarId, node: Node): ValueFact {
  return describe(SYNTAX[grammar], node, 0);
}

function unwrap(node: Node): Node {
  let current = node;
  while (current.type === 'parenthesized_expression' && current.namedChildren.length === 1) {
    current = current.namedChildren[0] ?? current;
  }
  return current;
}

/** Recognizes one kind of expression and describes it, or returns undefined if it is not that kind. */
type Describer = (syntax: ValueSyntax, node: Node, depth: number) => ValueFact | undefined;

const constantOf =
  (
    kind: 'number' | 'boolean' | 'null',
    types: (syntax: ValueSyntax) => ReadonlySet<string>,
  ): Describer =>
  (syntax, node) =>
    types(syntax).has(node.type) ? { kind, text: node.text } : undefined;

/** Tried in order; the first that recognizes the expression describes it. */
const DESCRIBERS: readonly Describer[] = [
  (syntax, node) => {
    if (!syntax.strings.has(node.type)) {
      return undefined;
    }
    const { text, spliced } = readString(syntax, node);
    return { kind: spliced ? 'dynamic-string' : 'string', text: truncate(text) };
  },
  (syntax, node, depth) =>
    syntax.joined.has(node.type)
      ? combine(node.namedChildren.map((part) => describe(syntax, part, depth + 1)))
      : undefined,
  (syntax, node, depth) =>
    node.type === syntax.binary ? describeBinary(syntax, node, depth) : undefined,
  constantOf('number', (syntax) => syntax.numbers),
  constantOf('boolean', (syntax) => syntax.booleans),
  constantOf('null', (syntax) => syntax.nulls),
  (syntax, node, depth) =>
    syntax.object?.[0] === node.type
      ? { kind: 'object', text: truncate(node.text), props: describeEntries(syntax, node, depth) }
      : undefined,
  (syntax, node) =>
    syntax.names.has(node.type) && /^[\w$.?]+$/.test(node.text)
      ? { kind: 'name', text: truncate(node.text.replace(/\?/g, '')) }
      : undefined,
  describeFormatCall,
];

function describe(syntax: ValueSyntax, raw: Node, depth: number): ValueFact {
  const node = unwrap(raw);
  if (depth > MAX_DEPTH) {
    return OTHER(node);
  }
  for (const describer of DESCRIBERS) {
    const value = describer(syntax, node, depth);
    if (value) {
      return value;
    }
  }
  return OTHER(node);
}

const operatorOf = (node: Node): string =>
  node.children.find((child) => !child.isNamed)?.type ?? '';

/** `a + b`, and in Python `"a%s" % b`: dynamic as soon as a string meets something not constant. */
function describeBinary(syntax: ValueSyntax, node: Node, depth: number): ValueFact {
  const operator = operatorOf(node);
  if (!syntax.concatOperators.has(operator)) {
    return OTHER(node);
  }
  // `((a + b) + c) + d` leans left: walk down the left side with a loop, collecting right sides.
  const operands: Node[] = [];
  let current: Node | null = node;
  while (current) {
    const inner = unwrap(current);
    const joins = inner.type === syntax.binary && operatorOf(inner) === operator;
    if (!joins) {
      operands.push(inner);
      break;
    }
    const right = inner.childForFieldName('right');
    if (right) {
      operands.push(right);
    }
    current = inner.childForFieldName('left');
  }
  const parts = operands.reverse().map((operand) => describe(syntax, operand, depth + 1));
  if (!parts.some((part) => part.kind === 'string' || part.kind === 'dynamic-string')) {
    return OTHER(node);
  }
  const combined = combine(parts);
  // Python's `%` formats its right side into the left string, so the result is never constant.
  return operator === '%' ? { kind: 'dynamic-string', text: combined.text } : combined;
}

/** Joins string parts: all constant gives a constant string, anything else a dynamic one. */
function combine(parts: readonly ValueFact[]): ValueFact {
  const constant = parts.every((part) => part.kind === 'string');
  const fixed = parts
    .filter((part) => part.kind === 'string' || part.kind === 'dynamic-string')
    .map((part) => part.text)
    .join('');
  return { kind: constant ? 'string' : 'dynamic-string', text: truncate(fixed) };
}

/** `"a{}".format(x)` in Python and `string.Format("a{0}", x)` in C#. */
function describeFormatCall(syntax: ValueSyntax, node: Node): ValueFact | undefined {
  const callee = node.childForFieldName('function');
  // Python: the receiver of `.format` is a string literal.
  const receiver = callee?.childForFieldName('object');
  if (
    receiver &&
    syntax.strings.has(receiver.type) &&
    callee?.childForFieldName('attribute')?.text === 'format'
  ) {
    return { kind: 'dynamic-string', text: truncate(readString(syntax, receiver).text) };
  }
  // C#: `string.Format("...", x)`, whose first argument is the format string.
  if (/^(string|String)\.Format$/.test(callee?.text ?? '')) {
    const first = node.childForFieldName('arguments')?.namedChildren[0]?.namedChildren.at(-1);
    if (first && syntax.strings.has(first.type)) {
      return { kind: 'dynamic-string', text: truncate(readString(syntax, first).text) };
    }
  }
  return undefined;
}

function describeEntries(syntax: ValueSyntax, object: Node, depth: number): PropFact[] {
  const entry = syntax.object?.[1];
  const props: PropFact[] = [];
  for (const child of object.namedChildren) {
    const key = child.childForFieldName('key');
    const value = child.childForFieldName('value');
    if (child.type === entry && key && value) {
      props.push({
        key: syntax.strings.has(key.type) ? readString(syntax, key).text : key.text,
        value: describe(syntax, value, depth + 1),
      });
    }
  }
  return props;
}
