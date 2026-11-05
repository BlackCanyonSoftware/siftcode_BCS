import type { Node } from 'web-tree-sitter';
import type { ArgumentFact, CallFact } from '../model/types.js';
import type { GrammarId } from '../registry.js';
import { describeValue } from './values.js';

/** The nodes that make a call in one language. */
interface CallSyntax {
  /** Call node type -> [field with the callee, field with the arguments, is it `new`]. */
  readonly calls: Readonly<Record<string, readonly [callee: string, args: string, isNew: boolean]>>;
  /** Member access: node type -> [field with the object, field with the member name]. */
  readonly member: readonly [type: string, field: string, name: string];
}

const JAVASCRIPT_LIKE: CallSyntax = {
  calls: {
    call_expression: ['function', 'arguments', false],
    new_expression: ['constructor', 'arguments', true],
  },
  member: ['member_expression', 'object', 'property'],
};

const SYNTAX: Readonly<Record<GrammarId, CallSyntax>> = {
  javascript: JAVASCRIPT_LIKE,
  typescript: JAVASCRIPT_LIKE,
  tsx: JAVASCRIPT_LIKE,
  python: {
    calls: { call: ['function', 'arguments', false] },
    member: ['attribute', 'object', 'attribute'],
  },
  csharp: {
    calls: {
      invocation_expression: ['function', 'arguments', false],
      object_creation_expression: ['type', 'arguments', true],
    },
    member: ['member_access_expression', 'expression', 'name'],
  },
};

/** The syntax of member access in `grammar`, shared with the named-value extraction. */
export function memberSyntax(grammar: GrammarId): CallSyntax['member'] {
  return SYNTAX[grammar].member;
}

/** `Foo` in `Foo.bar`, or `GetService` in `GetService<IFoo>`, or `Bar` in `Ns.Bar` (a C# type). */
export function simpleName(node: Node | null): string {
  if (!node) {
    return '';
  }
  if (node.type === 'generic_name') {
    return node.namedChildren[0]?.text ?? node.text;
  }
  if (node.type === 'qualified_name') {
    return simpleName(node.childForFieldName('name'));
  }
  return node.text;
}

/**
 * The dotted text of a name chain, `a.b.c`, with `…` where the chain starts from something that is
 * not a plain name (a call result, a literal). Walks with a loop.
 */
export function dottedName(grammar: GrammarId, node: Node | null): string {
  const [type, objectField, nameField] = memberSyntax(grammar);
  const parts: string[] = [];
  let current = node;
  while (current?.type === type) {
    parts.push(simpleName(current.childForFieldName(nameField)));
    current = current.childForFieldName(objectField);
  }
  const root = current ? (/^[\w$]+$/.test(current.text) ? current.text : '…') : '';
  return [root, ...parts.reverse()].filter((part) => part !== '').join('.');
}

/** Splits a callee into the receiver and the final name; undefined when it is not a plain callee. */
function calleeParts(
  grammar: GrammarId,
  callee: Node,
): { name: string; receiver: string } | undefined {
  const [type, objectField, nameField] = memberSyntax(grammar);
  if (callee.type === type) {
    const name = simpleName(callee.childForFieldName(nameField));
    return name === ''
      ? undefined
      : { name, receiver: dottedName(grammar, callee.childForFieldName(objectField)) };
  }
  if (callee.type === 'import' || callee.type === 'parenthesized_expression') {
    return undefined;
  }
  const name = simpleName(callee);
  return /^[\w$]+$/.test(name) ? { name, receiver: '' } : undefined;
}

/** One argument: positional, or named (`shell=True`, `password: "x"`). */
function describeArgument(grammar: GrammarId, node: Node): ArgumentFact {
  if (node.type === 'keyword_argument') {
    const value = node.childForFieldName('value');
    return {
      name: node.childForFieldName('name')?.text ?? '',
      value: describeValue(grammar, value ?? node),
    };
  }
  if (node.type === 'argument') {
    // C#: `argument` wraps the expression, with an optional `name:` before it.
    const name = node.childForFieldName('name')?.text;
    const value = node.namedChildren.at(-1) ?? node;
    return name === undefined
      ? { value: describeValue(grammar, value) }
      : { name, value: describeValue(grammar, value) };
  }
  return { value: describeValue(grammar, node) };
}

/** Finds every function call and object creation, with the shape of its arguments. */
export function extractCalls(grammar: GrammarId, root: Node): CallFact[] {
  const syntax = SYNTAX[grammar];
  const calls: CallFact[] = [];
  for (const node of root.descendantsOfType(Object.keys(syntax.calls))) {
    const [calleeField, argsField, isNew] = syntax.calls[node.type] ?? ['', '', false];
    const callee = node.childForFieldName(calleeField);
    const argsNode = node.childForFieldName(argsField);
    // A tagged template (sql`...${x}`) is a call whose "arguments" is the template: it is how
    // values are passed safely, so it is not an ordinary call.
    if (!callee || argsNode?.type === 'template_string') {
      continue;
    }
    const parts = calleeParts(grammar, callee);
    if (!parts) {
      continue;
    }
    calls.push({
      callee: parts.receiver === '' ? parts.name : `${parts.receiver}.${parts.name}`,
      name: parts.name,
      receiver: parts.receiver,
      isNew,
      args: (argsNode?.namedChildren ?? [])
        .filter((child) => child.type !== 'comment')
        .map((child) => describeArgument(grammar, child)),
      line: node.startPosition.row + 1,
    });
  }
  return calls;
}
