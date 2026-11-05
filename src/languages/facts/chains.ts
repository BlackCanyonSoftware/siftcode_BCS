import type { Node } from 'web-tree-sitter';
import type { MemberChain, MemberHop } from '../model/types.js';
import type { GrammarId } from '../registry.js';

/** The nodes that make up a chain in one language, and which child leads further down the chain. */
interface ChainSyntax {
  /** `a.b`: node type -> [field holding the object, field holding the member name]. */
  readonly members: Readonly<Record<string, readonly [field: string, name: string]>>;
  /** `f(...)`: node type -> field holding the callee. */
  readonly calls: Readonly<Record<string, string>>;
  /** `a[i]`: node type -> field holding the indexed object. */
  readonly indexes: Readonly<Record<string, string>>;
  /** Nodes with one child that continues the chain, such as TypeScript's `a!`. */
  readonly wrappers: ReadonlySet<string>;
  /** C# `a?.b`: node type -> field holding the object; the member name is in a binding child. */
  readonly conditional?: readonly [type: string, field: string];
}

const JAVASCRIPT_LIKE: ChainSyntax = {
  members: { member_expression: ['object', 'property'] },
  calls: { call_expression: 'function' },
  indexes: { subscript_expression: 'object' },
  wrappers: new Set(['non_null_expression']),
};

const SYNTAX: Readonly<Record<GrammarId, ChainSyntax>> = {
  javascript: JAVASCRIPT_LIKE,
  typescript: JAVASCRIPT_LIKE,
  tsx: JAVASCRIPT_LIKE,
  python: {
    members: { attribute: ['object', 'attribute'] },
    calls: { call: 'function' },
    indexes: { subscript: 'value' },
    wrappers: new Set(),
  },
  csharp: {
    members: { member_access_expression: ['expression', 'name'] },
    calls: { invocation_expression: 'function' },
    indexes: { element_access_expression: 'expression' },
    wrappers: new Set(),
    conditional: ['conditional_access_expression', 'condition'],
  },
};

/** Receivers that mean "the current object". */
const SELF_NAMES = new Set(['self', 'cls', 'this', 'super', 'base']);

/**
 * Finds every member-access chain: `a.b.c(d).e` is one chain with hops b, c, e. Only whole chains
 * are reported, not the shorter chains inside them. A chain without a member hop is not a chain.
 */
export function extractChains(grammar: GrammarId, root: Node): MemberChain[] {
  const syntax = SYNTAX[grammar];
  const types = [
    ...Object.keys(syntax.members),
    ...Object.keys(syntax.calls),
    ...Object.keys(syntax.indexes),
    ...syntax.wrappers,
    ...(syntax.conditional ? [syntax.conditional[0]] : []),
  ];

  const chains: MemberChain[] = [];
  for (const node of root.descendantsOfType(types)) {
    if (continuesChain(syntax, node)) {
      continue; // part of a longer chain that is reported from its outermost node
    }
    const chain = followChain(syntax, node);
    if (chain) {
      chains.push(chain);
    }
  }
  return chains;
}

/** True when `node` is the object or callee of the node above it, so it is not the chain's outermost. */
function continuesChain(syntax: ChainSyntax, node: Node): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  const field = leadingField(syntax, parent.type);
  if (field === undefined) {
    return false;
  }
  return field === null || parent.childForFieldName(field)?.id === node.id;
}

/** The field of `type` that leads down the chain; null for wrappers (their single child leads). */
function leadingField(syntax: ChainSyntax, type: string): string | null | undefined {
  if (syntax.wrappers.has(type)) {
    return null;
  }
  return (
    syntax.members[type]?.[0] ??
    syntax.calls[type] ??
    syntax.indexes[type] ??
    (syntax.conditional?.[0] === type ? syntax.conditional[1] : undefined)
  );
}

/** What is learned while walking from the outermost node of a chain down to its root. */
interface Walk {
  hops: MemberHop[];
  /** A call was passed and the next member hop is the one being called. */
  called: boolean;
  /** The node the chain starts from, once reached. */
  root: Node | null;
  /** The chain starts from a bare `this` or `base` token (C#), which has no node of its own. */
  thisToken: boolean;
}

function followChain(syntax: ChainSyntax, outermost: Node): MemberChain | undefined {
  const walk: Walk = { hops: [], called: false, root: null, thisToken: false };
  for (let node: Node | null = outermost; node;) {
    node = stepDown(syntax, node, walk);
  }
  if (walk.hops.length === 0) {
    return undefined;
  }
  return {
    ...describeRoot(walk),
    hops: walk.hops.reverse(),
    startLine: outermost.startPosition.row + 1,
    endLine: outermost.endPosition.row + 1,
  };
}

/** Takes one step toward the root and returns the next node, or null once the root is reached. */
function stepDown(syntax: ChainSyntax, node: Node, walk: Walk): Node | null {
  const type = node.type;
  const member = syntax.members[type];
  if (member) {
    return stepMember(node, member, walk);
  }
  const callee = syntax.calls[type];
  if (callee !== undefined) {
    walk.called = true;
    return node.childForFieldName(callee);
  }
  const indexed = syntax.indexes[type];
  if (indexed !== undefined) {
    return node.childForFieldName(indexed);
  }
  if (syntax.wrappers.has(type)) {
    return node.namedChildren[0] ?? null;
  }
  if (syntax.conditional?.[0] === type) {
    return stepConditional(node, syntax.conditional[1], walk);
  }
  walk.root = node;
  return null;
}

function stepMember(node: Node, [field, name]: readonly [string, string], walk: Walk): Node | null {
  walk.hops.push({ name: memberName(node.childForFieldName(name)), call: walk.called });
  walk.called = false;
  const next = node.childForFieldName(field);
  if (!next) {
    walk.thisToken = node.children.some((child) => SELF_NAMES.has(child.type)); // C# `this.x`
  }
  return next;
}

/** C# `a?.b`: the member name is in a binding child, the object in the condition. */
function stepConditional(node: Node, field: string, walk: Walk): Node | null {
  const binding = node.namedChildren.find((child) => child.type === 'member_binding_expression');
  if (binding) {
    walk.hops.push({ name: memberName(binding.childForFieldName('name')), call: walk.called });
    walk.called = false;
  }
  return node.childForFieldName(field);
}

/** `Foo` in `Foo.bar`, or `GetService` in `GetService<IFoo>` (a C# generic name). */
function memberName(node: Node | null): string {
  if (!node) {
    return '';
  }
  return (node.type === 'generic_name' ? node.namedChildren[0]?.text : undefined) ?? node.text;
}

function describeRoot(walk: Walk): Pick<MemberChain, 'root' | 'rootKind'> {
  const { root } = walk;
  if (walk.thisToken) {
    return { root: 'this', rootKind: 'self' };
  }
  if (!root) {
    return { root: '…', rootKind: 'other' };
  }
  if (root.type === 'this' || root.type === 'super' || SELF_NAMES.has(root.text)) {
    return { root: root.text, rootKind: 'self' };
  }
  const isName = root.type === 'identifier' || root.type === 'type_identifier';
  if (isName && !walk.called) {
    return { root: root.text, rootKind: 'name' };
  }
  // `f(...).a.b`: the chain starts from a call result.
  return { root: isName ? `${root.text}()` : '…', rootKind: 'other' };
}
