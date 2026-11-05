import type { Node } from 'web-tree-sitter';
import type { NamedValueFact, StringFact } from '../model/types.js';
import type { GrammarId } from '../registry.js';
import { dottedName } from './calls.js';
import { describeValue } from './values.js';

/** Node types that give a name a value, per language. */
const NAMED_TYPES: Readonly<Record<GrammarId, readonly string[]>> = {
  javascript: ['variable_declarator', 'assignment_expression', 'pair', 'field_definition'],
  typescript: [
    'variable_declarator',
    'assignment_expression',
    'pair',
    'field_definition',
    'public_field_definition',
  ],
  tsx: [
    'variable_declarator',
    'assignment_expression',
    'pair',
    'field_definition',
    'public_field_definition',
  ],
  python: ['assignment', 'pair', 'keyword_argument'],
  csharp: ['variable_declarator', 'assignment_expression', 'argument', 'property_declaration'],
};

/** String-like node types whose content can be read as plain text. */
const STRING_TYPES: Readonly<Record<GrammarId, readonly string[]>> = {
  javascript: ['string', 'template_string'],
  typescript: ['string', 'template_string'],
  tsx: ['string', 'template_string'],
  python: ['string'],
  csharp: ['string_literal', 'verbatim_string_literal', 'raw_string_literal'],
};

/** The shortest string worth keeping: a secret or key block is not shorter than this. */
const MIN_STRING_LENGTH = 16;

/** The name and value of a node that gives a name a value, or undefined if it is not one. */
function nameAndValue(grammar: GrammarId, node: Node): { target: string; value: Node } | undefined {
  switch (node.type) {
    case 'variable_declarator':
    case 'field_definition':
    case 'public_field_definition':
    case 'property_declaration':
      return declared(grammar, node);
    case 'assignment_expression':
    case 'assignment':
      return assigned(grammar, node);
    case 'pair':
      return entry(grammar, node);
    case 'keyword_argument':
      return keyword(node);
    case 'argument':
      return namedArgument(node);
    default:
      return undefined;
  }
}

function declared(grammar: GrammarId, node: Node): { target: string; value: Node } | undefined {
  const nameNode = node.childForFieldName('name') ?? node.childForFieldName('property');
  if (nameNode?.type !== 'identifier' && nameNode?.type !== 'property_identifier') {
    return undefined; // a destructuring pattern, or a private name
  }
  // C# keeps the initializer as an unnamed child; the others name the field `value`.
  const value =
    node.childForFieldName('value') ??
    (grammar === 'csharp'
      ? node.namedChildren.find((child) => child.id !== nameNode.id)
      : undefined);
  return value ? { target: nameNode.text, value } : undefined;
}

/** `=`, and in C# `+=`, which is how event-style callbacks are attached (`Callback += delegate ...`). */
function isAssignmentOperator(grammar: GrammarId, operator: string | undefined): boolean {
  return operator === '=' || (grammar === 'csharp' && operator === '+=');
}

function assigned(grammar: GrammarId, node: Node): { target: string; value: Node } | undefined {
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  const operator = node.children.find((child) => !child.isNamed)?.type;
  if (!left || !right || !isAssignmentOperator(grammar, operator)) {
    return undefined;
  }
  // `process.env['X'] = ...` is written as an index; read it as `process.env.X`.
  if (left.type === 'subscript_expression') {
    const object = dottedName(grammar, left.childForFieldName('object'));
    const index = left.childForFieldName('index');
    const key = index ? describeValue(grammar, index) : undefined;
    return key?.kind === 'string' && object !== ''
      ? { target: `${object}.${key.text}`, value: right }
      : undefined;
  }
  const target = dottedName(grammar, left);
  return target === '' ? undefined : { target, value: right };
}

function entry(grammar: GrammarId, node: Node): { target: string; value: Node } | undefined {
  const key = node.childForFieldName('key');
  const value = node.childForFieldName('value');
  if (!key || !value) {
    return undefined;
  }
  const described = describeValue(grammar, key);
  const name = described.kind === 'string' ? described.text : key.text;
  return /^[\w$-]+$/.test(name) ? { target: name, value } : undefined;
}

function keyword(node: Node): { target: string; value: Node } | undefined {
  const name = node.childForFieldName('name')?.text;
  const value = node.childForFieldName('value');
  return name !== undefined && value ? { target: name, value } : undefined;
}

function namedArgument(node: Node): { target: string; value: Node } | undefined {
  const name = node.childForFieldName('name')?.text;
  const value = node.namedChildren.at(-1);
  return name !== undefined && value ? { target: name, value } : undefined;
}

/** Finds every place a name is given a value. */
export function extractNamedValues(grammar: GrammarId, root: Node): NamedValueFact[] {
  const facts: NamedValueFact[] = [];
  for (const node of root.descendantsOfType([...NAMED_TYPES[grammar]])) {
    const found = nameAndValue(grammar, node);
    if (found) {
      const value = describeValue(grammar, found.value);
      if (value.kind !== 'object') {
        const name = found.target.split('.').at(-1) ?? found.target;
        facts.push({ target: found.target, name, value, line: node.startPosition.row + 1 });
      }
    }
  }
  return facts;
}

/** Finds the constant string literals long enough to hold a secret or a key block. */
export function extractStrings(grammar: GrammarId, root: Node): StringFact[] {
  const strings: StringFact[] = [];
  for (const node of root.descendantsOfType([...STRING_TYPES[grammar]])) {
    const value = describeValue(grammar, node);
    if (value.kind === 'string' && value.text.length >= MIN_STRING_LENGTH) {
      strings.push({ value: value.text, line: node.startPosition.row + 1 });
    }
  }
  return strings;
}
