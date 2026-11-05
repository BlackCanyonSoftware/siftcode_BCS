import type { Node } from 'web-tree-sitter';
import { measure } from './measure.js';
import { buildMetrics } from './model/formulas.js';
import type { CodeMetrics, CodeUnit, UnitKind } from './model/types.js';
import type { GrammarId } from './registry.js';

const JAVASCRIPT_LIKE = [
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'generator_function',
  'arrow_function',
  'method_definition',
];

/** Syntax-tree node types that define a function or method, per grammar. */
const UNIT_NODE_TYPES: Readonly<Record<GrammarId, readonly string[]>> = {
  javascript: JAVASCRIPT_LIKE,
  typescript: JAVASCRIPT_LIKE,
  tsx: JAVASCRIPT_LIKE,
  python: ['function_definition'],
  csharp: [
    'method_declaration',
    'constructor_declaration',
    'destructor_declaration',
    'local_function_statement',
    'operator_declaration',
  ],
};

const MAX_NAME_LENGTH = 100;

/** Measures a whole file. */
export function measureFile(grammar: GrammarId, root: Node): CodeMetrics {
  return buildMetrics(measure(grammar, root));
}

/** Finds every named function and method in a syntax tree and measures each one. */
export function extractUnits(grammar: GrammarId, root: Node): CodeUnit[] {
  const units: CodeUnit[] = [];
  for (const node of root.descendantsOfType([...UNIT_NODE_TYPES[grammar]])) {
    const name = unitName(node);
    if (name === undefined) {
      continue;
    }
    const kind = unitKind(node);
    const { maxNesting, ...raw } = measure(grammar, node);
    units.push({
      kind,
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      metrics: {
        ...buildMetrics(raw),
        parameters: countParameters(grammar, node, kind),
        maxNesting,
      },
    });
  }
  return units;
}

function unitKind(node: Node): UnitKind {
  switch (node.type) {
    case 'method_definition':
    case 'method_declaration':
    case 'constructor_declaration':
    case 'destructor_declaration':
    case 'operator_declaration':
      return 'method';
    case 'function_definition': {
      // Python: a function directly inside a class body is a method, decorated or not.
      const declaration = node.parent?.type === 'decorated_definition' ? node.parent : node;
      return declaration.parent?.parent?.type === 'class_definition' ? 'method' : 'function';
    }
    default:
      return 'function';
  }
}

/** The name a function is declared with, or the name it is assigned to; undefined if anonymous. */
function unitName(node: Node): string | undefined {
  const raw = node.childForFieldName('name')?.text ?? operatorName(node) ?? assignedName(node);
  if (raw === undefined) {
    return undefined;
  }
  const name = raw.replace(/\s+/g, ' ').trim();
  return name === '' ? undefined : name.slice(0, MAX_NAME_LENGTH);
}

function operatorName(node: Node): string | undefined {
  if (node.type !== 'operator_declaration') {
    return undefined;
  }
  // The symbol (`+`, `==`, ...) is the child right after the `operator` keyword.
  const keyword = node.children.findIndex((child) => child.type === 'operator');
  const symbol = keyword === -1 ? undefined : node.children[keyword + 1];
  return symbol ? `operator ${symbol.text}` : 'operator';
}

/** `const f = () => {}`, `{ f: () => {} }`, `f = function () {}`, and class fields. */
function assignedName(node: Node): string | undefined {
  const parent = node.parent;
  switch (parent?.type) {
    case 'variable_declarator':
      return parent.childForFieldName('name')?.text;
    case 'pair':
      return parent.childForFieldName('key')?.text;
    case 'assignment_expression':
      return parent.childForFieldName('left')?.text;
    case 'public_field_definition':
    case 'field_definition':
      return (parent.childForFieldName('name') ?? parent.childForFieldName('property'))?.text;
    default:
      return undefined;
  }
}

/** Parameter-list nodes that are not parameters. */
const NOT_PARAMETERS = new Set(['comment', 'positional_separator', 'keyword_separator']);

/**
 * Number of declared parameters. The receiver is not counted: Python's `self` or `cls`,
 * TypeScript's `this: T` pseudo-parameter, and C#'s `this` on an extension method.
 */
function countParameters(grammar: GrammarId, unit: Node, kind: UnitKind): number {
  // An arrow function with one bare parameter (`x => x`) has a `parameter` field, not a list.
  if (unit.childForFieldName('parameter')) {
    return 1;
  }
  const list = unit.childForFieldName('parameters');
  if (!list) {
    return 0;
  }
  const pythonMethod = grammar === 'python' && kind === 'method';
  return list.namedChildren.filter(
    (child, index) =>
      !NOT_PARAMETERS.has(child.type) &&
      !isTypeOfParamsParameter(grammar, list, child, index) &&
      !isReceiver(child, pythonMethod && index === 0),
  ).length;
}

/**
 * The C# grammar does not wrap `params int[] values` in a `parameter` node: its type and its name
 * sit loose in the parameter list. The name stands for the parameter; the type is not one.
 */
function isTypeOfParamsParameter(
  grammar: GrammarId,
  list: Node,
  child: Node,
  index: number,
): boolean {
  return (
    grammar === 'csharp' &&
    child.type !== 'parameter' &&
    list.fieldNameForNamedChild(index) !== 'name'
  );
}

/** `firstOfPythonMethod` is true only for the first parameter of a method in Python. */
function isReceiver(parameter: Node, firstOfPythonMethod: boolean): boolean {
  // TypeScript: `function f(this: Foo, ...)`
  if (parameter.childForFieldName('pattern')?.type === 'this') {
    return true;
  }
  // C#: `static int F(this Foo receiver, ...)`
  if (
    parameter.type === 'parameter' &&
    parameter.children.some((child) => child.type === 'modifier' && child.text === 'this')
  ) {
    return true;
  }
  // Python: the first parameter of a method, by convention `self` or `cls`
  if (firstOfPythonMethod) {
    const first = parameter.type === 'identifier' ? parameter : parameter.namedChildren[0];
    return first?.text === 'self' || first?.text === 'cls';
  }
  return false;
}
