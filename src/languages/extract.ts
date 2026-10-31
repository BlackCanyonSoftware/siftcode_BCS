import type { Node } from 'web-tree-sitter';
import type { CodeUnit, UnitKind } from './model/types.js';
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

/** Finds every named function and method in a syntax tree. */
export function extractUnits(grammar: GrammarId, root: Node): CodeUnit[] {
  const units: CodeUnit[] = [];
  for (const node of root.descendantsOfType([...UNIT_NODE_TYPES[grammar]])) {
    const name = unitName(node);
    if (name !== undefined) {
      units.push({
        kind: unitKind(node),
        name,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }
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
    case 'function_definition':
      // Python: a function directly inside a class body is a method.
      return node.parent?.parent?.type === 'class_definition' ? 'method' : 'function';
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
